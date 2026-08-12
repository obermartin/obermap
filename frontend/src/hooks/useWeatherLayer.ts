import { useEffect, useCallback } from 'react';
import type { AppSettings } from '../types';
import { fetchOpenMeteo } from '../utils/weatherUtils';
import { WIND_POINTS, WIND_BATCH_SIZE, WIND_BATCH_DELAY_MS, WIND_REFRESH_INTERVAL_MS, WIND_MIN_OPEN_REFRESH_DELAY_MS } from '../utils/windUtils';

interface UseWeatherLayerProps {
  mapRef: React.MutableRefObject<maplibregl.Map | null>;
  mapLoaded: boolean;
  settings: AppSettings;
  weatherAllValidTimesRef: React.MutableRefObject<string[]>;
  setWeatherValidTimes: React.Dispatch<React.SetStateAction<string[]>>;
  windLastFetchRef: React.MutableRefObject<number>;
  windFetchInFlightRef: React.MutableRefObject<boolean>;
  setWindGeojson: React.Dispatch<React.SetStateAction<GeoJSON.FeatureCollection<GeoJSON.Point> | null>>;
}

export function useWeatherLayer({
  mapRef,
  mapLoaded,
  settings,
  weatherAllValidTimesRef,
  setWeatherValidTimes,
  windLastFetchRef,
  windFetchInFlightRef,
  setWindGeojson
}: UseWeatherLayerProps) {
  // Fetch valid times for weather tiles
  useEffect(() => {
    const weatherLayer = settings.layers.find(l => l.type === 'weather_forecast');
    if (weatherLayer && weatherLayer.visible) {
      fetch('https://map-tiles.open-meteo.com/data_spatial/dwd_icon/latest.json')
        .then(res => res.json())
        .then(data => {
          if (data && data.valid_times) {
            weatherAllValidTimesRef.current = data.valid_times;
            const byDate = new Map<string, string[]>();
            data.valid_times.forEach((time: string) => {
              const date = time.split('T')[0];
              if (!byDate.has(date)) byDate.set(date, []);
              byDate.get(date)!.push(time);
            });
            const bestDailyTimes: string[] = [];
            byDate.forEach((times) => {
              const noon = times.find((t: string) => t.includes('T12:00'));
              bestDailyTimes.push(noon || times[0]);
            });
            setWeatherValidTimes(bestDailyTimes);
          }
        })
        .catch(err => console.error("Failed to fetch Open-Meteo metadata", err));
    }
  }, [settings.layers, weatherAllValidTimesRef, setWeatherValidTimes]);

  const applyWindGeojson = useCallback((payload: any) => {
    const map = mapRef.current;
    const geojson = payload?.geojson as GeoJSON.FeatureCollection<GeoJSON.Point> | undefined;
    if (!map || !geojson) return false;

    const source = map.getSource('weather-wind') as maplibregl.GeoJSONSource | undefined;
    if (!source) return false;

    source.setData(geojson);
    windLastFetchRef.current = payload.createdAt ? new Date(payload.createdAt).getTime() : Date.now();
    (window as any).__windGeojson = geojson;
    setWindGeojson(geojson);
    return true;
  }, [mapRef, windLastFetchRef, setWindGeojson]);

  const loadWindCache = useCallback(async (cacheId?: string) => {
    try {
      const url = cacheId
        ? `./api.php?action=weather_wind_cache&cacheId=${encodeURIComponent(cacheId)}`
        : './api.php?action=weather_wind_cache';
      const res = await fetch(url);
      if (res.status === 404) return false;
      if (!res.ok) throw new Error(`Weather cache read failed: ${res.statusText}`);
      const data = await res.json();
      if (data && data.geojson && data.geojson.features && data.geojson.features.length > 0) {
        const firstFeature = data.geojson.features[0];
        if (!firstFeature.properties || !firstFeature.properties.dailyTime) {
          return false;
        }
      }
      return applyWindGeojson(data);
    } catch (err) {
      console.warn('Failed to read project Open-Meteo wind cache:', err);
      return false;
    }
  }, [applyWindGeojson]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    const windLayer = settings.layers.find(l => l.type === 'weather_forecast');
    if (!windLayer || !windLayer.visible) return;

    let isActive = true;
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    const openedAt = Date.now();

    const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

    const writeWindCache = async (geojson: GeoJSON.FeatureCollection<GeoJSON.Point>) => {
      try {
        const res = await fetch('./api.php?action=weather_wind_cache', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            geojson
          })
        });
        if (!res.ok) throw new Error(`Weather cache write failed: ${res.statusText}`);
        const result = await res.json();
        return result;
      } catch (err) {
        console.warn('Failed to write project Open-Meteo wind cache:', err);
        return null;
      }
    };

    const fetchWind = async (force = false) => {
      if (!force && Date.now() - windLastFetchRef.current < WIND_REFRESH_INTERVAL_MS) return;
      if (windFetchInFlightRef.current) return;

      const source = map.getSource('weather-wind') as maplibregl.GeoJSONSource | undefined;
      if (!source) return;

      windFetchInFlightRef.current = true;
      windLastFetchRef.current = Date.now(); // Set immediately to prevent rapid retries on failure
      try {
        const features: GeoJSON.Feature<GeoJSON.Point>[] = [];

        for (let i = 0; i < WIND_POINTS.length; i += WIND_BATCH_SIZE) {
          if (i > 0) {
            await delay(WIND_BATCH_DELAY_MS);
          }
          if (!isActive) return;

          const batch = WIND_POINTS.slice(i, i + WIND_BATCH_SIZE);
          const latitude = batch.map(point => point.lat).join(',');
          const longitude = batch.map(point => point.lon).join(',');
          const params = new URLSearchParams({
            latitude,
            longitude,
            daily: 'wind_speed_10m_max,wind_direction_10m_dominant,wind_gusts_10m_max',
            forecast_days: '8',
            timezone: 'UTC',
            wind_speed_unit: 'kmh'
          });
          const res = await fetchOpenMeteo(`https://api.open-meteo.com/v1/forecast?${params.toString()}`);
          if (!res.ok) throw new Error(`Open-Meteo wind request failed: ${res.statusText}`);

          const data = await res.json();
          if (!isActive) return;
          const responses = Array.isArray(data) ? data : batch.map(() => data);
          batch.forEach((point, index) => {
            const response = responses[index];
            const daily = response.daily || {};
            features.push({
              type: 'Feature',
              geometry: {
                type: 'Point',
                coordinates: [point.lon, point.lat]
              },
              properties: {
                id: point.id,
                dailyTime: JSON.stringify(daily.time || []),
                windSpeedDaily: JSON.stringify(daily.wind_speed_10m_max || []),
                windDirectionDaily: JSON.stringify(daily.wind_direction_10m_dominant || []),
                windGustDaily: JSON.stringify(daily.wind_gusts_10m_max || [])
              }
            });
          });
          
          if (features.length > 0) {
            applyWindGeojson({
              cacheId: null,
              createdAt: new Date().toISOString(),
              geojson: { type: 'FeatureCollection', features: [...features] }
            });
          }
        }

        const geojson: GeoJSON.FeatureCollection<GeoJSON.Point> = {
          type: 'FeatureCollection',
          features
        };
        const cacheResult = await writeWindCache(geojson);
        applyWindGeojson({ cacheId: cacheResult?.cacheId || null, createdAt: new Date().toISOString(), geojson });
      } catch (err) {
        console.warn('Failed to update Open-Meteo wind layer:', err);
      } finally {
        windFetchInFlightRef.current = false;
      }
    };

    const getNextHourlyRefreshTime = () => {
      const now = Date.now();
      const nextHour = new Date(now);
      nextHour.setMinutes(0, 0, 0);
      nextHour.setHours(nextHour.getHours() + 1);

      const nextHourTime = nextHour.getTime();
      const alignedRefreshTime = nextHourTime - now < WIND_MIN_OPEN_REFRESH_DELAY_MS
        ? nextHourTime + WIND_REFRESH_INTERVAL_MS
        : nextHourTime;
      const cacheEligibleTime = windLastFetchRef.current + WIND_REFRESH_INTERVAL_MS;

      return Math.max(alignedRefreshTime, cacheEligibleTime, openedAt + WIND_MIN_OPEN_REFRESH_DELAY_MS);
    };

    const scheduleHourlyRefresh = () => {
      if (!isActive) return;
      if (refreshTimer) clearTimeout(refreshTimer);

      const delayMs = Math.max(0, getNextHourlyRefreshTime() - Date.now());
      refreshTimer = setTimeout(async () => {
        await fetchWind(false);
        scheduleHourlyRefresh();
      }, delayMs);
    };

    const handleManualRefresh = () => fetchWind(false);
    window.addEventListener('refreshWindLayer', handleManualRefresh);
    loadWindCache().then(hasCache => {
      if (!isActive) return;
      if (!hasCache) {
        fetchWind(true).finally(scheduleHourlyRefresh);
      } else {
        const isExpired = Date.now() - windLastFetchRef.current > WIND_REFRESH_INTERVAL_MS;
        if (isExpired) {
          fetchWind(true).finally(scheduleHourlyRefresh);
        } else {
          scheduleHourlyRefresh();
        }
      }
    });

    return () => {
      isActive = false;
      if (refreshTimer) clearTimeout(refreshTimer);
      window.removeEventListener('refreshWindLayer', handleManualRefresh);
    };
  }, [mapLoaded, settings.layers, mapRef, applyWindGeojson, loadWindCache, windLastFetchRef, windFetchInFlightRef]);

  return { loadWindCache, applyWindGeojson };
}
