import { useEffect, useRef } from 'react';
import type { AppSettings, MapLayer } from '../types';
import { parseWKT } from '../utils/mapUtils';


let globalDeepstateHistory: { id: number; createdAt: string }[] | null = null;
let globalDeepstateHistoryPromise: Promise<{ id: number; createdAt: string; }[] | null> | null = null;


export interface LayerVisibilityProps {
  map: maplibregl.Map | null;
  mapLoaded: boolean;
  settings: AppSettings;
  annotations: any[];
  activeTool: string | null;
  revealedTriggers: Set<string>;
  hiddenTriggers: Set<string>;
  selectedAircraftId: string | null;
  selectedVesselMmsi: string | null;
  selectedWeatherTime: string | null;
  weatherValidTimes: string[];
  selectedEarthquake: any;
  selectedVolcano: any;
  selectedEarthquakeShakemap: any;
  selectedVolcanoPolygon: any;
  selectedCemsEarthquake: any;
  selectedCemsEarthquakeFeatures: any;
  getEffectiveLayerDates: (l: MapLayer) => { effectiveStartDate: string, effectiveEndDate: string };
  weatherForecastLayerIdsRef: React.MutableRefObject<string[]>;
  weatherForecastSourceIdsRef: React.MutableRefObject<string[]>;
  lastActiveWeatherTimeRef: React.MutableRefObject<string | null>;
  weatherAllValidTimesRef: React.MutableRefObject<string[]>;
  windLastFetchRef: React.MutableRefObject<number>;
}

