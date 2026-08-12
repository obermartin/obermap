import { useEffect, useRef } from 'react';
import type { BaseLayerVisibilityProps } from './types';
import { getEffectiveLayerDates } from '../../utils/layerUtils';

let globalDeepstateHistory: { id: number; createdAt: string }[] | null = null;
let globalDeepstateHistoryPromise: Promise<{ id: number; createdAt: string; }[] | null> | null = null;

export interface CustomLayerVisibilityProps extends BaseLayerVisibilityProps {
  setLayerFade: (id: string, type: string, isVisible: boolean, maxOpacity?: number, sidebarVisible?: boolean) => void;
  selectedAircraftId: string | null;
  selectedVesselMmsi: string | null;
}

export const useCustomLayerVisibility = (props: CustomLayerVisibilityProps) => {
  const {
    map, mapLoaded, mapStyleLoaded, mapStyleTick, settings, layers, firstAdminId, firstSymbolId, fallbackFont, setLayerFade,
    selectedAircraftId, selectedVesselMmsi
  } = props;

  const deepstateDataCacheRef = useRef<{ [cacheKey: string]: any }>({});

  useEffect(() => {
    if (!map || !mapLoaded || !mapStyleLoaded || !(map as any)._loaded || !(map as any).style || !(map as any).style._loaded) return;

    const customLayers = layers.filter(l => l.type === 'geojson' || l.type === 'deepstate' || l.type === 'flights' || l.type === 'vessels');

    customLayers.forEach((layer) => {
      const sourceId = `dynamic-source-${layer.id}`;
      const layerId = `dynamic-layer-${layer.id}`;
      const lineId = `dynamic-line-${layer.id}`;

      if (!map.getSource(sourceId)) {
        if (layer.type === 'geojson' && layer.data) {
          map.addSource(sourceId, { type: 'geojson', data: layer.data });
        } else if (layer.type === 'deepstate' || layer.type === 'flights' || layer.type === 'vessels') {
          map.addSource(sourceId, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
        }
      } else {
        if (layer.type === 'geojson' && layer.data) {
          (map.getSource(sourceId) as maplibregl.GeoJSONSource).setData(layer.data);
        }
      }

      if (!map.getLayer(layerId) && map.getSource(sourceId)) {
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
                'airplane'
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
      }

      if (map.getLayer(layerId)) {
        map.setLayoutProperty(layerId, 'visibility', layer.visible ? 'visible' : 'none');
        
        if (layer.type === 'deepstate') {
          setLayerFade(layerId, 'fill', layer._effectiveOpacityVisible ?? true, layer.opacity ?? 0.5, layer.visible);
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
          setLayerFade(layerId, 'icon', layer._effectiveOpacityVisible ?? true, iconOpacityBase as any, layer.visible);
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
            setLayerFade(`${layerId}-labels`, 'text', isLabelVisible, labelOpacityBase as any, layer.visible);
            map.setPaintProperty(`${layerId}-labels`, 'text-color', colorExp as any);
          } else if (layer.showCallsigns && !layer.is3DMode) {
            const currentFirstSymbolId = map.getStyle().layers?.find(l => l.type === 'symbol')?.id;
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
            }, currentFirstSymbolId);
          }
          if (map.getLayer('selected-flight-track-layer')) {
            const opacity = layer.flightpathOpacity ?? 0.8;
            const colorExpTrack = layer.aircraftColors && Object.keys(layer.aircraftColors).length > 0 
              ? [
                  'match', 
                  selectedAircraftId || '', 
                  ...Object.entries(layer.aircraftColors).flat(),
                  layer.globalAircraftColor || '#ffffff'
                ] 
              : (layer.globalAircraftColor || '#ffffff');
              
            map.setPaintProperty('selected-flight-track-layer', 'line-opacity', layer.is3DMode ? 0.3 : opacity);
            map.setPaintProperty('selected-flight-track-layer', 'line-color', layer.is3DMode ? '#000000' : colorExpTrack as any);
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
          setLayerFade(layerId, 'icon', layer._effectiveOpacityVisible ?? true, iconOpacityBase as any, layer.visible);
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
        } else if (layer.type === 'geojson') {
          setLayerFade(layerId, 'fill', layer._effectiveOpacityVisible ?? true, ['coalesce', ['get', 'fillOpacity'], 0.5] as any, layer.visible);
        }
      }

      if (map.getLayer(lineId)) {
        map.setLayoutProperty(lineId, 'visibility', layer.visible ? 'visible' : 'none');
        if (layer.type === 'geojson') {
          setLayerFade(lineId, 'line', layer._effectiveOpacityVisible ?? true, ['coalesce', ['get', 'lineOpacity'], 1.0] as any, layer.visible);
        }
      }

      if (layer.type === 'deepstate') {
        const { effectiveStartDate: targetDate } = getEffectiveLayerDates(layer, settings);
        
        const cacheKey = `${layer.id}-${targetDate}`;
        if (deepstateDataCacheRef.current[cacheKey]) {
          if ((map as any)[`_deepstateAppliedKey_${layer.id}`] !== cacheKey) {
            const source = map.getSource(sourceId) as maplibregl.GeoJSONSource;
            if (source) {
              source.setData(deepstateDataCacheRef.current[cacheKey]);
              (map as any)[`_deepstateAppliedKey_${layer.id}`] = cacheKey;
            }
          }
        } else if ((map as any)[`_deepstatePendingKey_${layer.id}`] === cacheKey) {
          // Already fetching this exact key, don't abort and restart
        } else {
          (map as any)[`_deepstatePendingKey_${layer.id}`] = cacheKey;
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
                if (source) {
                  source.setData(polygonsOnly);
                  (map as any)[`_deepstateAppliedKey_${layer.id}`] = cacheKey;
                }
              }
            } catch (err) {
              console.error(`Error fetching deepstate for date ${targetDate}:`, err);
              const emptyData = { type: 'FeatureCollection' as const, features: [] };
              deepstateDataCacheRef.current[cacheKey] = emptyData;
              const source = map.getSource(sourceId) as maplibregl.GeoJSONSource;
              if (source) {
                source.setData(emptyData);
                (map as any)[`_deepstateAppliedKey_${layer.id}`] = cacheKey;
              }
            }
          })();
        }
      }
    });
  }, [map, mapLoaded, mapStyleLoaded, mapStyleTick, settings, layers, firstAdminId, firstSymbolId, fallbackFont, setLayerFade, selectedAircraftId, selectedVesselMmsi]);
};
