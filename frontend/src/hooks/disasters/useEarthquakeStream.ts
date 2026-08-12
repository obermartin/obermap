import { useEffect } from 'react';
import maplibregl from 'maplibre-gl';
import type { AppSettings } from '../../types';
import { safeSetFilter, safeSetLayoutProperty, safeSetPaintProperty, executeWhenStyleLoaded } from '../../utils/mapUtils';

export interface UseEarthquakeStreamProps {
  map: maplibregl.Map | null;
  mapLoaded: boolean;
  settings: AppSettings;
  selectedEarthquake: any;
  selectedEarthquakeShakemap: any;
  selectedEarthquakeUsgsDyfi10km?: any;
  selectedEarthquakeUsgsDyfi1km?: any;
  selectedEarthquakeUsgsLandslide?: any;
  selectedEarthquakeUsgsLiquefaction?: any;
  activeDrawMarkersRef: React.MutableRefObject<{ [id: string]: maplibregl.Marker }>;
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

export const useEarthquakeStream = ({
  map,
  mapLoaded,
  settings,
  selectedEarthquake,
  selectedEarthquakeShakemap,
  selectedEarthquakeUsgsDyfi10km,
  selectedEarthquakeUsgsDyfi1km,
  selectedEarthquakeUsgsLandslide,
  selectedEarthquakeUsgsLiquefaction,
  activeDrawMarkersRef,
  selectionMarkersRef
}: UseEarthquakeStreamProps) => {

  // Update earthquake labels filter
  useEffect(() => {
    if (!map || !mapLoaded) return;
    
    settings.layers.forEach(layer => {
      if (layer.type === 'gdacs_earthquakes') {
        const baseLayerId = `dynamic-layer-${layer.id}`;
        const labelLayerId = `${baseLayerId}-label`;
        
        if (map.getLayer(baseLayerId)) {
          if (selectedEarthquake && layer.type === 'gdacs_earthquakes') {
             safeSetFilter(map, baseLayerId, ['!=', ['to-string', ['get', 'eventid']], selectedEarthquake.id]);
             if (map.getLayer(labelLayerId)) {
               safeSetFilter(map, labelLayerId, ['!=', ['to-string', ['get', 'eventid']], selectedEarthquake.id]);
             }
          } else {
             safeSetFilter(map, baseLayerId, null);
             if (map.getLayer(labelLayerId)) safeSetFilter(map, labelLayerId, null);
          }
        }
      }
    });
  }, [selectedEarthquake, mapLoaded, settings.layers]);

  // Render selected earthquake DOM label
  useEffect(() => {
    if (activeDrawMarkersRef.current['selected-eq-label']) {
      activeDrawMarkersRef.current['selected-eq-label'].remove();
      delete activeDrawMarkersRef.current['selected-eq-label'];
    }
    if (selectionMarkersRef.current['selected-eq-label']) {
      selectionMarkersRef.current['selected-eq-label'].remove();
      delete selectionMarkersRef.current['selected-eq-label'];
    }
    
    if (!map || !mapLoaded || !selectedEarthquake) {
      return;
    }

    const { coordinates, properties } = selectedEarthquake;
    const alertLevel = properties.alertlevel;
    const bgColor = alertLevel === 'Red' ? '#ef4444' : alertLevel === 'Orange' ? '#f97316' : alertLevel === 'Green' ? '#22c55e' : '#6b7280';
    
    const fromDate = properties.fromdate || '';
    let dateStr = '';
    if (fromDate.length >= 10) {
       dateStr = `${fromDate.substring(8, 10)}.${fromDate.substring(5, 7)}.${fromDate.substring(0, 4)}`;
    }

    const el = document.createElement('div');
    el.className = 'flex flex-col items-center justify-center pointer-events-none shakemap-marker-dot';
    el.style.backgroundColor = bgColor;
    el.style.color = '#ffffff';
    el.style.padding = '4px 8px';
    el.style.fontFamily = 'Gotham Bold, Arial Unicode MS Regular, sans-serif';
    el.style.fontSize = '12px';
    el.style.fontWeight = 'bold';
    el.style.lineHeight = '1.2';
    el.style.textAlign = 'center';
    el.style.whiteSpace = 'nowrap';
    el.style.zIndex = '50';
    
    el.innerHTML = `<div>${dateStr}</div>`;

    const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
      .setLngLat(coordinates)
      .addTo(map);

    selectionMarkersRef.current['selected-eq-label'] = marker;

    return () => {
      if (selectionMarkersRef.current['selected-eq-label']) {
        selectionMarkersRef.current['selected-eq-label'].remove();
        delete selectionMarkersRef.current['selected-eq-label'];
      }
    };
  }, [selectedEarthquake, mapLoaded]);

  // Render selected earthquake shakemap
  useEffect(() => {
    if (!map || !mapLoaded) return;

    executeWhenStyleLoaded(map, () => {
      if (!map.getSource('selected-earthquake-shakemap-source')) {
        map.addSource('selected-earthquake-shakemap-source', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] }
        });
        
        addLayerSafely(map, {
          id: 'selected-earthquake-shakemap-fill',
          type: 'fill',
          source: 'selected-earthquake-shakemap-source',
          layout: { visibility: 'visible' },
          paint: {
            'fill-color': ['coalesce', ['get', 'fill'], '#ff9900'],
            'fill-opacity': 0.3
          }
        });

        addLayerSafely(map, {
          id: 'selected-earthquake-shakemap-line',
          type: 'line',
          source: 'selected-earthquake-shakemap-source',
          layout: { visibility: 'visible' },
          paint: {
            'line-color': ['coalesce', ['get', 'stroke'], '#ff0000'],
            'line-width': 1,
            'line-opacity': 0.8
          }
        });
      }

      const source = map.getSource('selected-earthquake-shakemap-source') as maplibregl.GeoJSONSource;
      if (source) {
        source.setData(selectedEarthquakeShakemap || { type: 'FeatureCollection', features: [] });
      }

      // 10km grid source
      if (!map.getSource('selected-earthquake-dyfi-10km-source')) {
        map.addSource('selected-earthquake-dyfi-10km-source', {
          type: 'geojson',
          data: selectedEarthquakeUsgsDyfi10km || { type: 'FeatureCollection', features: [] }
        });
        addLayerSafely(map, {
          id: 'selected-earthquake-dyfi-10km-fill',
          type: 'fill',
          source: 'selected-earthquake-dyfi-10km-source',
          paint: {
            'fill-color': ['coalesce', ['get', 'color'], '#ff0000'],
            'fill-opacity': 0.7
          }
        });
      } else {
        const source = map.getSource('selected-earthquake-dyfi-10km-source') as maplibregl.GeoJSONSource;
        if (source) {
          source.setData(selectedEarthquakeUsgsDyfi10km || { type: 'FeatureCollection', features: [] });
        }
      }

      // 1km grid source
      if (!map.getSource('selected-earthquake-dyfi-1km-source')) {
        map.addSource('selected-earthquake-dyfi-1km-source', {
          type: 'geojson',
          data: selectedEarthquakeUsgsDyfi1km || { type: 'FeatureCollection', features: [] }
        });
        addLayerSafely(map, {
          id: 'selected-earthquake-dyfi-1km-fill',
          type: 'fill',
          source: 'selected-earthquake-dyfi-1km-source',
          paint: {
            'fill-color': ['coalesce', ['get', 'color'], '#ff0000'],
            'fill-opacity': 0.7
          }
        });
      } else {
        const source = map.getSource('selected-earthquake-dyfi-1km-source') as maplibregl.GeoJSONSource;
        if (source) {
          source.setData(selectedEarthquakeUsgsDyfi1km || { type: 'FeatureCollection', features: [] });
        }
      }

      // Landslide source
      if (!map.getSource('selected-earthquake-landslide-source')) {
        map.addSource('selected-earthquake-landslide-source', {
          type: 'geojson',
          data: selectedEarthquakeUsgsLandslide || { type: 'FeatureCollection', features: [] }
        });
        addLayerSafely(map, {
          id: 'selected-earthquake-landslide-fill',
          type: 'fill',
          source: 'selected-earthquake-landslide-source',
          paint: {
            'fill-color': ['coalesce', ['get', 'Color'], '#ff0000'],
            'fill-opacity': 0.7
          }
        });
      } else {
        const source = map.getSource('selected-earthquake-landslide-source') as maplibregl.GeoJSONSource;
        if (source) {
          source.setData(selectedEarthquakeUsgsLandslide || { type: 'FeatureCollection', features: [] });
        }
      }

      // Liquefaction source
      if (!map.getSource('selected-earthquake-liquefaction-source')) {
        map.addSource('selected-earthquake-liquefaction-source', {
          type: 'geojson',
          data: selectedEarthquakeUsgsLiquefaction || { type: 'FeatureCollection', features: [] }
        });
        addLayerSafely(map, {
          id: 'selected-earthquake-liquefaction-fill',
          type: 'fill',
          source: 'selected-earthquake-liquefaction-source',
          paint: {
            'fill-color': ['coalesce', ['get', 'Color'], '#0000ff'],
            'fill-opacity': 0.7
          }
        });
      } else {
        const source = map.getSource('selected-earthquake-liquefaction-source') as maplibregl.GeoJSONSource;
        if (source) {
          source.setData(selectedEarthquakeUsgsLiquefaction || { type: 'FeatureCollection', features: [] });
        }
      }

      const eqLayer = settings.layers.find(l => l.type === 'gdacs_earthquakes');
      
      const useColor = eqLayer && eqLayer.colorCodeShakemap !== false;
      const colorExpr = useColor 
        ? [
            'step',
            ['to-number', ['get', 'intensity'], 0],
            '#ffffff',
            2, '#bfccff',
            4, '#a0e6ff',
            5, '#80ffff',
            6, '#7aff93',
            7, '#ffff00',
            8, '#ffc800',
            9, '#ff9100',
            10, '#ff0000'
          ]
        : null;
        
      const shakemapVisibility = (eqLayer && eqLayer.shakemapEnabled !== false) ? 'visible' : 'none';
      const isVisible = eqLayer ? (eqLayer._effectiveOpacityVisible ?? true) : false;
      const baseFillOpacity = isVisible ? (eqLayer?.shakemapOpacity ?? 1.0) * 0.3 : 0;
      const baseLineOpacity = isVisible ? (eqLayer?.shakemapOpacity ?? 1.0) * 0.8 : 0;
      
      if (map.getLayer('selected-earthquake-shakemap-fill')) {
        safeSetLayoutProperty(map, 'selected-earthquake-shakemap-fill', 'visibility', shakemapVisibility);
        safeSetPaintProperty(map, 'selected-earthquake-shakemap-fill', 'fill-color', colorExpr || ['coalesce', ['get', 'fill'], '#ff9900']);
        safeSetPaintProperty(map, 'selected-earthquake-shakemap-fill', 'fill-opacity', baseFillOpacity);
      }
      
      if (map.getLayer('selected-earthquake-shakemap-line')) {
        safeSetLayoutProperty(map, 'selected-earthquake-shakemap-line', 'visibility', shakemapVisibility);
        safeSetPaintProperty(map, 'selected-earthquake-shakemap-line', 'line-color', colorExpr || ['coalesce', ['get', 'stroke'], '#ff0000']);
        safeSetPaintProperty(map, 'selected-earthquake-shakemap-line', 'line-opacity', baseLineOpacity);
      }
    });
  }, [selectedEarthquakeShakemap, selectedEarthquakeUsgsDyfi10km, selectedEarthquakeUsgsDyfi1km, selectedEarthquakeUsgsLandslide, selectedEarthquakeUsgsLiquefaction, mapLoaded, settings.layers]);
};
