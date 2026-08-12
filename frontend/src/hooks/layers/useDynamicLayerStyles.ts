import maplibregl from 'maplibre-gl';
import { addVectorLayers, updateVectorLayerStyles } from './styles/vectorStyles';
import { addDisasterLayers, updateDisasterLayerStyles } from './styles/disasterStyles';
import { addRasterLayers, updateRasterLayerStyles } from './styles/rasterStyles';
import { addTrafficLayers, updateTrafficLayerStyles } from './styles/trafficStyles';

export const addStandardDynamicLayers = (
  map: maplibregl.Map,
  layer: any,
  sourceId: string,
  layerId: string,
  lineId: string,
  firstAdminId: string | undefined,
  firstSymbolId: string | undefined,
  fallbackFont: string[],
  selectedAircraftId: string | null,
  selectedVesselMmsi: string | null
) => {
  if ((!map.getLayer(layerId) && map.getSource(sourceId)) || (layer.type === 'wildfires' && !map.getLayer(`${layerId}-effis`))) {
    if (layer.type === 'geojson' || layer.type === 'deepstate') {
      addVectorLayers(map, layer, sourceId, layerId, lineId, firstAdminId);
    } else if (layer.type === 'gdacs_earthquakes' || layer.type === 'gdacs_volcanoes' || layer.type === 'gdacs_cyclones' || layer.type === 'cems_rapid_mapping') {
      addDisasterLayers(map, layer, sourceId, layerId, firstSymbolId, fallbackFont);
    } else if (layer.type === 'nighttime' || layer.type === 'wildfires' || layer.type === 'raster' || layer.type === 'satellite') {
      addRasterLayers(map, layer, sourceId, layerId, firstAdminId);
    } else if (layer.type === 'flights' || layer.type === 'vessels') {
      addTrafficLayers(map, layer, sourceId, layerId, firstSymbolId, fallbackFont, selectedAircraftId, selectedVesselMmsi);
    }
  }
};

export const updateStandardDynamicLayerStyles = (
  map: maplibregl.Map,
  layer: any,
  layerId: string,
  lineId: string,
  fallbackFont: string[],
  selectedAircraftId: string | null,
  selectedVesselMmsi: string | null,
  layerFadeTimeoutsRef: React.MutableRefObject<Record<string, any>>,
  fadeDuration: number
) => {
  if (layer.type === 'geojson' || layer.type === 'deepstate') {
    updateVectorLayerStyles(map, layer, layerId, lineId, layerFadeTimeoutsRef, fadeDuration);
  } else if (layer.type === 'gdacs_earthquakes' || layer.type === 'gdacs_volcanoes' || layer.type === 'cems_rapid_mapping') {
    updateDisasterLayerStyles(map, layer, layerId, layerFadeTimeoutsRef, fadeDuration);
  } else if (layer.type === 'nighttime' || layer.type === 'wildfires' || layer.type === 'raster' || layer.type === 'satellite') {
    updateRasterLayerStyles(map, layer, layerId, layerFadeTimeoutsRef, fadeDuration);
  } else if (layer.type === 'flights' || layer.type === 'vessels') {
    updateTrafficLayerStyles(map, layer, layerId, fallbackFont, selectedAircraftId, selectedVesselMmsi, layerFadeTimeoutsRef, fadeDuration);
  }
};
