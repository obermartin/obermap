import maplibregl from 'maplibre-gl';
import type { AppSettings } from '../../../types';

export const handleGeojsonSelection = (
  e: maplibregl.MapMouseEvent,
  map: maplibregl.Map,
  settings: AppSettings,
  activeGeojsonLayerId: string | null,
  setActiveGeojsonLayerId: (id: string | null) => void,
  setSelectedGeojsonFeatureId: (id: string | number | null) => void
): boolean => {
  const activeLayer = settings.layers.find(l => l.id === activeGeojsonLayerId);
  if (activeGeojsonLayerId && activeLayer?.type === 'geojson') {
    const geojsonLayerId = `dynamic-layer-${activeGeojsonLayerId}`;
    const geojsonLineLayerId = `dynamic-line-${activeGeojsonLayerId}`;
    let clickedGeojsonFeatureId: string | number | null = null;
    
    try {
      const features = map.queryRenderedFeatures(e.point, { layers: [geojsonLayerId, geojsonLineLayerId] });
      if (features.length > 0) {
        clickedGeojsonFeatureId = features[0].properties?.id || features[0].id;
      }
    } catch (err) {}

    if (clickedGeojsonFeatureId) {
      setSelectedGeojsonFeatureId(clickedGeojsonFeatureId);
    } else {
      setActiveGeojsonLayerId(null);
      setSelectedGeojsonFeatureId(null);
    }
    return true;
  }
  return false;
};
