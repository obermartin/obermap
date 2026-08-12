import maplibregl from 'maplibre-gl';
import { getEffectiveLayerDates } from '../../utils/layerUtils';
import { parseWKT } from '../../utils/mapUtils';

export const fetchGDACSData = (
  map: maplibregl.Map,
  layers: any[],
  settings: any,
  gdacsDataCacheRef: React.MutableRefObject<Record<string, any>>
) => {
  for (const layer of layers) {
    if (!layer.visible) continue;
    
    if (layer.type.startsWith('gdacs_') || layer.type === 'cems_rapid_mapping') {
      const sourceId = `dynamic-source-${layer.id}`;
      let { effectiveStartDate: startDate, effectiveEndDate: endDate } = getEffectiveLayerDates(layer, settings);
      const cacheKey = `${layer.type}-${startDate}-${endDate}`;
      
      if (gdacsDataCacheRef.current[cacheKey]) {
        const source = map.getSource(sourceId) as maplibregl.GeoJSONSource;
        if (source) source.setData(gdacsDataCacheRef.current[cacheKey]);
      } else {
        (async () => {
          try {
            let geojsonData: any = { type: 'FeatureCollection', features: [] };
            if (layer.type === 'cems_rapid_mapping') {
              const url = `https://rapidmapping.emergency.copernicus.eu/backend/dashboard-api/public-activations-info/?limit=50`;
              const res = await fetch(url);
              if (!res.ok) throw new Error(`Failed to fetch CEMS data`);
              const data = await res.json();
              if (data && data.results) {
                geojsonData.features = data.results
                  .filter((act: any) => act.category === 'Earthquake')
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
              const rawUrl = `https://www.gdacs.org/gdacsapi/api/Events/geteventlist/search?eventlist=${eventlist}&fromDate=${startDate}&toDate=${endDate}`;
              const url = `./api.php?action=proxy_gdacs&url=${encodeURIComponent(rawUrl)}`;
              const res = await fetch(url);
              if (!res.ok) throw new Error(`Failed to fetch GDACS data: ${res.statusText}`);
              const text = await res.text();
              const data = text ? JSON.parse(text) : { type: 'FeatureCollection', features: [] };
              geojsonData = data;

              if (geojsonData && geojsonData.features) {
                geojsonData.features.forEach((f: any) => {
                  if (f.properties) {
                    f.properties.severity_numeric = f.properties.severitydata?.severity ?? f.properties.severity ?? 0;
                  }
                });
              }
            }
            gdacsDataCacheRef.current[cacheKey] = geojsonData;
            if (map && map.getStyle() && map.getSource(sourceId)) {
              (map.getSource(sourceId) as maplibregl.GeoJSONSource).setData(geojsonData);
            }
          } catch (err) {
            console.error(`Error fetching GDACS for type ${layer.type}:`, err);
            const emptyData = { type: 'FeatureCollection' as const, features: [] };
            gdacsDataCacheRef.current[cacheKey] = emptyData;
            if (map && map.getStyle() && map.getSource(sourceId)) {
              (map.getSource(sourceId) as maplibregl.GeoJSONSource).setData(emptyData);
            }
          }
        })();
      }
    }
  }
};
