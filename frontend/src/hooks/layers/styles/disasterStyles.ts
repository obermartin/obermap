import maplibregl from 'maplibre-gl';
import { setLayerFade } from '../layerVisibilityUtils';

export const addDisasterLayers = (
  map: maplibregl.Map,
  layer: any,
  sourceId: string,
  layerId: string,
  firstSymbolId: string | undefined,
  fallbackFont: string[]
) => {
  if (layer.type === 'gdacs_earthquakes' || layer.type === 'gdacs_volcanoes' || layer.type === 'gdacs_cyclones') {
    map.addLayer({
      id: layerId,
      type: 'circle',
      source: sourceId,
      layout: { visibility: layer.visible ? 'visible' : 'none' },
      paint: {
        'circle-radius': layer.type === 'gdacs_volcanoes' ? [
          'match',
          ['get', 'alertlevel'],
          'Red', 16,
          'Orange', 12,
          'Green', 8,
          10
        ] : [
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
  }
};

export const updateDisasterLayerStyles = (
  map: maplibregl.Map,
  layer: any,
  layerId: string,
  layerFadeTimeoutsRef: React.MutableRefObject<Record<string, any>>,
  fadeDuration: number
) => {
  if (layer.type === 'gdacs_earthquakes' || layer.type === 'gdacs_volcanoes') {
    if (map.getLayer(layerId)) {
      setLayerFade(map, layerFadeTimeoutsRef, fadeDuration, layerId, 'circle', layer._effectiveOpacityVisible ?? true, layer.opacity ?? 0.8, layer.visible);
      map.setLayoutProperty(layerId, 'visibility', layer.visible ? 'visible' : 'none');
    }
    if (map.getLayer(`${layerId}-label`)) {
      setLayerFade(map, layerFadeTimeoutsRef, fadeDuration, `${layerId}-label`, 'text', layer._effectiveOpacityVisible ?? true, 1.0, layer.visible);
      map.setLayoutProperty(`${layerId}-label`, 'visibility', layer.visible ? 'visible' : 'none');
    }
  } else if (layer.type === 'cems_rapid_mapping') {
    if (map.getLayer(layerId)) {
      setLayerFade(map, layerFadeTimeoutsRef, fadeDuration, layerId, 'circle', layer._effectiveOpacityVisible ?? true, layer.opacity ?? 0.8, layer.visible);
      map.setLayoutProperty(layerId, 'visibility', layer.visible ? 'visible' : 'none');
    }
    if (map.getLayer(`${layerId}-label`)) {
      setLayerFade(map, layerFadeTimeoutsRef, fadeDuration, `${layerId}-label`, 'text', layer._effectiveOpacityVisible ?? true, 1.0, layer.visible);
      map.setLayoutProperty(`${layerId}-label`, 'visibility', layer.visible ? 'visible' : 'none');
    }
  }
};
