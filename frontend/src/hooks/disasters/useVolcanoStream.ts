import { useEffect } from 'react';
import maplibregl from 'maplibre-gl';
import type { AppSettings } from '../../types';
import { safeSetPaintProperty, executeWhenStyleLoaded } from '../../utils/mapUtils';

export interface UseVolcanoStreamProps {
  map: maplibregl.Map | null;
  mapLoaded: boolean;
  settings: AppSettings;
  selectedVolcano: any;
  selectedVolcanoPolygon: any;
  selectionMarkersRef: React.MutableRefObject<{ [id: string]: maplibregl.Marker }>;
}

const addLayerSafely = (map: maplibregl.Map, layer: any) => {
  if (map.getLayer(layer.id)) return;
  
  let beforeId = map.getLayer('custom-polygons') ? 'custom-polygons' : undefined;
  
  if (!beforeId) {
    if (typeof (map as any)._cachedBeforeAdminId !== 'undefined') {
      const cached = (map as any)._cachedBeforeAdminId;
      if (cached === null || map.getLayer(cached)) {
        beforeId = cached === null ? undefined : cached;
      } else {
        (map as any)._cachedBeforeAdminId = undefined;
      }
    }
    
    if (typeof (map as any)._cachedBeforeAdminId === 'undefined') {
      const layers = map.getStyle()?.layers || [];
      for (let i = 0; i < layers.length; i++) {
        const id = layers[i].id;
        if ((layers[i].type === 'line' || layers[i].type === 'symbol') &&
            (id.includes('admin') || id.includes('border') || id.includes('boundar') || id.includes('country'))) {
          beforeId = id;
          break;
        }
      }
      if (!beforeId) {
        beforeId = layers.find(l => l.type === 'symbol')?.id;
      }
      (map as any)._cachedBeforeAdminId = beforeId || null;
    }
  }
  
  if (beforeId && !map.getLayer(beforeId)) {
    beforeId = undefined;
  }
  
  try {
    map.addLayer(layer, beforeId as any);
  } catch (e) {
    console.warn(`Failed to add layer safely with beforeId ${beforeId}:`, e);
    try {
      map.addLayer(layer);
    } catch (e2) {
      console.error(`Failed to add layer ${layer.id}:`, e2);
    }
  }
};

export const useVolcanoStream = ({
  map,
  mapLoaded,
  settings,
  selectedVolcano,
  selectedVolcanoPolygon,
  selectionMarkersRef
}: UseVolcanoStreamProps) => {

  // Render selected volcano DOM label
  useEffect(() => {
    if (selectionMarkersRef.current['selected-volcano-label']) {
      selectionMarkersRef.current['selected-volcano-label'].remove();
      delete selectionMarkersRef.current['selected-volcano-label'];
    }

    if (!map || !mapLoaded || !selectedVolcano) {
      return;
    }

    const { coordinates, properties } = selectedVolcano;
    const alertLevel = properties.alertlevel;
    const bgColor = alertLevel === 'Red' ? '#ff0000' : alertLevel === 'Orange' ? '#ff9900' : alertLevel === 'Green' ? '#00ff00' : '#6b7280';
    
    const eventName = properties.eventname || properties.name || 'Volcano';
    const fromDate = properties.fromdate || '';
    let dateStr = '';
    if (fromDate.length >= 10) {
       dateStr = `${fromDate.substring(8, 10)}.${fromDate.substring(5, 7)}.${fromDate.substring(0, 4)}`;
    }

    const el = document.createElement('div');
    el.className = 'flex flex-col items-center justify-center pointer-events-none';
    el.style.backgroundColor = bgColor;
    el.style.color = '#ffffff';
    el.style.padding = '4px 8px';
    el.style.fontFamily = 'Gotham Condensed, Arial Unicode MS Regular, sans-serif';
    el.style.fontSize = '12px';
    el.style.fontWeight = 'bold';
    el.style.lineHeight = '1.2';
    el.style.textAlign = 'center';
    el.style.whiteSpace = 'nowrap';
    el.style.zIndex = '50';
    
    el.innerHTML = `
      <div>${eventName}</div>
      ${dateStr ? `<div>${dateStr}</div>` : ''}
    `;

    const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
      .setLngLat(coordinates)
      .addTo(map);

    selectionMarkersRef.current['selected-volcano-label'] = marker;

    return () => {
      if (selectionMarkersRef.current['selected-volcano-label']) {
        selectionMarkersRef.current['selected-volcano-label'].remove();
        delete selectionMarkersRef.current['selected-volcano-label'];
      }
    };
  }, [selectedVolcano, mapLoaded]);

  // Render selected volcano danger zone polygon
  useEffect(() => {
    if (!map || !mapLoaded) return;

    executeWhenStyleLoaded(map, () => {
      if (!map.getSource('selected-volcano-polygon-source')) {
        map.addSource('selected-volcano-polygon-source', {
          type: 'geojson',
          data: selectedVolcanoPolygon || { type: 'FeatureCollection', features: [] }
        });

        addLayerSafely(map, {
          id: 'selected-volcano-polygon-fill',
          type: 'fill',
          source: 'selected-volcano-polygon-source',
          paint: {
            'fill-color': ['coalesce', ['get', 'fillColor'], '#ff0000'],
            'fill-opacity': 0.3
          }
        });

        addLayerSafely(map, {
          id: 'selected-volcano-polygon-line',
          type: 'line',
          source: 'selected-volcano-polygon-source',
          paint: {
            'line-color': ['coalesce', ['get', 'color'], '#ff0000'],
            'line-width': 1,
            'line-opacity': 0.8
          }
        });
      } else {
        const source = map.getSource('selected-volcano-polygon-source') as maplibregl.GeoJSONSource;
        if (source) {
          source.setData(selectedVolcanoPolygon || { type: 'FeatureCollection', features: [] });
        }
      }

      const volLayer = settings.layers.find(l => l.type === 'gdacs_volcanoes');
      const isVisible = volLayer?._effectiveOpacityVisible ?? true;
      const fillOpacity = isVisible ? 0.3 : 0;
      const lineOpacity = isVisible ? 0.8 : 0;

      if (map.getLayer('selected-volcano-polygon-fill')) {
        safeSetPaintProperty(map, 'selected-volcano-polygon-fill', 'fill-opacity', fillOpacity);
      }
      
      if (map.getLayer('selected-volcano-polygon-line')) {
        safeSetPaintProperty(map, 'selected-volcano-polygon-line', 'line-opacity', lineOpacity);
      }
    });
  }, [selectedVolcanoPolygon, mapLoaded, settings.layers]);
};
