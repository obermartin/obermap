import { useEffect } from 'react';
import type { BaseLayerVisibilityProps } from './types';

export interface WeatherVisibilityProps extends BaseLayerVisibilityProps {
  setLayerFade: (id: string, type: string, isVisible: boolean, maxOpacity?: number, sidebarVisible?: boolean) => void;
  selectedWeatherTime: string | null;
  weatherValidTimes: string[];
  weatherForecastLayerIdsRef: React.MutableRefObject<string[]>;
  weatherForecastSourceIdsRef: React.MutableRefObject<string[]>;
  lastActiveWeatherTimeRef: React.MutableRefObject<string | null>;
  weatherAllValidTimesRef: React.MutableRefObject<string[]>;
  windLastFetchRef: React.MutableRefObject<number>;
  mapStyleTick?: number;
}

export const useWeatherVisibility = (props: WeatherVisibilityProps) => {
  const {
    map, mapLoaded, mapStyleLoaded, mapStyleTick, layers, firstAdminId, setLayerFade,
    selectedWeatherTime, weatherValidTimes, weatherForecastLayerIdsRef,
    weatherForecastSourceIdsRef, lastActiveWeatherTimeRef, weatherAllValidTimesRef,
    windLastFetchRef
  } = props;

  useEffect(() => {
    if (!map || !mapLoaded || !mapStyleLoaded || !(map as any)._loaded || !(map as any).style || !(map as any).style._loaded || !firstAdminId) return;

    const weatherLayers = layers.filter(l => l.type === 'weather_forecast');
    if (weatherLayers.length === 0) return;

    const layer = weatherLayers[0]; // Currently only supports one weather layer
    const sourceId = `dynamic-source-${layer.id}`;
    const layerId = `dynamic-layer-${layer.id}`;

    const currentActiveTime = selectedWeatherTime || 'current_time_1H';
    
    const timesToLoadSet = new Set<string>();
    timesToLoadSet.add(currentActiveTime);
    
    if (lastActiveWeatherTimeRef.current && lastActiveWeatherTimeRef.current !== currentActiveTime) {
      timesToLoadSet.add(lastActiveWeatherTimeRef.current);
    }
    lastActiveWeatherTimeRef.current = currentActiveTime;
    
    const activeIndex = weatherValidTimes.indexOf(currentActiveTime);
    if (activeIndex !== -1) {
      for (let i = activeIndex - 1; i <= activeIndex + 2; i++) {
        if (i >= 0 && i < weatherValidTimes.length) {
          timesToLoadSet.add(weatherValidTimes[i]);
        }
      }
    }
    
    const timesToLoad = Array.from(timesToLoadSet);

    const newLayerIds: string[] = [];
    const newSourceIds: string[] = [];

    timesToLoad.forEach((time) => {
      const timeSuffix = time.replace(/[:T-]/g, '');
      const tempSourceId = `${sourceId}-temp-${timeSuffix}`;
      const precipSourceId = `${sourceId}-precip-${timeSuffix}`;
      const tempLayerId = `${layerId}-temp-${timeSuffix}`;
      const precipLayerId = `${layerId}-precip-${timeSuffix}`;
      
      newLayerIds.push(tempLayerId, precipLayerId);
      newSourceIds.push(tempSourceId, precipSourceId);
      
      let timeStepParam = 'time_step=current_time_1H';
      if (time !== 'current_time_1H') {
        const index = weatherAllValidTimesRef.current.indexOf(time);
        timeStepParam = index !== -1 ? `time_step=valid_times_${index}` : `time_step=${time}`;
      }
      const baseUrl = `https://map-tiles.open-meteo.com/data_spatial/dwd_icon/latest.json?${timeStepParam}`;
      const tempUrl = `om://${baseUrl}&variable=temperature_2m`;
      const precipUrl = `om://${baseUrl}&variable=precipitation`;
      
      if (layer.showTemperature && !map.getSource(tempSourceId)) {
        map.addSource(tempSourceId, { type: 'raster', url: tempUrl, maxzoom: 12 } as any);
      }
      if (layer.showPrecipitation && !map.getSource(precipSourceId)) {
        map.addSource(precipSourceId, { type: 'raster', url: precipUrl, maxzoom: 12 } as any);
      }

      if (!layer.showTemperature && map.getSource(tempSourceId)) {
        if (map.getLayer(tempLayerId)) map.removeLayer(tempLayerId);
        map.removeSource(tempSourceId);
      }
      if (!layer.showPrecipitation && map.getSource(precipSourceId)) {
        if (map.getLayer(precipLayerId)) map.removeLayer(precipLayerId);
        map.removeSource(precipSourceId);
      }
      
      if (layer.showTemperature && map.getSource(tempSourceId) && !map.getLayer(tempLayerId)) {
        map.addLayer({
          id: tempLayerId,
          type: 'raster',
          source: tempSourceId,
          layout: { visibility: layer.visible ? 'visible' : 'none' },
          paint: { 'raster-opacity': 0 }
        }, firstAdminId);
      }
      if (layer.showPrecipitation && map.getSource(precipSourceId) && !map.getLayer(precipLayerId)) {
        map.addLayer({
          id: precipLayerId,
          type: 'raster',
          source: precipSourceId,
          layout: { visibility: layer.visible ? 'visible' : 'none' },
          paint: { 'raster-opacity': 0 }
        }, firstAdminId);
      }
      
      const isActive = time === currentActiveTime;
      const targetOpacity = isActive ? (layer.opacity ?? 0.75) : 0;
      
      if (map.getLayer(tempLayerId)) {
        map.setLayoutProperty(tempLayerId, 'visibility', layer.visible ? 'visible' : 'none');
        setLayerFade(tempLayerId, 'raster', layer._effectiveOpacityVisible ?? true, targetOpacity, layer.visible);
      }
      if (map.getLayer(precipLayerId)) {
        map.setLayoutProperty(precipLayerId, 'visibility', layer.visible ? 'visible' : 'none');
        setLayerFade(precipLayerId, 'raster', layer._effectiveOpacityVisible ?? true, targetOpacity, layer.visible);
      }
    });

    weatherForecastLayerIdsRef.current.forEach((id: string) => {
      if (!newLayerIds.includes(id)) {
        if (map.getLayer(id)) map.removeLayer(id);
      }
    });
    weatherForecastSourceIdsRef.current.forEach((id: string) => {
      if (!newSourceIds.includes(id)) {
        if (map.getSource(id)) map.removeSource(id);
      }
    });
    
    weatherForecastLayerIdsRef.current = newLayerIds;
    weatherForecastSourceIdsRef.current = newSourceIds;

  }, [map, mapLoaded, mapStyleLoaded, mapStyleTick, layers, firstAdminId, selectedWeatherTime, weatherValidTimes, setLayerFade]);

  // Handle Wind Particles Setup
  useEffect(() => {
    if (!map || !mapLoaded || !mapStyleLoaded || !(map as any)._loaded || !(map as any).style || !(map as any).style._loaded) return;
    
    const wantsWind = layers.find(l => l.type === 'weather_forecast' && l.showWindParticles !== false);
    if (!wantsWind) {
      if (map.getSource('weather-wind')) {
        if (map.getLayer('weather-wind-arrows')) map.removeLayer('weather-wind-arrows');
        map.removeSource('weather-wind');
      }
      windLastFetchRef.current = 0;
    } else {
      if (!map.getSource('weather-wind')) {
        map.addSource('weather-wind', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      }
    }
  }, [map, mapLoaded, mapStyleLoaded, mapStyleTick, layers]);
};
