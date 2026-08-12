import maplibregl from 'maplibre-gl';
import { setLayerFade } from './layerVisibilityUtils';

export const manageWeatherForecastVisibility = (
  map: maplibregl.Map,
  layer: any,
  sourceId: string,
  layerId: string,
  firstAdminId: string | undefined,
  selectedWeatherTime: string | null,
  weatherValidTimes: string[],
  lastActiveWeatherTimeRef: React.MutableRefObject<string | null>,
  weatherAllValidTimesRef: React.MutableRefObject<string[]>,
  weatherForecastLayerIdsRef: React.MutableRefObject<string[]>,
  weatherForecastSourceIdsRef: React.MutableRefObject<string[]>,
  layerFadeTimeoutsRef: React.MutableRefObject<Record<string, any>>,
  fadeDuration: number
) => {
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
      setLayerFade(map, layerFadeTimeoutsRef, fadeDuration, tempLayerId, 'raster', layer._effectiveOpacityVisible ?? true, targetOpacity, layer.visible);
    }
    if (map.getLayer(precipLayerId)) {
      map.setLayoutProperty(precipLayerId, 'visibility', layer.visible ? 'visible' : 'none');
      setLayerFade(map, layerFadeTimeoutsRef, fadeDuration, precipLayerId, 'raster', layer._effectiveOpacityVisible ?? true, targetOpacity, layer.visible);
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
};
