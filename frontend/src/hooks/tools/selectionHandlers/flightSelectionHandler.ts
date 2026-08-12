import maplibregl from 'maplibre-gl';
import type { AppSettings } from '../../../types';

export const handleFlightSelection = (
  e: maplibregl.MapMouseEvent,
  map: maplibregl.Map,
  settings: AppSettings,
  selectedAircraftId: string | null,
  setSelectedAircraftId: (id: string | null) => void
): boolean => {
  let clickedFlightId: string | null = null;
  try {
    const flightLayers = settings.layers.filter(l => l.type === 'flights').map(l => `dynamic-layer-${l.id}`);
    if (flightLayers.length > 0) {
      const flightFeatures = map.queryRenderedFeatures(e.point, { layers: flightLayers });
      if (flightFeatures.length > 0) {
        clickedFlightId = flightFeatures[0].properties?.icao24 || null;
      }
    }
  } catch (err) {}

  if (clickedFlightId) {
    if (selectedAircraftId === clickedFlightId) {
      setSelectedAircraftId(null);
    } else {
      setSelectedAircraftId(clickedFlightId);
    }
    return true;
  } else {
    if (selectedAircraftId) {
      setSelectedAircraftId(null);
    }
  }

  return false;
};