export const useLayerVisibility = (props: LayerVisibilityProps) => {
  const {
    map, mapLoaded, settings, activeTool, revealedTriggers, hiddenTriggers,
    selectedAircraftId, selectedVesselMmsi, selectedWeatherTime, weatherValidTimes,
    selectedEarthquake, selectedVolcano, selectedEarthquakeShakemap, selectedVolcanoPolygon,
    annotations, selectedCemsEarthquake, selectedCemsEarthquakeFeatures, getEffectiveLayerDates,
    weatherForecastLayerIdsRef, weatherForecastSourceIdsRef, lastActiveWeatherTimeRef, weatherAllValidTimesRef, windLastFetchRef
  } = props;

  const layerFadeTimeoutsRef = useRef<Record<string, any>>({});
  const deepstateDataCacheRef = useRef<{ [cacheKey: string]: any }>({});
  const gdacsDataCacheRef = useRef<{ [cacheKey: string]: any }>({});

  useEffect(() => {
    if (!map || !mapLoaded) return;
    
    const fadeDuration = settings.labelAnimationDuration ?? 1000;
    const transition = { duration: fadeDuration, delay: 0 };

    const setLayerFade = (mapLibreLayerId: string, layerType: string, isVisible: boolean, maxOpacity: any = 1, layerSidebarVisible: boolean = true) => {
      if (!map.getLayer(mapLibreLayerId)) return;
      
      if (!layerSidebarVisible) {
        map.setLayoutProperty(mapLibreLayerId, 'visibility', 'none');
        if (layerFadeTimeoutsRef.current[mapLibreLayerId]) {
          clearTimeout(layerFadeTimeoutsRef.current[mapLibreLayerId]);
          delete layerFadeTimeoutsRef.current[mapLibreLayerId];
        }
        return;
      }
      
      if (layerFadeTimeoutsRef.current[mapLibreLayerId]) {
        clearTimeout(layerFadeTimeoutsRef.current[mapLibreLayerId]);
        delete layerFadeTimeoutsRef.current[mapLibreLayerId];
      }
      
      const opacityProp = `${layerType}-opacity`;
      const currentVisibility = map.getLayoutProperty(mapLibreLayerId, 'visibility');
      
      if (isVisible) {
        if (currentVisibility === 'none') {
          map.setLayoutProperty(mapLibreLayerId, 'visibility', 'visible');
          setTimeout(() => {
            if (!map.getLayer(mapLibreLayerId)) return;
            map.setPaintProperty(mapLibreLayerId, opacityProp + '-transition', transition);
            map.setPaintProperty(mapLibreLayerId, opacityProp, maxOpacity);
          }, 30);
        } else {
          map.setPaintProperty(mapLibreLayerId, opacityProp + '-transition', transition);
          map.setPaintProperty(mapLibreLayerId, opacityProp, maxOpacity);
        }
      } else {
        map.setPaintProperty(mapLibreLayerId, opacityProp + '-transition', transition);
        map.setPaintProperty(mapLibreLayerId, opacityProp, 0);
        
        layerFadeTimeoutsRef.current[mapLibreLayerId] = setTimeout(() => {
          if (map.getLayer(mapLibreLayerId)) {
            map.setLayoutProperty(mapLibreLayerId, 'visibility', 'none');
          }
          delete layerFadeTimeoutsRef.current[mapLibreLayerId];
        }, fadeDuration);
      }
    };

    let style;
    try {
      style = map.getStyle();
    } catch(e) {
      return; // Style not loaded yet
    }
    
    const layers = (settings.layers || []).map(layer => {
      const triggerExists = (id: string | undefined) => id ? annotations.some(a => a.id === id) : false;
      const hasRevealTrigger = !!layer.animationTriggerId && triggerExists(layer.animationTriggerId);
      const hasHideTrigger = !!layer.hideAnimationTriggerId && triggerExists(layer.hideAnimationTriggerId);
      
      const overrideVisible = activeTool !== 'none';
      const isRevealed = overrideVisible || (!hasRevealTrigger || revealedTriggers.has(layer.animationTriggerId!));
      const isHidden = !overrideVisible && (hasHideTrigger && hiddenTriggers.has(layer.hideAnimationTriggerId!));
      
      const isTriggerVisible = isRevealed && !isHidden;
      
      return { ...layer, _effectiveOpacityVisible: isTriggerVisible };
    });
    const styleLayers = style?.layers || [];
    const firstSymbolId = styleLayers.find(l => l.type === 'symbol')?.id;
    
    let lastWaterIndex = -1;
    for (let i = 0; i < styleLayers.length; i++) {
      if (styleLayers[i].type === 'fill' && (styleLayers[i].id.includes('water') || styleLayers[i].id.includes('marine') || styleLayers[i].id.includes('ocean'))) {
        lastWaterIndex = i;
      }
    }
    
    let firstAdminId = undefined;
    for (let i = lastWaterIndex + 1; i < styleLayers.length; i++) {
      const l = styleLayers[i];
      if ((l.type === 'line' || l.type === 'symbol') &&
          (l.id.includes('admin') || l.id.includes('border') || l.id.includes('boundar') || l.id.includes('country'))) {
        firstAdminId = l.id;
        break;
      }
    }
    firstAdminId = firstAdminId || firstSymbolId;
    let firstSymbolFont = ['Open Sans Regular'];
    for (let i = 0; i < styleLayers.length; i++) {
      if (styleLayers[i].type === 'symbol') {
        const font = (styleLayers[i] as any).layout?.['text-font'];
        if (font && Array.isArray(font) && font.length > 0 && typeof font[0] === 'string') {
           firstSymbolFont = font;
           break;
        }
      }
    }

    const fallbackFont = settings.replaceGothamFont !== false ? ['Gotham Bold', ...firstSymbolFont] : firstSymbolFont;

    // Identify current custom dynamic layers
    const dynamicLayerIds = (style?.layers || [])
      .filter(l => l.id.startsWith('dynamic-layer-'))
      .map(l => l.id.replace('dynamic-layer-', ''));

    // Remove deleted layers
    dynamicLayerIds.forEach(id => {
      if (!layers.find(l => l.id === id || id.startsWith(`${l.id}-`))) {
        if (map.getLayer(`dynamic-layer-${id}`)) map.removeLayer(`dynamic-layer-${id}`);
        if (map.getLayer(`dynamic-line-${id}`)) map.removeLayer(`dynamic-line-${id}`);
        if (map.getSource(`dynamic-source-${id}`)) {
          map.removeSource(`dynamic-source-${id}`);
        }
      }
    });

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


    // Add / Update layers
    layers.forEach((layer) => {
      const sourceId = `dynamic-source-${layer.id}`;
      const layerId = `dynamic-layer-${layer.id}`;
      const lineId = `dynamic-line-${layer.id}`;

      // Re-initialize raster sources if they are dirty (e.g. date changed)
      if ((layer.type === 'raster' || layer.type === 'wildfires') && layer._isDirty) {
        if (layer.type === 'raster' && map.getSource(sourceId)) {
          if (map.getLayer(layerId)) map.removeLayer(layerId);
          if (map.getLayer(lineId)) map.removeLayer(lineId);
          map.removeSource(sourceId);
          layer._isDirty = false;
        } else if (layer.type === 'wildfires' && map.getSource(`${sourceId}-effis`)) {
          if (map.getLayer(`${layerId}-effis`)) map.removeLayer(`${layerId}-effis`);
          map.removeSource(`${sourceId}-effis`);
          layer._isDirty = false;
        }
      }

      if (layer.type === 'weather_forecast') {
        const currentActiveTime = selectedWeatherTime || 'current_time_1H';
        
        const timesToLoadSet = new Set<string>();
        timesToLoadSet.add(currentActiveTime);
        
        // Include previous time so it doesn't blink out immediately while fading
        if (lastActiveWeatherTimeRef.current && lastActiveWeatherTimeRef.current !== currentActiveTime) {
          timesToLoadSet.add(lastActiveWeatherTimeRef.current);
        }
        lastActiveWeatherTimeRef.current = currentActiveTime;
        
        // Preload next few steps for smooth timeline scrubbing
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
          
          // Add sources
          if (layer.showTemperature && !map.getSource(tempSourceId)) {
            map.addSource(tempSourceId, { type: 'raster', url: tempUrl, maxzoom: 12 } as any);
          }
          if (layer.showPrecipitation && !map.getSource(precipSourceId)) {
            map.addSource(precipSourceId, { type: 'raster', url: precipUrl, maxzoom: 12 } as any);
          }

          // Remove sources if toggled off
          if (!layer.showTemperature && map.getSource(tempSourceId)) {
            if (map.getLayer(tempLayerId)) map.removeLayer(tempLayerId);
            map.removeSource(tempSourceId);
          }
          if (!layer.showPrecipitation && map.getSource(precipSourceId)) {
            if (map.getLayer(precipLayerId)) map.removeLayer(precipLayerId);
            map.removeSource(precipSourceId);
          }
          
          // Add layers
          if (layer.showTemperature && map.getSource(tempSourceId) && !map.getLayer(tempLayerId)) {
            map.addLayer({
              id: tempLayerId,
              type: 'raster',
              source: tempSourceId,
              layout: { visibility: layer.visible ? 'visible' : 'none' },
              paint: { 'raster-opacity': 0 } // start hidden
            }, firstAdminId);
          }
          if (layer.showPrecipitation && map.getSource(precipSourceId) && !map.getLayer(precipLayerId)) {
            map.addLayer({
              id: precipLayerId,
              type: 'raster',
              source: precipSourceId,
              layout: { visibility: layer.visible ? 'visible' : 'none' },
              paint: { 'raster-opacity': 0 } // start hidden
            }, firstAdminId);
          }
          
          // Update visibility and opacity
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

        // Cleanup old weather layers that are no longer in timesToLoad
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
        
        return; // Skip the rest of the generic layer loop
      }

      if (!map.getSource(sourceId)) {
        if (layer.type === 'geojson' && layer.data) {
          map.addSource(sourceId, { type: 'geojson', data: layer.data });
        } else if (layer.type === 'deepstate' || layer.type === 'gdacs_earthquakes' || layer.type === 'cems_rapid_mapping' || layer.type === 'gdacs_volcanoes' || layer.type === 'gdacs_cyclones' || layer.type === 'nighttime') {
          map.addSource(sourceId, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
        } else if (layer.type === 'wildfires') {
          // Add both sources, we will toggle visibility
          if (!map.getSource(`${sourceId}-effis`)) {
            let processedUrl = layer.url || 'https://maps.effis.emergency.copernicus.eu/gwis?service=WMS&request=GetMap&layers=nrt.ba&version=1.1.1&format=image/png&transparent=true&srs=EPSG:3857&width=256&height=256&styles=&bbox={bbox-epsg-3857}&time={date-start}/{date-end}';
            const { effectiveStartDate, effectiveEndDate } = getEffectiveLayerDates(layer);
            processedUrl = processedUrl.replace(/{date-start}/g, effectiveStartDate).replace(/{date-end}/g, effectiveEndDate);
            map.addSource(`${sourceId}-effis`, { type: 'raster', tiles: [processedUrl], tileSize: 256 });
          } else {
             // update url
            let processedUrl = layer.url || 'https://maps.effis.emergency.copernicus.eu/gwis?service=WMS&request=GetMap&layers=nrt.ba&version=1.1.1&format=image/png&transparent=true&srs=EPSG:3857&width=256&height=256&styles=&bbox={bbox-epsg-3857}&time={date-start}/{date-end}';
            const { effectiveStartDate, effectiveEndDate } = getEffectiveLayerDates(layer);
            processedUrl = processedUrl.replace(/{date-start}/g, effectiveStartDate).replace(/{date-end}/g, effectiveEndDate);
            
            // Mapbox GL JS doesn't allow updating raster source tiles directly without removing/adding, but we can do it if we remove layer/source in cleanup. Let's rely on that or recreate.
            // Wait, actually, the easiest way to force tile reload in mapbox without removing is not supported.
            // But we can just append a timestamp or change source ID if dates change. 
            // For now, let's remove and re-add if dates change (handled in a separate effect).
            // But here we are just adding.
          }
          if (!map.getSource(`${sourceId}-gdacs`)) {
            map.addSource(`${sourceId}-gdacs`, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
          }
        } else if (layer.type === 'raster' && layer.url) {
          let processedUrl = layer.url;
          
          const { effectiveStartDate: startVal, effectiveEndDate: endVal } = getEffectiveLayerDates(layer);
          
          processedUrl = processedUrl.replace(/%7Bdate-today%7D/g, '{date-end}').replace(/%7Bdate-7d%7D/g, '{date-start}');
          processedUrl = processedUrl.replace(/{date-today}/g, '{date-end}').replace(/{date-7d}/g, '{date-start}');
          processedUrl = processedUrl.replace(/{date-start}/g, startVal).replace(/{date-end}/g, endVal);
          
          const sourceConfig: any = { type: 'raster', tiles: [processedUrl], tileSize: 256 };
          if (layer.maxZoom !== undefined) {
            sourceConfig.maxzoom = layer.maxZoom;
          }
          map.addSource(sourceId, sourceConfig);
        } else if (layer.type === 'satellite') {
          map.addSource(sourceId, { type: 'raster', tiles: ['https://ecn.t0.tiles.virtualearth.net/tiles/a{quadkey}.jpeg?g=129'], tileSize: 256, maxzoom: 19 });
        } else if (layer.type === 'flights' || layer.type === 'vessels') {
          map.addSource(sourceId, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
        }
      } else {
        if (layer.type === 'geojson' && layer.data) {
          (map.getSource(sourceId) as maplibregl.GeoJSONSource).setData(layer.data);
        }
      }

      if ((!map.getLayer(layerId) && map.getSource(sourceId)) || (layer.type === 'wildfires' && !map.getLayer(`${layerId}-effis`))) {
        if (layer.type === 'geojson') {
          map.addLayer({
            id: layerId,
            type: 'fill',
            source: sourceId,
            layout: { visibility: layer.visible ? 'visible' : 'none' },
            paint: {
              'fill-color': ['coalesce', ['get', 'fillColor'], '#00A79D'],
              'fill-opacity': ['coalesce', ['get', 'fillOpacity'], 0.5]
            }
          }, firstAdminId);
          map.addLayer({
            id: lineId,
            type: 'line',
            source: sourceId,
            layout: { visibility: layer.visible ? 'visible' : 'none' },
            paint: {
              'line-color': ['coalesce', ['get', 'outlineColor'], 'transparent'],
              'line-width': ['coalesce', ['get', 'outlineWidth'], 0],
              'line-opacity': ['coalesce', ['get', 'outlineOpacity'], 1.0]
            }
          }, firstAdminId);
        } else if (layer.type === 'gdacs_earthquakes' || layer.type === 'gdacs_volcanoes' || layer.type === 'gdacs_cyclones') {
          map.addLayer({
            id: layerId,
            type: 'circle',
            source: sourceId,
            layout: { visibility: layer.visible ? 'visible' : 'none' },
            paint: {
              'circle-radius': [
                'interpolate', ['linear'], ['coalesce', ['get', 'severity', ['get', 'severitydata']], ['get', 'severity'], 5],
                4, 4,
                9, 16
              ],
              'circle-color': [
                'match',
                ['get', 'alertlevel'],
                'Red', '#ff0000',
                'Orange', '#ff9900',
                'Green', '#00ff00',
                '#ffffff'
              ],
              'circle-opacity': layer.opacity ?? 0.8,
              'circle-stroke-width': 0
            }
          }, firstSymbolId);

          if (layer.type === 'gdacs_earthquakes') {
            map.addLayer({
              id: `${layerId}-label`,
              type: 'symbol',
              source: sourceId,
              layout: {
                visibility: layer.visible ? 'visible' : 'none',
                'text-field': ['to-string', ['get', 'severity_numeric']],
                'text-font': fallbackFont,
                'text-size': 12,
                'text-anchor': 'center',
                'symbol-sort-key': ['-', 0, ['get', 'severity_numeric']]
              },
              paint: {
                'text-color': '#ffffff',
                'text-halo-color': '#ffffff',
                'text-halo-width': 0.5
              }
            });
          }
        } else if (layer.type === 'cems_rapid_mapping') {
          map.addLayer({
            id: layerId,
            type: 'circle',
            source: sourceId,
            layout: { visibility: layer.visible ? 'visible' : 'none' },
            paint: {
              'circle-radius': 6,
              'circle-color': '#ff0000',
              'circle-opacity': layer.opacity ?? 0.8,
              'circle-stroke-width': 2,
              'circle-stroke-color': '#ffffff'
            }
          }, firstSymbolId);
          map.addLayer({
            id: `${layerId}-label`,
            type: 'symbol',
            source: sourceId,
            layout: {
              visibility: layer.visible ? 'visible' : 'none',
              'text-field': ['get', 'name'],
              'text-font': fallbackFont,
              'text-size': 12,
              'text-anchor': 'top',
              'text-offset': [0, 0.8],
            },
            paint: {
              'text-color': '#ffffff',
              'text-halo-color': '#000000',
              'text-halo-width': 1
            }
          });
        } else if (layer.type === 'nighttime') {
          map.addLayer({
            id: layerId,
            type: 'fill',
            source: sourceId,
            layout: { visibility: layer.visible ? 'visible' : 'none' },
            paint: {
              'fill-color': '#000000',
              'fill-opacity': layer.opacity ?? 0.5
            }
          }, firstAdminId);
        } else if (layer.type === 'wildfires') {
          if (!map.getLayer(`${layerId}-effis`)) {
            map.addLayer({
              id: `${layerId}-effis`,
              type: 'raster',
              source: `${sourceId}-effis`,
              layout: { visibility: layer.visible ? 'visible' : 'none' },
              paint: { 'raster-opacity': layer.opacity ?? 0.75 }
            }, firstAdminId);
          }
        } else if (layer.type === 'deepstate') {
          map.addLayer({
            id: layerId,
            type: 'fill',
            source: sourceId,
            layout: { visibility: layer.visible ? 'visible' : 'none' },
            paint: {
              'fill-opacity': layer.opacity ?? 0.5,
              'fill-color': [
                'case',
                ['in', 'UNKNOWN', ['upcase', ['coalesce', ['get', 'name'], '']]], '#F15A38',
                ['in', 'LIBERATED', ['upcase', ['coalesce', ['get', 'name'], '']]], '#317FE0',
                ['in', 'OCCUPIED', ['upcase', ['coalesce', ['get', 'name'], '']]], '#C91D2C',
                ['in', 'CADR', ['upcase', ['coalesce', ['get', 'name'], '']]], '#AB1926',
                ['in', 'CRIMEA', ['upcase', ['coalesce', ['get', 'name'], '']]], '#AB1926',
                '#888888'
              ]
            }
          }, firstAdminId);
        } else if (layer.type === 'raster' || layer.type === 'satellite') {
          const bMin = layer.brightness !== undefined && layer.brightness > 0 ? layer.brightness : 0;
          const bMax = layer.brightness !== undefined && layer.brightness < 0 ? 1 + layer.brightness : 1;
          map.addLayer({
            id: layerId,
            type: 'raster',
            source: sourceId,
            layout: { visibility: layer.visible ? 'visible' : 'none' },
            paint: { 
              'raster-opacity': layer.opacity ?? 1.0,
              'raster-contrast': layer.contrast ?? 0,
              'raster-saturation': layer.saturation ?? 0,
              'raster-hue-rotate': layer.hue ?? 0,
              'raster-brightness-min': bMin,
              'raster-brightness-max': bMax
            }
          }, firstAdminId);
        } else if (layer.type === 'flights') {
          map.addLayer({
            id: layerId,
            type: 'symbol',
            source: sourceId,
            layout: { 
              visibility: layer.visible ? 'visible' : 'none',
              'icon-image': [
                'match',
                ['get', 'category'],
                8, 'helicopter',
                7, 'military',
                2, 'small_aircraft',
                3, 'small_aircraft',
                9, 'small_aircraft',
                12, 'small_aircraft',
                'airplane' // default
              ],
              'icon-size': layer.is3DMode ? 0.8 : 0.4,
              'icon-anchor': layer.is3DMode ? 'center' : 'bottom',
              'icon-rotate': ['get', 'true_track'],
              'icon-rotation-alignment': 'map',
              'icon-pitch-alignment': layer.is3DMode ? 'map' : 'auto',
              'icon-allow-overlap': true,
              'icon-ignore-placement': true
            },
            paint: {
              'icon-opacity': layer.is3DMode ? 0.4 : (selectedAircraftId 
                ? ['case', ['==', ['to-string', ['get', 'icao24']], selectedAircraftId], 1.0, 0.5]
                : 1.0),
              'icon-color': layer.is3DMode ? '#000000' : (layer.aircraftColors && Object.keys(layer.aircraftColors).length > 0 
                ? ['match', ['to-string', ['get', 'icao24']], ...Object.entries(layer.aircraftColors).flat(), layer.globalAircraftColor || '#ffffff'] as any
                : (layer.globalAircraftColor || '#ffffff'))
            }
          }, firstSymbolId);
          
          map.addLayer({
            id: `${layerId}-labels`,
            type: 'symbol',
            source: sourceId,
            layout: {
              visibility: (layer.visible && !layer.is3DMode && layer.showCallsigns) ? 'visible' : 'none',
              'text-field': layer.is3DMode 
                ? ['concat', ['case', ['==', ['get', 'callsign'], ''], ['get', 'icao24'], ['get', 'callsign']], '\n', ['to-string', ['get', 'altitude']], 'm | ', ['to-string', ['get', 'velocity']], 'km/h']
                : ['case', ['==', ['get', 'callsign'], ''], ['get', 'icao24'], ['get', 'callsign']],
              'text-font': fallbackFont,
              'text-size': 10,
              'text-offset': [0, 1.5],
              'text-anchor': 'top',
              'text-ignore-placement': true,
              'text-allow-overlap': true
            },
            paint: {
              'text-color': layer.aircraftColors && Object.keys(layer.aircraftColors).length > 0 
                ? ['match', ['to-string', ['get', 'icao24']], ...Object.entries(layer.aircraftColors).flat(), layer.globalAircraftColor || '#ffffff'] as any
                : (layer.globalAircraftColor || '#ffffff'),
              'text-opacity': selectedAircraftId 
                ? ['case', ['==', ['to-string', ['get', 'icao24']], selectedAircraftId], 1.0, 0.5]
                : 1.0
            }
          });
        } else if (layer.type === 'vessels') {
          map.addLayer({
            id: layerId,
            type: 'symbol',
            source: sourceId,
            layout: {
              visibility: layer.visible ? 'visible' : 'none',
              'icon-image': ['coalesce', ['get', 'icon'], 'ship-still'],
              'icon-size': [
                'interpolate', ['linear'], ['zoom'],
                3, 0.1375,
                8, 0.2125,
                13, 0.3
              ],
              'icon-rotate': ['get', 'heading'],
              'icon-rotation-alignment': 'map',
              'icon-allow-overlap': true,
              'icon-ignore-placement': true,
              'text-field': ['step', ['zoom'], '', 9, ['get', 'name']],
              'text-size': 9,
              'text-offset': [0, 1.5],
              'text-anchor': 'top',
              'text-allow-overlap': false,
              'text-ignore-placement': false
            },
            paint: {
              'icon-opacity': selectedVesselMmsi 
                ? ['case', ['==', ['to-string', ['get', 'mmsi']], selectedVesselMmsi], 1.0, 0.5]
                : 1.0,
              'icon-color': layer.vesselColors && Object.keys(layer.vesselColors).length > 0 
                ? [
                    'match', 
                    ['to-string', ['get', 'mmsi']], 
                    ...Object.entries(layer.vesselColors).flat(),
                    layer.globalVesselColor || '#ffffff'
                  ] 
                : (layer.globalVesselColor || '#ffffff') as any,
              'text-color': '#ffffff',
              'text-opacity': ['interpolate', ['linear'], ['zoom'], 9, 0, 10, 1]
            }
          }, firstSymbolId);
        }
      } else if (map.getLayer(layerId)) {
        map.setLayoutProperty(layerId, 'visibility', layer.visible ? 'visible' : 'none');
        if (layer.type === 'nighttime') {
          setLayerFade(layerId, 'fill', layer._effectiveOpacityVisible ?? true, layer.opacity ?? 0.5, layer.visible);
        } else if (layer.type === 'raster' || layer.type === 'satellite') {
          const bMin = layer.brightness !== undefined && layer.brightness > 0 ? layer.brightness : 0;
          const bMax = layer.brightness !== undefined && layer.brightness < 0 ? 1 + layer.brightness : 1;
          setLayerFade(layerId, 'raster', layer._effectiveOpacityVisible ?? true, layer.opacity ?? 1.0, layer.visible);
          map.setPaintProperty(layerId, 'raster-contrast', layer.contrast ?? 0);
          map.setPaintProperty(layerId, 'raster-saturation', layer.saturation ?? 0);
          map.setPaintProperty(layerId, 'raster-hue-rotate', layer.hue ?? 0);
          map.setPaintProperty(layerId, 'raster-brightness-min', bMin);
          map.setPaintProperty(layerId, 'raster-brightness-max', bMax);
        } else if (layer.type === 'flights') {
          const colorExp = layer.aircraftColors && Object.keys(layer.aircraftColors).length > 0 
            ? [
                'match', 
                ['to-string', ['get', 'icao24']], 
                ...Object.entries(layer.aircraftColors).flat(),
                layer.globalAircraftColor || '#ffffff'
              ] 
            : (layer.globalAircraftColor || '#ffffff');
            
          const iconOpacityBase = layer.is3DMode ? 0.4 : (selectedAircraftId 
            ? ['case', ['==', ['to-string', ['get', 'icao24']], selectedAircraftId], 1.0, 0.5]
            : 1.0);
          setLayerFade(layerId, 'icon', layer._effectiveOpacityVisible ?? true, iconOpacityBase, layer.visible);
          map.setPaintProperty(layerId, 'icon-color', layer.is3DMode ? '#000000' : colorExp as any);
          map.setLayoutProperty(layerId, 'icon-size', layer.is3DMode ? 0.8 : 0.4);
          map.setLayoutProperty(layerId, 'icon-anchor', layer.is3DMode ? 'center' : 'bottom');
          map.setLayoutProperty(layerId, 'icon-pitch-alignment', layer.is3DMode ? 'map' : 'auto');
          
          if (map.getLayer(`${layerId}-labels`)) {
            map.setLayoutProperty(`${layerId}-labels`, 'visibility', (layer.visible && !layer.is3DMode && layer.showCallsigns) ? 'visible' : 'none');
            map.setLayoutProperty(`${layerId}-labels`, 'text-field', layer.is3DMode 
                ? ['concat', ['case', ['==', ['get', 'callsign'], ''], ['get', 'icao24'], ['get', 'callsign']], '\n', ['to-string', ['get', 'altitude']], 'm | ', ['to-string', ['get', 'velocity']], 'km/h']
                : ['case', ['==', ['get', 'callsign'], ''], ['get', 'icao24'], ['get', 'callsign']]);
            const labelOpacityBase = selectedAircraftId 
              ? ['case', ['==', ['to-string', ['get', 'icao24']], selectedAircraftId], 1.0, 0.5]
              : 1.0;
            const isLabelVisible = (layer._effectiveOpacityVisible ?? true) && !layer.is3DMode;
            setLayerFade(`${layerId}-labels`, 'text', isLabelVisible, labelOpacityBase, layer.visible);
            map.setPaintProperty(`${layerId}-labels`, 'text-color', colorExp as any);
          } else if (layer.showCallsigns && !layer.is3DMode) {
            const firstSymbolId = map.getStyle().layers?.find(l => l.type === 'symbol')?.id;
            map.addLayer({
              id: `${layerId}-labels`,
              type: 'symbol',
              source: `dynamic-source-${layer.id}`,
              layout: {
                visibility: (layer.visible && !layer.is3DMode) ? 'visible' : 'none',
                'text-field': layer.is3DMode 
                ? ['concat', ['case', ['==', ['get', 'callsign'], ''], ['get', 'icao24'], ['get', 'callsign']], '\n', ['to-string', ['get', 'altitude']], 'm | ', ['to-string', ['get', 'velocity']], 'km/h']
                : ['case', ['==', ['get', 'callsign'], ''], ['get', 'icao24'], ['get', 'callsign']],
                'text-font': fallbackFont,
                'text-size': 10,
                'text-offset': [0, 1.5],
                'text-anchor': 'top',
                'text-ignore-placement': true,
                'text-allow-overlap': true
              },
              paint: {
                'text-color': colorExp as any,
                'text-opacity': selectedAircraftId 
                  ? ['case', ['==', ['to-string', ['get', 'icao24']], selectedAircraftId], 1.0, 0.5]
                  : 1.0
              }
            }, firstSymbolId);
          }
        } else if (layer.type === 'wildfires') {
          if (map.getLayer(`${layerId}-effis`)) {
            setLayerFade(`${layerId}-effis`, 'raster', layer._effectiveOpacityVisible ?? true, layer.opacity ?? 0.75, layer.visible);
            map.setLayoutProperty(`${layerId}-effis`, 'visibility', layer.visible ? 'visible' : 'none');
          }
        } else if (layer.type === 'gdacs_earthquakes' || layer.type === 'gdacs_volcanoes') {
          if (map.getLayer(layerId)) {
            setLayerFade(layerId, 'circle', layer._effectiveOpacityVisible ?? true, layer.opacity ?? 0.8, layer.visible);
            map.setLayoutProperty(layerId, 'visibility', layer.visible ? 'visible' : 'none');
          }
          if (map.getLayer(`${layerId}-label`)) {
            setLayerFade(`${layerId}-label`, 'text', layer._effectiveOpacityVisible ?? true, 1.0, layer.visible);
            map.setLayoutProperty(`${layerId}-label`, 'visibility', layer.visible ? 'visible' : 'none');
          }
        } else if (layer.type === 'cems_rapid_mapping') {
          if (map.getLayer(layerId)) {
            setLayerFade(layerId, 'circle', layer._effectiveOpacityVisible ?? true, layer.opacity ?? 0.8, layer.visible);
            map.setLayoutProperty(layerId, 'visibility', layer.visible ? 'visible' : 'none');
          }
          if (map.getLayer(`${layerId}-label`)) {
            setLayerFade(`${layerId}-label`, 'text', layer._effectiveOpacityVisible ?? true, 1.0, layer.visible);
            map.setLayoutProperty(`${layerId}-label`, 'visibility', layer.visible ? 'visible' : 'none');
          }
        } else if (layer.type === 'deepstate') {
          setLayerFade(layerId, 'fill', layer._effectiveOpacityVisible ?? true, layer.opacity ?? 0.5, layer.visible);
        }
        
        if (layer.type === 'flights') {
          if (map.getLayer('selected-flight-track-layer')) {
            const opacity = layer.flightpathOpacity ?? 0.8;
            const colorExp = layer.aircraftColors && Object.keys(layer.aircraftColors).length > 0 
              ? [
                  'match', 
                  selectedAircraftId || '', 
                  ...Object.entries(layer.aircraftColors).flat(),
                  layer.globalAircraftColor || '#ffffff'
                ] 
              : (layer.globalAircraftColor || '#ffffff');
              
            map.setPaintProperty('selected-flight-track-layer', 'line-opacity', layer.is3DMode ? 0.3 : opacity);
            map.setPaintProperty('selected-flight-track-layer', 'line-color', layer.is3DMode ? '#000000' : colorExp as any);
          }
          if (map.getLayer('automated-flight-tracks-shadow-layer')) {
            const opacity = layer.flightpathOpacity ?? 0.5;
            map.setPaintProperty('automated-flight-tracks-shadow-layer', 'line-opacity', layer.is3DMode ? 0.4 : opacity);
            map.setPaintProperty('automated-flight-tracks-shadow-layer', 'line-color', layer.is3DMode ? '#000000' : ['coalesce', ['get', 'color'], '#000000']);
            map.setLayoutProperty('automated-flight-tracks-shadow-layer', 'visibility', layer.visible ? 'visible' : 'none');
          }
        } else if (layer.type === 'vessels') {
          const colorExp = layer.vesselColors && Object.keys(layer.vesselColors).length > 0 
            ? [
                'match', 
                ['to-string', ['get', 'mmsi']], 
                ...Object.entries(layer.vesselColors).flat(),
                layer.globalVesselColor || '#ffffff'
              ] 
            : (layer.globalVesselColor || '#ffffff');
            
          const iconOpacityBase = selectedVesselMmsi 
            ? ['case', ['==', ['to-string', ['get', 'mmsi']], selectedVesselMmsi], 1.0, 0.5]
            : 1.0;
          setLayerFade(layerId, 'icon', layer._effectiveOpacityVisible ?? true, iconOpacityBase, layer.visible);
          map.setPaintProperty(layerId, 'icon-color', colorExp as any);
          
          if (map.getLayer('selected-vessel-track-layer')) {
            const trackColorExp = layer.vesselColors && Object.keys(layer.vesselColors).length > 0 
              ? [
                  'match', 
                  selectedVesselMmsi || '', 
                  ...Object.entries(layer.vesselColors).flat(),
                  layer.globalVesselColor || '#ffffff'
                ] 
              : (layer.globalVesselColor || '#ffffff');
              
            map.setPaintProperty('selected-vessel-track-layer', 'line-color', trackColorExp as any);
          }
        }
        
        if (layer.type === 'geojson') {
          if (map.getLayer(layerId)) {
            setLayerFade(layerId, 'fill', layer._effectiveOpacityVisible ?? true, ['coalesce', ['get', 'fillOpacity'], 0.5], layer.visible);
          }
        }

        if (map.getLayer(lineId)) {
          map.setLayoutProperty(lineId, 'visibility', layer.visible ? 'visible' : 'none');
          if (layer.type === 'geojson') {
            setLayerFade(lineId, 'line', layer._effectiveOpacityVisible ?? true, ['coalesce', ['get', 'lineOpacity'], 1.0], layer.visible);
          }
        }
      }

      // Fetch data for deepstate if needed
      if (layer.type === 'deepstate') {
        const { effectiveStartDate: targetDate } = getEffectiveLayerDates(layer);
        
        const cacheKey = `${layer.id}-${targetDate}`;
        if (deepstateDataCacheRef.current[cacheKey]) {
          const source = map.getSource(sourceId) as maplibregl.GeoJSONSource;
          if (source) source.setData(deepstateDataCacheRef.current[cacheKey]);
        } else {
          (async () => {
            try {
              let url = `/api.php?action=deepstate_geojson&id=${targetDate}`;
              if (targetDate.length === 10) {
                if (!globalDeepstateHistory) {
                  if (!globalDeepstateHistoryPromise) {
                    globalDeepstateHistoryPromise = fetch('/api.php?action=deepstate_history')
                      .then(r => r.json())
                      .catch(e => {
                        console.error('Failed to fetch deepstate history', e);
                        return null;
                      });
                  }
                  globalDeepstateHistory = await globalDeepstateHistoryPromise;
                  if (globalDeepstateHistory && !Array.isArray(globalDeepstateHistory)) {
                    console.error('Deepstate API returned non-array response:', globalDeepstateHistory);
                    globalDeepstateHistory = null;
                    throw new Error('DeepStateMap API requires authentication (401 Unauthorized) or returned invalid data.');
                  }
                }
                let history = globalDeepstateHistory;
                if (!history && globalDeepstateHistoryPromise) {
                  await globalDeepstateHistoryPromise;
                  history = globalDeepstateHistory;
                }
                if (!history) throw new Error('No history available');
                const entriesForDate = history.filter((entry: any) => entry.createdAt.startsWith(targetDate));
                let targetId: number = entriesForDate.length > 0 ? entriesForDate[entriesForDate.length - 1].id : 0;
                if (targetId === 0) {
                  const pastEntries = history.filter((entry: any) => entry.createdAt < targetDate);
                  if (pastEntries.length > 0) targetId = pastEntries[pastEntries.length - 1].id;
                  else throw new Error('No data found for this date');
                }
                url = `/api.php?action=deepstate_geojson&id=${targetId}`;
              }
              const res = await fetch(url);
              if (!res.ok) throw new Error(`Failed to fetch deepstate data: ${res.statusText}`);
              const data = await res.json();
              const geojsonData = data.map ? data.map : data;
              if (geojsonData && geojsonData.features) {
                const ignoredTerms = [
                  'geoJSON.territories.estonia',
                  'geoJSON.territories.pechorsky-district',
                  'geoJSON.territories.latvia',
                  'geoJSON.territories.belarus'
                ];
                const filteredFeatures = geojsonData.features.filter((f: any) => {
                  const isPolygon = f.geometry?.type === 'Polygon' || f.geometry?.type === 'MultiPolygon';
                  if (!isPolygon) return false;
                  const name = f.properties?.name || '';
                  return !(typeof name === 'string' && ignoredTerms.some(term => name.includes(term)));
                });
                const polygonsOnly = {
                  ...geojsonData,
                  features: filteredFeatures
                };
                deepstateDataCacheRef.current[cacheKey] = polygonsOnly;
                const source = map.getSource(sourceId) as maplibregl.GeoJSONSource;
                if (source) source.setData(polygonsOnly);
              }
            } catch (err) {
              console.error(`Error fetching deepstate for date ${targetDate}:`, err);
              const emptyData = { type: 'FeatureCollection' as const, features: [] };
              deepstateDataCacheRef.current[cacheKey] = emptyData;
              const source = map.getSource(sourceId) as maplibregl.GeoJSONSource;
              if (source) source.setData(emptyData);
            }
          })();
        }
      }

    });

    // Fetch data for GDACS if needed
    for (const layer of layers) {
      if (!layer.visible) continue;
      if (layer.type.startsWith('gdacs_') || layer.type === 'cems_rapid_mapping') {
        const sourceId = `dynamic-source-${layer.id}`;
        let { effectiveStartDate: startDate, effectiveEndDate: endDate } = getEffectiveLayerDates(layer);
        const cacheKey = `${layer.type}-${startDate}-${endDate}`;
        if (gdacsDataCacheRef.current[cacheKey]) {
          const source = map.getSource(sourceId) as maplibregl.GeoJSONSource;
          if (source) source.setData(gdacsDataCacheRef.current[cacheKey]);
        } else {
          (async () => {
            try {
              let geojsonData: any = { type: 'FeatureCollection', features: [] };
              if (layer.type === 'cems_rapid_mapping') {
                const url = `https://rapidmapping.emergency.copernicus.eu/backend/dashboard-api/public-activations-info/?limit=50`;
                const res = await fetch(url);
                if (!res.ok) throw new Error(`Failed to fetch CEMS data`);
                const data = await res.json();
                if (data && data.results) {
                  geojsonData.features = data.results
                    .filter((act: any) => act.category === 'Earthquake')
                    .map((act: any) => {
                      const geom = parseWKT(act.centroid);
                      if (!geom) return null;
                      return {
                        type: 'Feature',
                        geometry: geom.geometry,
                        properties: {
                          ...act,
                        }
                      };
                    }).filter(Boolean);
                }
              } else {
                const eventlist = layer.type.includes('earthquake') || layer.type.includes('shakemap') ? 'EQ' : layer.type === 'gdacs_cyclones' ? 'TC' : 'VO';
                const url = `https://www.gdacs.org/gdacsapi/api/Events/geteventlist/search?eventlist=${eventlist}&fromDate=${startDate}&toDate=${endDate}`;
                const res = await fetch(url);
                if (!res.ok) throw new Error(`Failed to fetch GDACS data: ${res.statusText}`);
                const text = await res.text();
                const data = text ? JSON.parse(text) : { type: 'FeatureCollection', features: [] };
                geojsonData = data;

              if (geojsonData && geojsonData.features) {
                geojsonData.features.forEach((f: any) => {
                  if (f.properties) {
                    f.properties.severity_numeric = f.properties.severitydata?.severity ?? f.properties.severity ?? 0;
                  }
                });

              }
            }
            gdacsDataCacheRef.current[cacheKey] = geojsonData;
            if (map && map.getStyle() && map.getSource(sourceId)) {
                (map.getSource(sourceId) as maplibregl.GeoJSONSource).setData(geojsonData);
              }
            } catch (err) {
              console.error(`Error fetching GDACS for type ${layer.type}:`, err);
              const emptyData = { type: 'FeatureCollection' as const, features: [] };
              gdacsDataCacheRef.current[cacheKey] = emptyData;
              if (map && map.getStyle() && map.getSource(sourceId)) {
                (map.getSource(sourceId) as maplibregl.GeoJSONSource).setData(emptyData);
              }
            }
          })();
        }
      }
    }

    // Reorder layers dynamically. Iterate backwards to place the bottom-most layer right before firstAdminId.
    for (let i = layers.length - 1; i >= 0; i--) {
      const layer = layers[i];
      const idsToMoveAdmin: string[] = [];
      const idsToMoveTop: string[] = [];
      
      if (layer.type === 'weather_forecast') {
        idsToMoveTop.push(...weatherForecastLayerIdsRef.current);
      } else if (layer.type === 'wildfires') {
        idsToMoveTop.push('active-wildfire-cems-vt-lines');
        idsToMoveTop.push('active-wildfire-cems-vt-points');
        idsToMoveAdmin.push('active-wildfire-cems-vt-extent');
        idsToMoveAdmin.push('active-wildfire-cems-vt-polygons');
        idsToMoveAdmin.push(`dynamic-layer-${layer.id}-effis`);
      } else if (layer.type === 'floods') {
        idsToMoveTop.push('active-flood-cems-vt-lines');
        idsToMoveTop.push('active-flood-cems-vt-points');
        idsToMoveAdmin.push('active-flood-cems-vt-extent');
        idsToMoveAdmin.push('active-flood-cems-vt-polygons');
        idsToMoveAdmin.push(`dynamic-layer-${layer.id}`);
      } else if (layer.type === 'gdacs_earthquakes' || layer.type === 'cems_rapid_mapping') {
        idsToMoveAdmin.push('selected-earthquake-shakemap-fill');
        idsToMoveAdmin.push('selected-earthquake-shakemap-line');
        idsToMoveAdmin.push('selected-usgs-dyfi-10km-fill');
        idsToMoveAdmin.push('selected-usgs-dyfi-1km-fill');
        idsToMoveAdmin.push('selected-usgs-landslide-raster');
        idsToMoveAdmin.push('selected-usgs-liquefaction-raster');
        idsToMoveAdmin.push('selected-cems-vt-extent');
        idsToMoveAdmin.push('selected-cems-vt-polygons');
        idsToMoveAdmin.push('selected-cems-vt-lines');
        idsToMoveTop.push(`dynamic-layer-${layer.id}`); // circles on top
        if (map.getLayer(`dynamic-layer-${layer.id}-label`)) {
          idsToMoveTop.push(`dynamic-layer-${layer.id}-label`); // labels on top
        }
      } else if (layer.type === 'gdacs_volcanoes') {
        idsToMoveAdmin.push('selected-volcano-polygon-fill');
        idsToMoveAdmin.push('selected-volcano-polygon-line');
        idsToMoveTop.push(`dynamic-layer-${layer.id}`); // circles on top
      } else if (layer.type === 'flights' || layer.type === 'vessels') {
        idsToMoveTop.push(`dynamic-layer-${layer.id}`);
        if (map.getLayer(`dynamic-layer-${layer.id}-labels`)) {
          idsToMoveTop.push(`dynamic-layer-${layer.id}-labels`);
        }
        if (layer.type === 'flights') {
          idsToMoveTop.push('selected-flight-track-layer');
          idsToMoveTop.push('automated-flight-tracks-shadow-layer');
        }
      } else {
        idsToMoveAdmin.push(`dynamic-layer-${layer.id}`);
        if (map.getLayer(`dynamic-line-${layer.id}`)) {
          idsToMoveAdmin.push(`dynamic-line-${layer.id}`);
        }
      }
      
      idsToMoveAdmin.forEach(id => {
        if (map.getLayer(id)) {
          try {
            map.moveLayer(id, firstAdminId);
          } catch (e) {}
        }
      });
      idsToMoveTop.forEach(id => {
        if (map.getLayer(id)) {
          try {
            map.moveLayer(id); // push to very top
          } catch (e) {}
        }
      });
    }

    return () => {
      // Cleanup dynamically created raster layers that were removed from settings
      // We don't remove copernicus or deepstate sources to avoid reload flashes
    };
  }, [settings.layers, activeTool, revealedTriggers, hiddenTriggers, mapLoaded, selectedAircraftId, selectedVesselMmsi, selectedWeatherTime, weatherValidTimes, selectedEarthquake, selectedVolcano, selectedEarthquakeShakemap, selectedVolcanoPolygon, selectedCemsEarthquake, selectedCemsEarthquakeFeatures]);

};
