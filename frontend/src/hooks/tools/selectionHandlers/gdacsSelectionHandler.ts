import maplibregl from 'maplibre-gl';
import type { AppSettings } from '../../../types';
import type { MutableRefObject } from 'react';

export const handleGdacsSelection = (
  e: maplibregl.MapMouseEvent,
  map: maplibregl.Map,
  settings: AppSettings,
  setSettings: React.Dispatch<React.SetStateAction<AppSettings>>,
  selectedCycloneIdRef: MutableRefObject<{ id: string, ep: string } | null>,
  selectedEarthquakeRef: MutableRefObject<{ id: string, ep: string } | null>,
  selectedVolcanoRef: MutableRefObject<{ id: string, ep: string } | null>
): boolean => {
  let clickedCycloneId: { id: string, ep: string } | null = null;
  let clickedCycloneLayerId: string | null = null;
  try {
    const cycloneLayers = settings.layers.filter(l => l.type === 'gdacs_cyclones');
    const cycloneLayerIds = cycloneLayers.map(l => `dynamic-layer-${l.id}`);
    if (cycloneLayerIds.length > 0) {
      const cycloneFeatures = map.queryRenderedFeatures(e.point, { layers: cycloneLayerIds });
      if (cycloneFeatures.length > 0) {
        const props = cycloneFeatures[0].properties;
        if (props && props.eventid && props.episodeid) {
          clickedCycloneId = { id: props.eventid.toString(), ep: props.episodeid.toString() };
          clickedCycloneLayerId = cycloneFeatures[0].layer.id.replace('dynamic-layer-', '');
        }
      }
    }
  } catch (err) {}

  if (clickedCycloneId && clickedCycloneLayerId) {
    if (selectedCycloneIdRef.current?.id === clickedCycloneId.id) {
      setSettings(prev => ({
        ...prev,
        layers: prev.layers.map(l => l.id === clickedCycloneLayerId ? { ...l, selectedFeatureData: null } : l)
      }));
    } else {
      const feat = clickedCycloneId;
      setSettings(prev => ({
        ...prev,
        layers: prev.layers.map(l => l.id === clickedCycloneLayerId ? { ...l, selectedFeatureData: feat } : l)
      }));
    }
    return true;
  } else {
    if (selectedCycloneIdRef.current) {
      setSettings(prev => ({
        ...prev,
        layers: prev.layers.map(l => l.type === 'gdacs_cyclones' ? { ...l, selectedFeatureData: null } : l)
      }));
    }
  }

  let clickedEarthquake: { id: string, ep: string, geomUrl: string, coordinates: [number, number], properties: any } | null = null;
  let clickedEqLayerId: string | null = null;
  try {
    const earthquakeLayers = settings.layers.filter(l => l.type === 'gdacs_earthquakes');
    const eqLayerIds = earthquakeLayers.map(l => `dynamic-layer-${l.id}`);
    if (eqLayerIds.length > 0) {
      const eqFeatures = map.queryRenderedFeatures(e.point, { layers: eqLayerIds });
      if (eqFeatures.length > 0) {
        const props = eqFeatures[0].properties;
        const geom = eqFeatures[0].geometry as GeoJSON.Point;
        if (props && props.eventid && props.episodeid && geom && geom.type === 'Point') {
          let geomUrl = '';
          if (props.url) {
            try {
              const urlObj = typeof props.url === 'string' ? JSON.parse(props.url) : props.url;
              if (urlObj && typeof urlObj === 'object' && urlObj.geometry) {
                geomUrl = urlObj.geometry;
              }
            } catch (err) {}
          }
          if (!geomUrl) {
            geomUrl = `https://www.gdacs.org/gdacsapi/api/polygons/getgeometry?eventtype=EQ&eventid=${props.eventid}&episodeid=${props.episodeid}`;
          }
          clickedEarthquake = { 
            id: props.eventid.toString(), 
            ep: props.episodeid.toString(), 
            geomUrl: geomUrl,
            coordinates: geom.coordinates as [number, number],
            properties: props
          };
          clickedEqLayerId = eqFeatures[0].layer.id.replace('dynamic-layer-', '');
        }
      }
    }
  } catch (err) {}

  if (clickedEarthquake && clickedEqLayerId) {
    if (selectedEarthquakeRef.current?.id === clickedEarthquake.id) {
      setSettings(prev => ({
        ...prev,
        layers: prev.layers.map(l => l.id === clickedEqLayerId ? { ...l, selectedFeatureData: null } : l)
      }));
    } else {
      const feat = clickedEarthquake;
      setSettings(prev => ({
        ...prev,
        layers: prev.layers.map(l => l.id === clickedEqLayerId ? { ...l, selectedFeatureData: feat } : l)
      }));
    }
    return true;
  } else {
    if (selectedEarthquakeRef.current) {
      setSettings(prev => ({
        ...prev,
        layers: prev.layers.map(l => l.type === 'gdacs_earthquakes' ? { ...l, selectedFeatureData: null } : l)
      }));
    }
  }

  let clickedVolcano: { id: string, ep: string, geomUrl: string, coordinates: [number, number], properties: any } | null = null;
  let clickedVolLayerId: string | null = null;
  try {
    const volcanoLayers = settings.layers.filter(l => l.type === 'gdacs_volcanoes');
    const volLayerIds = volcanoLayers.map(l => `dynamic-layer-${l.id}`);
    if (volLayerIds.length > 0) {
      const volFeatures = map.queryRenderedFeatures(e.point, { layers: volLayerIds });
      if (volFeatures.length > 0) {
        const props = volFeatures[0].properties;
        const geom = volFeatures[0].geometry as GeoJSON.Point;
        if (props && props.eventid && props.episodeid && geom && geom.type === 'Point') {
          let geomUrl = '';
          if (props.url) {
            try {
              const urlObj = typeof props.url === 'string' ? JSON.parse(props.url) : props.url;
              if (urlObj && typeof urlObj === 'object' && urlObj.geometry) {
                geomUrl = urlObj.geometry;
              }
            } catch (err) {}
          }
          if (!geomUrl) {
            geomUrl = `https://www.gdacs.org/gdacsapi/api/polygons/getgeometry?eventtype=VO&eventid=${props.eventid}&episodeid=${props.episodeid}`;
          }
          clickedVolcano = { 
            id: props.eventid.toString(), 
            ep: props.episodeid.toString(), 
            geomUrl: geomUrl,
            coordinates: geom.coordinates as [number, number],
            properties: props
          };
          clickedVolLayerId = volFeatures[0].layer.id.replace('dynamic-layer-', '');
        }
      }
    }
  } catch (err) {}

  if (clickedVolcano && clickedVolLayerId) {
    if (selectedVolcanoRef.current?.id === clickedVolcano.id) {
      setSettings(prev => ({
        ...prev,
        layers: prev.layers.map(l => l.id === clickedVolLayerId ? { ...l, selectedFeatureData: null } : l)
      }));
    } else {
      const feat = clickedVolcano;
      setSettings(prev => ({
        ...prev,
        layers: prev.layers.map(l => l.id === clickedVolLayerId ? { ...l, selectedFeatureData: feat } : l)
      }));
    }
    return true;
  } else {
    if (selectedVolcanoRef.current) {
      setSettings(prev => ({
        ...prev,
        layers: prev.layers.map(l => l.type === 'gdacs_volcanoes' ? { ...l, selectedFeatureData: null } : l)
      }));
    }
  }

  return false;
};
