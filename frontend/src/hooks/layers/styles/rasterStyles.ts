import maplibregl from 'maplibre-gl';
import { setLayerFade } from '../layerVisibilityUtils';

export const addRasterLayers = (
  map: maplibregl.Map,
  layer: any,
  sourceId: string,
  layerId: string,
  firstAdminId: string | undefined
) => {
  if (layer.type === 'nighttime') {
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
  } else if (layer.type === 'raster' || layer.type === 'satellite') {
    const bMin = layer.brightness !== undefined && layer.brightness > 0 ? layer.brightness : 0;
    const bMax = layer.brightness !== undefined && layer.brightness < 0 ? 1 + layer.brightness : 1;
    const targetBeforeId = (firstAdminId && map.getLayer(firstAdminId)) ? firstAdminId : undefined;
    const isEffectiveVis = layer._effectiveOpacityVisible ?? true;
    const initialOpacity = isEffectiveVis ? (layer.opacity ?? 1.0) : 0;
    
    map.addLayer({
      id: layerId,
      type: 'raster',
      source: sourceId,
      layout: { visibility: (layer.visible && isEffectiveVis) ? 'visible' : 'none' },
      paint: { 
        'raster-opacity': initialOpacity,
        'raster-contrast': layer.contrast ?? 0,
        'raster-saturation': layer.saturation ?? 0,
        'raster-hue-rotate': layer.hue ?? 0,
        'raster-brightness-min': bMin,
        'raster-brightness-max': bMax
      }
    }, targetBeforeId);
  }
};

export const updateRasterLayerStyles = (
  map: maplibregl.Map,
  layer: any,
  layerId: string,
  layerFadeTimeoutsRef: React.MutableRefObject<Record<string, any>>,
  fadeDuration: number
) => {
  if (layer.type === 'nighttime') {
    if (map.getLayer(layerId)) {
      map.setLayoutProperty(layerId, 'visibility', layer.visible ? 'visible' : 'none');
      setLayerFade(map, layerFadeTimeoutsRef, fadeDuration, layerId, 'fill', layer._effectiveOpacityVisible ?? true, layer.opacity ?? 0.5, layer.visible);
    }
  } else if (layer.type === 'raster' || layer.type === 'satellite') {
    if (map.getLayer(layerId)) {
      map.setLayoutProperty(layerId, 'visibility', layer.visible ? 'visible' : 'none');
      setLayerFade(map, layerFadeTimeoutsRef, fadeDuration, layerId, 'raster', layer._effectiveOpacityVisible ?? true, layer.opacity ?? 1.0, layer.visible);
      const bMin = layer.brightness !== undefined && layer.brightness > 0 ? layer.brightness : 0;
      const bMax = layer.brightness !== undefined && layer.brightness < 0 ? 1 + layer.brightness : 1;
      map.setPaintProperty(layerId, 'raster-contrast', layer.contrast ?? 0);
      map.setPaintProperty(layerId, 'raster-saturation', layer.saturation ?? 0);
      map.setPaintProperty(layerId, 'raster-hue-rotate', layer.hue ?? 0);
      map.setPaintProperty(layerId, 'raster-brightness-min', bMin);
      map.setPaintProperty(layerId, 'raster-brightness-max', bMax);
    }
  } else if (layer.type === 'wildfires') {
    if (map.getLayer(`${layerId}-effis`)) {
      setLayerFade(map, layerFadeTimeoutsRef, fadeDuration, `${layerId}-effis`, 'raster', layer._effectiveOpacityVisible ?? true, layer.opacity ?? 0.75, layer.visible);
      map.setLayoutProperty(`${layerId}-effis`, 'visibility', layer.visible ? 'visible' : 'none');
    }
  }
};
