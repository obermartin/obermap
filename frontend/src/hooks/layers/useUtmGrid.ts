import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import type { MapLayer } from '../../types';
import { generateUtmGrid } from '../../utils/utmGridGenerator';

export function useUtmGrid(
  mapRef: React.RefObject<maplibregl.Map | null>,
  layers: MapLayer[]
) {
  const layer = layers.find(l => l.type === 'utm_grid');
  const isVisible = layer?.visible;
  const updateTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const sourceId = 'utm-grid-source';
    const lineLayerId = 'utm-grid-lines';
    const labelLayerId = 'utm-grid-labels';

    const updateGrid = () => {
      if (!map || !isVisible || !layer) return;

      const bounds = map.getBounds();
      const zoom = map.getZoom();
      
      const geojson = generateUtmGrid(
        [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()],
        zoom
      );

      const source = map.getSource(sourceId) as maplibregl.GeoJSONSource;
      if (source) {
        source.setData(geojson as any);
      }
    };

    const handleMoveEnd = () => {
      if (updateTimeoutRef.current) clearTimeout(updateTimeoutRef.current);
      updateTimeoutRef.current = setTimeout(updateGrid, 100); // Debounce slightly
    };

    if (isVisible && layer) {
      if (!map.getSource(sourceId)) {
        map.addSource(sourceId, {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] }
        });
      }

      if (!map.getLayer(lineLayerId)) {
        map.addLayer({
          id: lineLayerId,
          type: 'line',
          source: sourceId,
          layout: {
            'line-join': 'round',
            'line-cap': 'round'
          },
          paint: {
            'line-color': layer.utmGridColor || '#7f7f7f',
            'line-width': 1,
            'line-opacity': layer.opacity ?? 0.5
          }
        });
      } else {
        map.setPaintProperty(lineLayerId, 'line-color', layer.utmGridColor || '#7f7f7f');
        map.setPaintProperty(lineLayerId, 'line-opacity', layer.opacity ?? 0.5);
      }

      if (!map.getLayer(labelLayerId)) {
        map.addLayer({
          id: labelLayerId,
          type: 'symbol',
          source: sourceId,
          layout: {
            'text-field': ['get', 'label'],
            'text-font': ['Open Sans Semibold', 'Arial Unicode MS Bold'],
            'text-size': 12,
            'text-anchor': 'bottom-left',
            'text-offset': [0.2, -0.2],
            'visibility': layer.utmGridLabels !== false ? 'visible' : 'none'
          },
          paint: {
            'text-color': layer.utmGridColor || '#7f7f7f',
            'text-halo-color': '#000000',
            'text-halo-width': 1,
            'text-opacity': layer.opacity ?? 0.5
          }
        });
      } else {
        map.setLayoutProperty(labelLayerId, 'visibility', layer.utmGridLabels !== false ? 'visible' : 'none');
        map.setPaintProperty(labelLayerId, 'text-color', layer.utmGridColor || '#7f7f7f');
        map.setPaintProperty(labelLayerId, 'text-opacity', layer.opacity ?? 0.5);
      }

      updateGrid();
      map.on('moveend', handleMoveEnd);
    } else {
      if (map.getLayer(labelLayerId)) map.removeLayer(labelLayerId);
      if (map.getLayer(lineLayerId)) map.removeLayer(lineLayerId);
      if (map.getSource(sourceId)) map.removeSource(sourceId);
    }

    return () => {
      map.off('moveend', handleMoveEnd);
      if (updateTimeoutRef.current) clearTimeout(updateTimeoutRef.current);
    };
  }, [mapRef.current, isVisible, layer?.utmGridColor, layer?.opacity, layer?.utmGridLabels]);
}
