import maplibregl from 'maplibre-gl';
import { getEffectiveLayerDates } from '../../utils/layerUtils';

let globalDeepstateHistory: { id: number; createdAt: string }[] | null = null;
let globalDeepstateHistoryPromise: Promise<{ id: number; createdAt: string; }[] | null> | null = null;

export const fetchDeepstateData = (
  map: maplibregl.Map,
  layer: any,
  settings: any,
  sourceId: string,
  deepstateDataCacheRef: React.MutableRefObject<Record<string, any>>
) => {
  const { effectiveStartDate: targetDate } = getEffectiveLayerDates(layer, settings);
  
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
};
