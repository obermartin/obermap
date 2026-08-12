import { useRef } from 'react';
import maplibregl from 'maplibre-gl';
import type { Annotation, ToolType, StrokeType, RouteMode, AppSettings } from '../types';
import { getMmsiFlagHtml } from '../utils/mapUtils';
import { fetchRouteSegment } from '../utils/routingUtils';
import { useMapSelectionEvents } from './tools/useMapSelectionEvents';
import { useDrawingTools } from './tools/useDrawingTools';

export interface UseAnnotationToolsProps {
  mapRef: React.MutableRefObject<maplibregl.Map | null>;
  mapLoaded: boolean;
  activeTool: ToolType | null;
  currentColor: string;
  currentStrokeType: StrokeType | undefined;
  currentFillOpacity: number | undefined;
  annotations: Annotation[];
  setAnnotations: React.Dispatch<React.SetStateAction<Annotation[]>>;
  activeGeojsonLayerId: string | null;
  setActiveGeojsonLayerId: (id: string | null) => void;
  setSelectedGeojsonFeatureId: (id: string | number | null) => void;
  selectedAircraftId: string | null;
  setSelectedAircraftId: (id: string | null) => void;
  settings: AppSettings;
  setSettings: React.Dispatch<React.SetStateAction<AppSettings>>;
  selectedIconId?: string | null;
  routeMode?: RouteMode | null;
  activeDrawMarkersRef: React.MutableRefObject<{ [id: string]: any }>;
  selectedCycloneIdRef: React.MutableRefObject<{ id: string, ep: string } | null>;
  selectedEarthquakeRef: React.MutableRefObject<{ id: string, ep: string, geomUrl: string, coordinates: [number, number], properties: any } | null>;
  selectedVolcanoRef: React.MutableRefObject<{ id: string, ep: string, geomUrl: string, coordinates: [number, number], properties: any } | null>;
  selectedCemsEarthquakeRef: React.MutableRefObject<{ id: string, code: string } | null>;
  activeVesselMmsiRef: React.MutableRefObject<string | null>;
  vesselPopupRef: React.MutableRefObject<maplibregl.Popup | null>;
  vesselsRef: React.MutableRefObject<Map<string, any>>;
  isDrawing: React.MutableRefObject<boolean>;
  setSelectedAnnotationId: React.Dispatch<React.SetStateAction<string | null>>;
  setLabelPrompt: React.Dispatch<React.SetStateAction<{ lngLat: [number, number], initialText?: string, initialSecondary?: string, annotationId?: string } | null>>;
  setHeadlinePrompt?: React.Dispatch<React.SetStateAction<{ id?: string; initialPrimary?: string; initialSecondary?: string } | null>>;
  updateActiveDrawing: (updates: Partial<any>) => void;
  clearActiveDrawMarkers: () => void;
  setActiveDistance: React.Dispatch<React.SetStateAction<number | null>>;
  terrestrialCountriesRef?: React.MutableRefObject<any>;
  isToolbarOpen?: boolean;
}

export function useAnnotationTools({
  mapRef,
  mapLoaded,
  activeTool,
  currentColor,
  currentStrokeType,
  currentFillOpacity,
  annotations,
  setAnnotations,
  activeGeojsonLayerId,
  setActiveGeojsonLayerId,
  setSelectedGeojsonFeatureId,
  selectedAircraftId,
  settings,
  setSettings,
  selectedIconId,
  routeMode,
  activeDrawMarkersRef,
  updateActiveDrawing,
  setSelectedAircraftId,
  selectedCycloneIdRef,
  selectedEarthquakeRef,
  selectedVolcanoRef,
  selectedCemsEarthquakeRef,
  activeVesselMmsiRef,
  vesselPopupRef,
  vesselsRef,
  isDrawing,
  setSelectedAnnotationId,
  setLabelPrompt,
  setHeadlinePrompt,
  clearActiveDrawMarkers,
  setActiveDistance,
  isToolbarOpen
}: UseAnnotationToolsProps) {

  // Pass these into useMapSelectionEvents and get handleSelectionClick
  const handleSelectionClick = useMapSelectionEvents({
    map: mapRef.current,
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
  });

  // State to hold the current ID for selection/deselection toggle via toolbar
  const clickedAnnotationId = useRef<string | null>(null);

  // useDrawingTools combines drawing interactions + symbol selection
  useDrawingTools({
    map: mapRef.current,
    mapLoaded,
    activeTool: activeTool || 'none',
    currentColor,
    currentStrokeType: currentStrokeType || 'solid',
    currentFillOpacity: currentFillOpacity || 0.5,
    annotations,
    setAnnotations,
    settings,
    selectedIconId: selectedIconId || null,
    routeMode: routeMode || 'driving',
    isToolbarOpen: isToolbarOpen || false,
    clickedAnnotationId: clickedAnnotationId.current,
    isDrawing,
    setSelectedAnnotationId,
    setLabelPrompt,
    setHeadlinePrompt,
    mapRef,
    activeDrawMarkersRef,
    updateActiveDrawing,
    clearActiveDrawMarkers,
    setActiveDistance,
    fetchRouteSegment,
    handleSelectionClick
  });

}
