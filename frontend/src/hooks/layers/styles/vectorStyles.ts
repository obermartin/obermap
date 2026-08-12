import maplibregl from 'maplibre-gl';
import { setLayerFade } from '../layerVisibilityUtils';

export const addVectorLayers = (
  map: maplibregl.Map,
  layer: any,
  sourceId: string,
  layerId: string,
  lineId: string,
  firstAdminId: string | undefined
) => {
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
  }
};

export const updateVectorLayerStyles = (
  map: maplibregl.Map,
  layer: any,
  layerId: string,
  lineId: string,
  layerFadeTimeoutsRef: React.MutableRefObject<Record<string, any>>,
  fadeDuration: number
) => {
  if (layer.type === 'geojson') {
    if (map.getLayer(layerId)) {
      setLayerFade(map, layerFadeTimeoutsRef, fadeDuration, layerId, 'fill', layer._effectiveOpacityVisible ?? true, ['coalesce', ['get', 'fillOpacity'], 0.5], layer.visible);
    }
  } else if (layer.type === 'deepstate') {
    if (map.getLayer(layerId)) {
      setLayerFade(map, layerFadeTimeoutsRef, fadeDuration, layerId, 'fill', layer._effectiveOpacityVisible ?? true, layer.opacity ?? 0.5, layer.visible);
    }
  }

  if (map.getLayer(lineId)) {
    map.setLayoutProperty(lineId, 'visibility', layer.visible ? 'visible' : 'none');
    if (layer.type === 'geojson') {
      setLayerFade(map, layerFadeTimeoutsRef, fadeDuration, lineId, 'line', layer._effectiveOpacityVisible ?? true, ['coalesce', ['get', 'lineOpacity'], 1.0], layer.visible);
    }
  }
};
