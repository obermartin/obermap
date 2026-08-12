import maplibregl from 'maplibre-gl';
import type { AppSettings } from '../../../types';
import type { MutableRefObject } from 'react';

export const handleCemsSelection = (
  e: maplibregl.MapMouseEvent,
  map: maplibregl.Map,
  settings: AppSettings,
  setSettings: React.Dispatch<React.SetStateAction<AppSettings>>,
  selectedCemsEarthquakeRef: MutableRefObject<{ id: string, code: string } | null>
): boolean => {
  let clickedAoiFeatures: maplibregl.MapGeoJSONFeature[] = [];
  try {
    const possibleLayers = ['active-wildfire-cems-vt-extent-fill', 'active-flood-cems-vt-extent-fill', 'selected-cems-vt-extent-fill'];
    const activeLayers = possibleLayers.filter(l => map.getLayer(l));
    
    if (activeLayers.length > 0) {
      const cemsFeatures = map.queryRenderedFeatures(e.point, { layers: activeLayers });
      
      const uniqueAoiNames = new Set<string>();
      for (const feature of cemsFeatures) {
        const props = feature.properties || {};
        if (props.aoiName) {
          if (!uniqueAoiNames.has(props.aoiName)) {
            uniqueAoiNames.add(props.aoiName);
            clickedAoiFeatures.push(feature);
          }
        }
      }
    }
  } catch (err) {
    console.error('Error querying CEMS features:', err);
  }

  if (clickedAoiFeatures.length > 0) {
    clickedAoiFeatures.forEach(aoi => {
      if (aoi.properties?.activationCode) {
        let products = undefined;
        try { products = JSON.parse(aoi.properties._products); } catch (e) {}
        window.dispatchEvent(new CustomEvent('fetchCemsDetails', {
          detail: {
            activationCode: aoi.properties.activationCode,
            aoiName: aoi.properties.aoiName,
            cemsType: aoi.properties.cemsType,
            products
          }
        }));
      }
    });
    return true;
  }

  let clickedCemsEarthquake: { id: string, code: string, properties: any, coordinates: [number, number] } | null = null;
  let clickedCemsLayerId: string | null = null;
  try {
    const cemsLayers = settings.layers.filter(l => l.type === 'cems_rapid_mapping');
    const cemsLayerIds = cemsLayers.map(l => `dynamic-layer-${l.id}`);
    if (cemsLayerIds.length > 0) {
      const cemsFeatures = map.queryRenderedFeatures(e.point, { layers: cemsLayerIds });
      if (cemsFeatures.length > 0) {
        const props = cemsFeatures[0].properties;
        const geom = cemsFeatures[0].geometry as GeoJSON.Point;
        if (props && props.code && geom && geom.type === 'Point') {
          clickedCemsEarthquake = { 
            id: props.code, 
            code: props.code, 
            properties: props,
            coordinates: geom.coordinates as [number, number]
          };
          clickedCemsLayerId = cemsFeatures[0].layer.id.replace('dynamic-layer-', '');
        }
      }
    }
  } catch (err) {}

  if (clickedCemsEarthquake && clickedCemsLayerId) {
    if (selectedCemsEarthquakeRef.current?.id === clickedCemsEarthquake.id) {
      setSettings(prev => ({
        ...prev,
        layers: prev.layers.map(l => l.id === clickedCemsLayerId ? { ...l, selectedFeatureData: null } : l)
      }));
    } else {
      const feat = clickedCemsEarthquake;
      setSettings(prev => ({
        ...prev,
        layers: prev.layers.map(l => l.id === clickedCemsLayerId ? { ...l, selectedFeatureData: feat } : l)
      }));
    }
    return true;
  } else {
    if (selectedCemsEarthquakeRef.current) {
      setSettings(prev => ({
        ...prev,
        layers: prev.layers.map(l => l.type === 'cems_rapid_mapping' ? { ...l, selectedFeatureData: null } : l)
      }));
    }
  }

  return false;
};
