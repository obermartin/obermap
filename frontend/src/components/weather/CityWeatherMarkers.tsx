import React, { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import type { MapLayer } from '../../types';
import { fetchOpenMeteo } from '../../utils/weatherUtils';

interface CityWeatherMarkersProps {
  map: maplibregl.Map | null;
  mapLoaded: boolean;
  weatherLayer: MapLayer | undefined;
  selectedWeatherTime: string | null;
  weatherValidTimes: string[];
}

export const CityWeatherMarkers: React.FC<CityWeatherMarkersProps> = ({
  map,
  mapLoaded,
  weatherLayer,
  selectedWeatherTime,
  weatherValidTimes,
}) => {
  const [weatherCityData, setWeatherCityData] = useState<{ [name: string]: { temps: number[], codes: number[], times: string[], x: number, y: number, name: string } }>({});
  const weatherCityFetchCacheRef = useRef<Set<string>>(new Set());
  const weatherCityMarkersRef = useRef<{ [name: string]: maplibregl.Marker }>({});

  // Fetch weather data for visible cities
  useEffect(() => {
    if (!map || !mapLoaded) return;

    if (!weatherLayer || !weatherLayer.visible || (weatherLayer.showCityTemperatures === false && weatherLayer.showCityWeatherIcons === false)) return;

    let isActive = true;

    const updateCities = async () => {
      if (!isActive) return;
      
      let features = [] as any[];
      try {
        const style = map.getStyle();
        if (!style || !style.layers) return;
        
        const placeLayers = style.layers.filter(l => 
          (l.id.includes('place') || l.id.includes('settlement') || l.id.includes('city') || l.id.includes('town') || l.id.includes('village')) 
          && l.type === 'symbol'
        ).map(l => l.id);

        if (placeLayers.length === 0) return;
        
        features = map.queryRenderedFeatures({ layers: placeLayers });
      } catch (e) {
        // If the layers don't exist in the current style, do nothing
        return;
      }
      
      if (features.length === 0) return;

      const citiesToFetch = new Map<string, { x: number, y: number, name: string }>();
      
      for (const f of features) {
        if (!f.properties || !f.properties.name) continue;
        const name = f.properties.name;
        
        if (weatherCityFetchCacheRef.current.has(name)) continue;
        
        if (f.geometry.type === 'Point') {
          const coords = f.geometry.coordinates as [number, number];
          const x = coords[0];
          const y = coords[1];
          
          if (weatherLayer.limitCityWeatherToGermany) {
            if (x < 5.86 || x > 15.04 || y < 47.27 || y > 55.08) continue;
            
            const EXCLUDED_NON_GERMAN_CITIES = new Set([
              'Prague', 'Prag', 'Praha', 'Plzeň', 'Karlovy Vary', 'Ústí nad Labem', 'Liberec', 'Děčín', 'České Budějovice',
              'Salzburg', 'Linz', 'Innsbruck', 'Bregenz', 'Vienna', 'Wien',
              'Zürich', 'Zurich', 'Basel', 'St. Gallen', 'Winterthur', 'Schaffhausen', 'Bern',
              'Strasbourg', 'Straßburg', 'Mulhouse', 'Colmar', 'Metz', 'Nancy',
              'Luxembourg', 'Luxemburg',
              'Liège', 'Lüttich', 'Brussels', 'Brüssel',
              'Maastricht', 'Eindhoven', 'Enschede', 'Groningen', 'Amsterdam', 'Rotterdam',
              'Szczecin', 'Stettin', 'Zielona Góra', 'Gorzów Wielkopolski', 'Poznań', 'Posen', 'Wrocław', 'Breslau',
              'Odense', 'Copenhagen', 'Kopenhagen'
            ]);
            
            if (EXCLUDED_NON_GERMAN_CITIES.has(name)) continue;
            
            // Also check standard ISO properties if present
            if (f.properties.iso_a2 && f.properties.iso_a2 !== 'DE') continue;
            if (f.properties.iso_3166_1 && f.properties.iso_3166_1 !== 'DE') continue;
            if (f.properties.country_code && f.properties.country_code !== 'DE') continue;
          }
          
          citiesToFetch.set(name, { x, y, name });
        }
        
        if (citiesToFetch.size >= 20) break;
      }

      if (citiesToFetch.size === 0) return;

      const citiesArray = Array.from(citiesToFetch.values());
      const lats = citiesArray.map(c => c.y).join(',');
      const lons = citiesArray.map(c => c.x).join(',');

      citiesArray.forEach(c => weatherCityFetchCacheRef.current.add(c.name));

      try {
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lons}&daily=temperature_2m_max,weather_code&timezone=auto`;
        const res = await fetchOpenMeteo(url);
        if (!res.ok) throw new Error(`Failed to fetch weather for cities: ${res.statusText}`);
        
        const data = await res.json();
        const results = Array.isArray(data) ? data : [data];
        
        if (!isActive) return;

        setWeatherCityData(prev => {
          const next = { ...prev };
          results.forEach((r, i) => {
            const city = citiesArray[i];
            if (r.daily && r.daily.temperature_2m_max) {
              next[city.name] = {
                temps: r.daily.temperature_2m_max,
                codes: r.daily.weather_code,
                times: r.daily.time,
                x: city.x,
                y: city.y,
                name: city.name
              };
            }
          });
          return next;
        });

      } catch (err) {
        console.warn("City weather fetch error:", err);
        // Remove from cache so they can be retried later
        citiesArray.forEach(c => weatherCityFetchCacheRef.current.delete(c.name));
      }
    };

    const debounceTimer = setTimeout(updateCities, 500);
    
    const onMoveEnd = () => {
      setTimeout(updateCities, 300);
    };

    map.on('moveend', onMoveEnd);
    return () => {
      isActive = false;
      clearTimeout(debounceTimer);
      map.off('moveend', onMoveEnd);
    };
  }, [mapLoaded, weatherLayer, map]);

  // Render weather city markers
  useEffect(() => {
    if (!map || !mapLoaded) return;

    const showTemp = weatherLayer?.visible && weatherLayer?.showCityTemperatures !== false;
    const showIcon = weatherLayer?.visible && weatherLayer?.showCityWeatherIcons !== false;

    const hideNativeLabels = (opacity: any) => {
      try {
        const style = map.getStyle();
        if (!style || !style.layers) return;
        const placeLayers = style.layers.filter(l => 
          (l.id.includes('place') || l.id.includes('settlement') || l.id.includes('city') || l.id.includes('town') || l.id.includes('village')) 
          && l.type === 'symbol'
        ).map(l => l.id);
        
        placeLayers.forEach(layer => {
          if (map.getLayer(layer)) {
            map.setPaintProperty(layer, 'text-opacity', opacity);
          }
        });
      } catch (e) {}
    };

    if (!weatherLayer?.visible || (!showTemp && !showIcon)) {
      Object.keys(weatherCityMarkersRef.current).forEach(id => {
        weatherCityMarkersRef.current[id].remove();
        delete weatherCityMarkersRef.current[id];
      });
      hideNativeLabels(1);
      return;
    }

    const activeTime = selectedWeatherTime || weatherValidTimes[0];
    const activeDate = activeTime ? activeTime.split('T')[0] : '';

    const getWeatherIconSVG = (code: number) => {
      if (code === 0) return `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>`;
      if (code <= 3) return `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/></svg>`;
      if (code <= 48) return `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 14h16"/><path d="M4 18h16"/><path d="M4 22h16"/><path d="M4 10h16"/><path d="M4 6h16"/></svg>`;
      if (code <= 67 || (code >= 80 && code <= 82)) return `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"/><path d="M16 14v6"/><path d="M8 14v6"/><path d="M12 16v6"/></svg>`;
      if (code <= 77 || code === 85 || code === 86) return `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"/><path d="M8 15h.01"/><path d="M8 19h.01"/><path d="M12 17h.01"/><path d="M12 21h.01"/><path d="M16 15h.01"/><path d="M16 19h.01"/></svg>`;
      if (code >= 95) return `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 16.9A5 5 0 0 0 18 7h-1.26a8 8 0 1 0-11.62 9"/><polyline points="13 11 9 17 15 17 11 23"/></svg>`;
      return `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/></svg>`;
    };

    const activeNames = new Set<string>();

    const EXCLUDED_NON_GERMAN_CITIES = new Set([
      'Prague', 'Prag', 'Praha', 'Plzeň', 'Karlovy Vary', 'Ústí nad Labem', 'Liberec', 'Děčín', 'České Budějovice',
      'Salzburg', 'Linz', 'Innsbruck', 'Bregenz', 'Vienna', 'Wien',
      'Zürich', 'Zurich', 'Basel', 'St. Gallen', 'Winterthur', 'Schaffhausen', 'Bern',
      'Strasbourg', 'Straßburg', 'Mulhouse', 'Colmar', 'Metz', 'Nancy',
      'Luxembourg', 'Luxemburg',
      'Liège', 'Lüttich', 'Brussels', 'Brüssel',
      'Maastricht', 'Eindhoven', 'Enschede', 'Groningen', 'Amsterdam', 'Rotterdam',
      'Szczecin', 'Stettin', 'Zielona Góra', 'Gorzów Wielkopolski', 'Poznań', 'Posen', 'Wrocław', 'Breslau',
      'Odense', 'Copenhagen', 'Kopenhagen'
    ]);

    Object.values(weatherCityData).forEach(data => {
      if (weatherLayer.limitCityWeatherToGermany) {
        if (data.x < 5.86 || data.x > 15.04 || data.y < 47.27 || data.y > 55.08) return;
        if (EXCLUDED_NON_GERMAN_CITIES.has(data.name)) return;
      }

      activeNames.add(data.name);
      
      let timeIndexToUse = 0;
      if (activeDate && data.times) {
        const idx = data.times.indexOf(activeDate);
        if (idx !== -1) timeIndexToUse = idx;
      }
      
      const temp = data.temps[timeIndexToUse];
      const code = data.codes[timeIndexToUse];
      if (temp === undefined) return;
      
      const tempStr = Math.round(temp) + '°';
      const iconSvg = getWeatherIconSVG(code);
      
      let marker = weatherCityMarkersRef.current[data.name];
      if (!marker) {
        console.log("Creating marker for", data.name);
        const el = document.createElement('div');
        el.className = 'custom-city-weather-marker absolute pointer-events-none flex items-center gap-1.5 px-2 py-0.5 -mt-4 text-white bg-black shadow-md rounded';
        el.style.zIndex = '9999';
        el.style.backgroundColor = 'black';
        el.style.color = 'white';
        el.style.border = '1px solid rgba(255,255,255,0.2)';
        marker = new maplibregl.Marker({ element: el })
          .setLngLat([data.x, data.y])
          .addTo(map);
        weatherCityMarkersRef.current[data.name] = marker;
      }
      
      const el = marker.getElement();
      
      let span = el.querySelector('span');
      if (!span) {
        span = document.createElement('span');
        span.className = 'font-bold tracking-tight text-[11px] leading-none';
        el.appendChild(span);
      }
      span.innerText = showTemp ? data.name + ' ' + tempStr : data.name;

      let iconDiv = el.querySelector('div.weather-icon');
      if (showIcon) {
        if (!iconDiv) {
          iconDiv = document.createElement('div');
          iconDiv.className = 'weather-icon';
          el.appendChild(iconDiv);
        }
        iconDiv.innerHTML = iconSvg;
        const svg = iconDiv.querySelector('svg');
        if (svg) {
          svg.setAttribute('width', '14');
          svg.setAttribute('height', '14');
        }
      } else if (iconDiv) {
        iconDiv.remove();
      }
    });
    console.log("Active names for markers:", activeNames);

    Object.keys(weatherCityMarkersRef.current).forEach(name => {
      if (!activeNames.has(name)) {
        weatherCityMarkersRef.current[name].remove();
        delete weatherCityMarkersRef.current[name];
      }
    });

    try {
      const namesList = Array.from(activeNames);
      if (namesList.length > 0) {
        const opacityExpr: any[] = ['match', ['get', 'name']];
        namesList.forEach(n => { opacityExpr.push(n); opacityExpr.push(0); });
        opacityExpr.push(1); // default
        hideNativeLabels(opacityExpr);
      } else {
        hideNativeLabels(1);
      }
    } catch (e) {}

  }, [weatherCityData, weatherLayer, selectedWeatherTime, weatherValidTimes, mapLoaded, map]);

    useEffect(() => {
    return () => {
      Object.values(weatherCityMarkersRef.current).forEach(m => m.remove());
      weatherCityMarkersRef.current = {};
    };
  }, []);

  return null;
};
