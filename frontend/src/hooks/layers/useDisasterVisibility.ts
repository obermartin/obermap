import { useEffect, useRef } from 'react';
import type { BaseLayerVisibilityProps } from './types';
import { getEffectiveLayerDates } from '../../utils/layerUtils';
import { parseWKT } from '../../utils/mapUtils';

export interface DisasterVisibilityProps extends BaseLayerVisibilityProps {
  setLayerFade: (id: string, type: string, isVisible: boolean, maxOpacity?: number, sidebarVisible?: boolean) => void;
}

export const useDisasterVisibility = (props: DisasterVisibilityProps) => {
  const {
    map, mapLoaded, mapStyleLoaded, mapStyleTick, settings, layers, firstAdminId, firstSymbolId, fallbackFont, setLayerFade
  } = props;

  const gdacsDataCacheRef = useRef<{ [cacheKey: string]: any }>({});

  useEffect(() => {
    if (!map || !mapLoaded || !mapStyleLoaded || !(map as any)._loaded || !(map as any).style || !(map as any).style._loaded) return;

    const disasterLayers = layers.filter(l => 
      l.type.startsWith('gdacs_') || l.type.startsWith('cems_') || l.type === 'wildfires' || l.id === 'floods'
    );

    disasterLayers.forEach((layer) => {
      const sourceId = `dynamic-source-${layer.id}`;
      const layerId = `dynamic-layer-${layer.id}`;

      if (layer.type === 'wildfires' && layer._isDirty) {
        if (map.getSource(`${sourceId}-effis`)) {
          if (map.getLayer(`${layerId}-effis`)) map.removeLayer(`${layerId}-effis`);
          map.removeSource(`${sourceId}-effis`);
        }
        layer._isDirty = false;
        const originalLayer = settings.layers.find(l => l.id === layer.id);
        if (originalLayer) originalLayer._isDirty = false;
      }

      if (!map.getSource(sourceId)) {
        if (layer.type === 'gdacs_earthquakes' || layer.type === 'cems_rapid_mapping' || layer.type === 'gdacs_volcanoes' || layer.type === 'gdacs_cyclones') {
          map.addSource(sourceId, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
        } else if (layer.type === 'wildfires') {
          if (!map.getSource(`${sourceId}-effis`)) {
            let baseEffisUrl = layer.url || 'https://maps.effis.emergency.copernicus.eu/gwis?service=WMS&request=GetMap&layers=nrt.ba&version=1.1.1&format=image/png&transparent=true&srs=EPSG:3857&width=512&height=512&styles=&bbox={bbox-epsg-3857}&time={date-start}/{date-end}';
            baseEffisUrl = baseEffisUrl.replace('width=256&height=256', 'width=512&height=512');
            const { effectiveStartDate, effectiveEndDate } = getEffectiveLayerDates(layer, settings);
            baseEffisUrl = baseEffisUrl.replace(/{date-start}/g, effectiveStartDate).replace(/{date-end}/g, effectiveEndDate);
            
            const proxiedUrl = `/api.php?action=proxy_effis&url=${encodeURIComponent(baseEffisUrl).replace('%7Bbbox-epsg-3857%7D', '{bbox-epsg-3857}')}`;
            map.addSource(`${sourceId}-effis`, { type: 'raster', tiles: [proxiedUrl], tileSize: 512 });
          }
          if (!map.getSource(`${sourceId}-gdacs`)) {
            map.addSource(`${sourceId}-gdacs`, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
          }
        }
      }

      if ((!map.getLayer(layerId) && map.getSource(sourceId)) || (layer.type === 'wildfires' && !map.getLayer(`${layerId}-effis`))) {
        if (layer.type === 'gdacs_earthquakes' || layer.type === 'gdacs_volcanoes' || layer.type === 'gdacs_cyclones') {
          map.addLayer({
            id: layerId,
            type: 'circle',
            source: sourceId,
            layout: { visibility: layer.visible ? 'visible' : 'none' },
            paint: {
              'circle-radius': layer.type === 'gdacs_volcanoes' ? 8 : [
                'interpolate', ['linear'], ['max', 4, ['coalesce', ['get', 'severity_numeric'], 5]],
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
        }
      }

      if (map.getLayer(layerId)) {
        map.setLayoutProperty(layerId, 'visibility', layer.visible ? 'visible' : 'none');
        if (layer.type === 'gdacs_earthquakes' || layer.type === 'gdacs_volcanoes') {
          setLayerFade(layerId, 'circle', layer._effectiveOpacityVisible ?? true, layer.opacity ?? 0.8, layer.visible);
          if (map.getLayer(`${layerId}-label`)) {
            setLayerFade(`${layerId}-label`, 'text', layer._effectiveOpacityVisible ?? true, 1.0, layer.visible);
            map.setLayoutProperty(`${layerId}-label`, 'visibility', layer.visible ? 'visible' : 'none');
          }
        } else if (layer.type === 'gdacs_cyclones') {
          setLayerFade(layerId, 'fill', layer._effectiveOpacityVisible ?? true, layer.opacity ?? 0.3, layer.visible);
        } else if (layer.type === 'cems_rapid_mapping') {
          setLayerFade(layerId, 'circle', layer._effectiveOpacityVisible ?? true, layer.opacity ?? 0.8, layer.visible);
          if (map.getLayer(`${layerId}-label`)) {
            setLayerFade(`${layerId}-label`, 'text', layer._effectiveOpacityVisible ?? true, 1.0, layer.visible);
            map.setLayoutProperty(`${layerId}-label`, 'visibility', layer.visible ? 'visible' : 'none');
          }
        }
      }

      if (layer.type === 'wildfires' && map.getLayer(`${layerId}-effis`)) {
        setLayerFade(`${layerId}-effis`, 'raster', layer._effectiveOpacityVisible ?? true, layer.opacity ?? 0.75, layer.visible);
        map.setLayoutProperty(`${layerId}-effis`, 'visibility', layer.visible ? 'visible' : 'none');
      }
    });

    for (const layer of layers) {
      if (!layer.visible) continue;
      if (layer.type.startsWith('gdacs_') || layer.type === 'cems_rapid_mapping') {
        const sourceId = `dynamic-source-${layer.id}`;
        let { effectiveStartDate: startDate, effectiveEndDate: endDate } = getEffectiveLayerDates(layer, settings);
        
        // CEMS data is fetched once (limit=50) and cached without dates, then filtered client-side.
        const cacheKey = layer.type === 'cems_rapid_mapping' 
          ? `${layer.type}-base` 
          : `${layer.type}-${startDate}-${endDate}`;

        if (gdacsDataCacheRef.current[cacheKey]) {
          if ((map as any)[`_gdacsAppliedKey_${layer.id}`] !== `${cacheKey}-${startDate}-${endDate}`) {
            const source = map.getSource(sourceId) as maplibregl.GeoJSONSource;
            if (source) {
              let finalData = gdacsDataCacheRef.current[cacheKey];
              
              if (layer.type === 'cems_rapid_mapping') {
                 // Filter cached CEMS data by the current timeslider dates
                 const start = new Date(startDate).getTime();
                 const end = new Date(endDate).getTime();
                 finalData = {
                   ...finalData,
                   features: finalData.features.filter((f: any) => {
                     const activationT = new Date(f.properties.activationTime || f.properties.eventTime).getTime();
                     const endT = f.properties.closed 
                       ? new Date(f.properties.lastUpdate || f.properties.activationTime).getTime() 
                       : Date.now();
                     return activationT <= end && endT >= start;
                   })
                 };
              }
              
              source.setData(finalData);
              (map as any)[`_gdacsAppliedKey_${layer.id}`] = `${cacheKey}-${startDate}-${endDate}`;
            }
          }
        } else {
          // Cancel any in-flight requests for this layer (for a DIFFERENT key)
          if ((map as any)[`_gdacsAbort_${layer.id}`]) {
            (map as any)[`_gdacsAbort_${layer.id}`].abort();
          }
          const abortController = new AbortController();
          (map as any)[`_gdacsAbort_${layer.id}`] = abortController;
          (map as any)[`_gdacsPendingKey_${layer.id}`] = cacheKey;

          (async () => {
            try {
              let geojsonData: any = { type: 'FeatureCollection', features: [] };
              if (layer.type === 'cems_rapid_mapping') {
                const rawUrl = `https://rapidmapping.emergency.copernicus.eu/backend/dashboard-api/public-activations-info/?limit=50`;
                const url = `./api.php?action=proxy_cems&url=${encodeURIComponent(rawUrl)}`;
                const res = await fetch(url, { signal: abortController.signal });
                if (!res.ok) throw new Error(`Failed to fetch CEMS data`);
                const data = await res.json();
                if (data && data.results) {
                  geojsonData.features = data.results
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
                let rawUrl = `https://www.gdacs.org/gdacsapi/api/Events/geteventlist/search?eventlist=${eventlist}&fromDate=${startDate}&toDate=${endDate}`;

                const url = eventlist === 'VO' 
                  ? rawUrl 
                  : `./api.php?action=proxy_gdacs&url=${encodeURIComponent(rawUrl)}`;
                
                const res = await fetch(url, { signal: abortController.signal });
                if (!res.ok) throw new Error(`Failed to fetch GDACS data: ${res.statusText}`);
                const text = await res.text();
                const data = text ? JSON.parse(text) : { type: 'FeatureCollection', features: [] };
                geojsonData = data;

                if (geojsonData && geojsonData.features) {
                  if (layer.selectedFeatureData && layer.selectedFeatureData.properties) {
                    const exists = geojsonData.features.some((f: any) => f.properties?.eventid === layer.selectedFeatureData?.id);
                    if (!exists) {
                      geojsonData.features.push({
                        type: 'Feature',
                        geometry: { type: 'Point', coordinates: layer.selectedFeatureData.coordinates },
                        properties: layer.selectedFeatureData.properties
                      });
                    }
                  }

                  geojsonData.features.forEach((f: any) => {
                    if (f.properties) {
                      f.properties.severity_numeric = f.properties.severitydata?.severity ?? f.properties.severity ?? 0;
                    }
                  });
                }
              }
              gdacsDataCacheRef.current[cacheKey] = geojsonData;
              if (map && map.getStyle() && map.getSource(sourceId)) {
                let finalData = geojsonData;
                if (layer.type === 'cems_rapid_mapping') {
                  const start = new Date(startDate).getTime();
                  const end = new Date(endDate).getTime();
                  finalData = {
                    ...finalData,
                    features: finalData.features.filter((f: any) => {
                      const activationT = new Date(f.properties.activationTime || f.properties.eventTime).getTime();
                      const endT = f.properties.closed 
                        ? new Date(f.properties.lastUpdate || f.properties.activationTime).getTime() 
                        : Date.now();
                      return activationT <= end && endT >= start;
                    })
                  };
                }
                (map.getSource(sourceId) as maplibregl.GeoJSONSource).setData(finalData);
                (map as any)[`_gdacsAppliedKey_${layer.id}`] = `${cacheKey}-${startDate}-${endDate}`;
              }
            } catch (err: any) {
              if (err.name === 'AbortError') return;
              console.error(`Error fetching GDACS for type ${layer.type}:`, err);
              const emptyData = { type: 'FeatureCollection' as const, features: [] };
              gdacsDataCacheRef.current[cacheKey] = emptyData;
              if (map && map.getStyle() && map.getSource(sourceId)) {
                (map.getSource(sourceId) as maplibregl.GeoJSONSource).setData(emptyData);
                (map as any)[`_gdacsAppliedKey_${layer.id}`] = cacheKey;
              }
            }
          })();
        }
      }
    }
  }, [map, mapLoaded, mapStyleLoaded, mapStyleTick, settings, layers, firstAdminId, firstSymbolId, fallbackFont, setLayerFade]);
};
