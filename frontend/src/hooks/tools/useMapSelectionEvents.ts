import type { MutableRefObject } from 'react';
import maplibregl from 'maplibre-gl';
import type { AppSettings } from '../../types';
import { handleGeojsonSelection } from './selectionHandlers/geojsonSelectionHandler';
import { handleCemsSelection } from './selectionHandlers/cemsSelectionHandler';
import { handleFlightSelection } from './selectionHandlers/flightSelectionHandler';
import { handleGdacsSelection } from './selectionHandlers/gdacsSelectionHandler';
import { handleVesselSelection } from './selectionHandlers/vesselSelectionHandler';

interface SelectionRefs {
  selectedCycloneIdRef: MutableRefObject<{ id: string, ep: string } | null>;
  selectedEarthquakeRef: MutableRefObject<{ id: string, ep: string } | null>;
  selectedVolcanoRef: MutableRefObject<{ id: string, ep: string } | null>;
  selectedCemsEarthquakeRef: MutableRefObject<{ id: string, code: string } | null>;
  activeVesselMmsiRef: MutableRefObject<string | null>;
  vesselPopupRef: MutableRefObject<maplibregl.Popup | null>;
  vesselsRef: MutableRefObject<Map<string, any>>;
}

interface UseMapSelectionEventsProps extends SelectionRefs {
  map: maplibregl.Map | null;
  settings: AppSettings;
  setSettings: React.Dispatch<React.SetStateAction<AppSettings>>;
  activeGeojsonLayerId: string | null;
  setActiveGeojsonLayerId: (id: string | null) => void;
  setSelectedGeojsonFeatureId: (id: string | number | null) => void;
  selectedAircraftId: string | null;
  setSelectedAircraftId: (id: string | null) => void;
  getMmsiFlagHtml: (mmsiStr: string) => string;
}

export const useMapSelectionEvents = ({
  map,
  settings,
  setSettings,
  activeGeojsonLayerId,
  setActiveGeojsonLayerId,
  setSelectedGeojsonFeatureId,
  selectedAircraftId,
  setSelectedAircraftId,
  getMmsiFlagHtml,
  selectedCycloneIdRef,
  selectedEarthquakeRef,
  selectedVolcanoRef,
  selectedCemsEarthquakeRef,
  activeVesselMmsiRef,
  vesselPopupRef,
  vesselsRef
}: UseMapSelectionEventsProps) => {
  
  const handleSelectionClick = (e: maplibregl.MapMouseEvent): boolean => {
    if (!map) return false;

    if (handleGeojsonSelection(e, map, settings, activeGeojsonLayerId, setActiveGeojsonLayerId, setSelectedGeojsonFeatureId)) return true;
    if (handleCemsSelection(e, map, settings, setSettings, selectedCemsEarthquakeRef)) return true;
    if (handleFlightSelection(e, map, settings, selectedAircraftId, setSelectedAircraftId)) return true;
    if (handleGdacsSelection(e, map, settings, setSettings, selectedCycloneIdRef, selectedEarthquakeRef, selectedVolcanoRef)) return true;
    if (handleVesselSelection(e, map, settings, activeVesselMmsiRef, vesselPopupRef, vesselsRef, getMmsiFlagHtml)) return true;

    return false;
  };

  return handleSelectionClick;
};
