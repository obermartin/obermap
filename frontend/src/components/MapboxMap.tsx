import React, { useEffect, useRef, useState } from 'react';
import { CityWeatherMarkers } from './weather/CityWeatherMarkers';

import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { Annotation, ToolType, AppSettings, StrokeType, RouteMode } from '../types';
import { fetchFullRoute } from '../utils/routingUtils';
import { useTranslation } from '../contexts/I18nContext';


import { getEffectiveLayerDates } from '../utils/layerUtils';
import { useAnnotationTools } from '../hooks/useAnnotationTools';
import { useFlightStream } from '../hooks/useFlightStream';
import { useAisStream } from '../hooks/useAisStream';
import { useMapStyling } from '../hooks/useMapStyling';
import { useMapExport } from '../hooks/useMapExport';
import { useMapInitialization } from '../hooks/useMapInitialization';
import { useAnnotationsStream } from '../hooks/useAnnotationsStream';
import { useDOMMarkers } from '../hooks/useDOMMarkers';
import { useDisasterStream } from '../hooks/useDisasterStream';
import { useMapSelection } from '../hooks/useMapSelection';
import { useLabelTemplates } from '../hooks/useLabelTemplates';
import { useWeatherTogglePosition } from '../hooks/useWeatherTogglePosition';
import { useUtmGrid } from '../hooks/layers/useUtmGrid';

import { cleanupDeletedDynamicLayers } from '../hooks/layers/layerVisibilityUtils';
import { useLayerVisibility } from '../hooks/useLayerVisibility';
import { useEarthquakeAlerts } from '../hooks/disasters/useEarthquakeAlerts';
import { useVolcanoAlerts } from '../hooks/disasters/useVolcanoAlerts';
import { HeadlineOverlays } from "./annotations/HeadlineOverlays";
import { IconSettingsModal } from "./annotations/IconSettingsModal";
import { MediaViewerModal } from "./annotations/MediaViewerModal";
import { CycloneTimelineOverlay, NighttimeTimelineOverlay } from "./ui/MapTimelines";
import { WeatherToggle } from "./ui/WeatherToggle";
import { WindLegend } from "./ui/WindLegend";

import { useMapEvents } from '../hooks/useMapEvents';
import { useWeatherLayer } from '../hooks/useWeatherLayer';
import { useWindAnimation } from '../hooks/useWindAnimation';
import { useNighttimeLayer } from '../hooks/useNighttimeLayer';
import { useContourLayer } from '../hooks/layers/useContourLayer';
import { useAircraftSearch } from '../hooks/useAircraftSearch';
import { useAircraftPopup } from '../hooks/useAircraftPopup';
import { useMapDrawingCursor } from '../hooks/useMapDrawingCursor';


export interface MapContainerProps {
  activeTool: ToolType;
  currentColor: string;
  currentStrokeType?: StrokeType;
  currentFillOpacity?: number;
  routeMode?: RouteMode;
  annotations: Annotation[];
  setAnnotations: React.Dispatch<React.SetStateAction<Annotation[]>>;
  labelPrompt: { lngLat: [number, number], initialText?: string, initialSecondary?: string, annotationId?: string } | null;
  setLabelPrompt: React.Dispatch<React.SetStateAction<{ lngLat: [number, number], initialText?: string, initialSecondary?: string, annotationId?: string } | null>>;
  headlinePrompt?: { id?: string, initialPrimary?: string, initialSecondary?: string } | null;
  setHeadlinePrompt?: React.Dispatch<React.SetStateAction<{ id?: string, initialPrimary?: string, initialSecondary?: string } | null>>;
  setActiveDistance: React.Dispatch<React.SetStateAction<number | null>>;
  selectedAnnotationId: string | null;
  setSelectedAnnotationId: React.Dispatch<React.SetStateAction<string | null>>;
  settings: AppSettings;
  setSettings?: React.Dispatch<React.SetStateAction<AppSettings>>;
  activeGeojsonLayerId: string | null;
  setActiveGeojsonLayerId: React.Dispatch<React.SetStateAction<string | null>>;
  selectedGeojsonFeatureId: string | number | null;
  setSelectedGeojsonFeatureId: React.Dispatch<React.SetStateAction<string | number | null>>;
  selectedIconId?: string | null;
  isSidebarOpen?: boolean;
  isToolbarOpen?: boolean;
  markersRef?: React.MutableRefObject<{ [id: string]: maplibregl.Marker }>;
  activeCropOverlay?: 'landscape' | 'portrait' | 'square' | null;
}





export const MapboxMap: React.FC<MapContainerProps & { isSecondary?: boolean, clipPath?: string, onMapInit?: (map: maplibregl.Map) => void, isExporting?: boolean, imageExportScale?: number }> = ({
  activeTool,
  currentColor,
  currentStrokeType,
  currentFillOpacity,
  routeMode,
  annotations,
  setAnnotations,
  labelPrompt,
  setLabelPrompt,
  setHeadlinePrompt,
  setActiveDistance,
  selectedAnnotationId,
  setSelectedAnnotationId,
  settings,
  setSettings,
  activeGeojsonLayerId,
  setActiveGeojsonLayerId,
  selectedGeojsonFeatureId,
  setSelectedGeojsonFeatureId,
  selectedIconId,
  isSecondary,
  clipPath,
  onMapInit,
  isSidebarOpen,
  isToolbarOpen,
  markersRef: propsMarkersRef,
  isExporting,
  imageExportScale
}) => {
  const { t } = useTranslation();
  const mapContainer = useRef<HTMLDivElement>(null);
  const windCanvasRef = useRef<HTMLCanvasElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);



  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapStyleLoaded, setMapStyleLoaded] = useState(false);
  const [mapStyleTick, setMapStyleTick] = useState(0);

  const {
    selectedEarthquake,
    selectedEarthquakeShakemap,
    selectedCemsEarthquake,
    selectedCemsEarthquakeFeatures,
    setSelectedCemsEarthquakeFeatures,
  } = useEarthquakeAlerts(mapRef.current, mapLoaded, settings, setSettings as React.Dispatch<React.SetStateAction<AppSettings>>);

  const {
    selectedVolcano,
    selectedVolcanoPolygon,
  } = useVolcanoAlerts(settings);

  const selectedEarthquakeRef = useRef(selectedEarthquake);
  const selectedCemsEarthquakeRef = useRef(selectedCemsEarthquake);
  const selectedVolcanoRef = useRef(selectedVolcano);
  const weatherToggleRef = useRef<HTMLDivElement>(null);

  useWeatherTogglePosition(weatherToggleRef);

  useEffect(() => {
    selectedEarthquakeRef.current = selectedEarthquake;
  }, [selectedEarthquake]);

  useEffect(() => {
    selectedCemsEarthquakeRef.current = selectedCemsEarthquake;
  }, [selectedCemsEarthquake]);

  useEffect(() => {
    selectedVolcanoRef.current = selectedVolcano;
  }, [selectedVolcano]);

  const { selectedAircraftId, setSelectedAircraftId, selectedVesselMmsi } = useMapSelection({
    mapRef,
    mapLoaded,
    settings,
    activeGeojsonLayerId,
    selectedGeojsonFeatureId
  });

  const [editingIconAnnotation, setEditingIconAnnotation] = useState<Annotation | null>(null);
  const [viewingMediaAnnotation, setViewingMediaAnnotation] = useState<Annotation | null>(null);
  const selectedCycloneId = settings.layers.find(l => l.type === 'gdacs_cyclones')?.selectedFeatureData || null;
  const selectedCycloneIdRef = useRef<{ id: string, ep: string } | null>(null);
  const [cycloneTimelinePercent, setCycloneTimelinePercent] = useState<number>(100);
  const [windGeojson, setWindGeojson] = useState<GeoJSON.FeatureCollection<GeoJSON.Point> | null>(null);
  


  

  const [weatherValidTimes, setWeatherValidTimes] = useState<string[]>([]);
  const lastActiveWeatherTimeRef = useRef<string | null>(null);
  // selectedWeatherTime is now derived from weatherLayer's effectiveStartDate
  const [revealedTriggers, setRevealedTriggers] = useState<Set<string>>(new Set());
  const [hiddenTriggers, setHiddenTriggers] = useState<Set<string>>(new Set());
  // isDraggingHeadlineId extracted to HeadlineOverlays.tsx
  const triggerProgressRef = useRef<Record<string, number>>({});
  const triggerTimestampsRef = useRef<Record<string, number>>({});


  const currentColorRef = useRef(currentColor);
  const setAnnotationsRef = useRef(setAnnotations);
  const settingsRef = useRef(settings);
  useEffect(() => {
    currentColorRef.current = currentColor;
    setAnnotationsRef.current = setAnnotations;
    settingsRef.current = settings;
  }, [currentColor, setAnnotations, settings]);

  const weatherLayerForTime = settings.layers.find(l => l.type === 'weather_forecast');
  const weatherLayerEffectiveDate = weatherLayerForTime ? getEffectiveLayerDates(weatherLayerForTime, settings).effectiveStartDate : null;
  const selectedWeatherTime = weatherLayerEffectiveDate && weatherValidTimes.length > 0
    ? (weatherValidTimes.find(t => t.startsWith(weatherLayerEffectiveDate)) || weatherValidTimes[0])
    : null;

  const { getBaseTemplate } = useLabelTemplates({
    settings,
    annotations,
    setAnnotations
  });
  


  const weatherForecastLayerIdsRef = useRef<string[]>([]);
  const weatherForecastSourceIdsRef = useRef<string[]>([]);
  const weatherAllValidTimesRef = useRef<string[]>([]);
  const selectedAircraftIdRef = useRef<string | null>(null);
  const selectedFlightTrackRef = useRef<number[][]>([]);

  useEffect(() => {
    selectedAircraftIdRef.current = selectedAircraftId;
  }, [selectedAircraftId]);

  useEffect(() => {
    selectedCycloneIdRef.current = selectedCycloneId;
  }, [selectedCycloneId]);

  useEffect(() => {
    if (!mapRef.current || !mapLoaded || !mapStyleLoaded || !(mapRef.current as any)._loaded) return;
    const styleLayers = mapRef.current.getStyle()?.layers || [];
    cleanupDeletedDynamicLayers(mapRef.current, settings.layers, styleLayers);
  }, [settings.layers, mapLoaded, mapStyleLoaded]);

  const originalFiltersRef = useRef<{ [layerId: string]: any }>({});
  const localMarkersRef = useRef<{ [id: string]: maplibregl.Marker }>({});
  const markersRef = propsMarkersRef || localMarkersRef;
  const activeDrawMarkersRef = useRef<{ [id: string]: maplibregl.Marker }>({});
  const selectionMarkersRef = useRef<{ [id: string]: maplibregl.Marker }>({});
  const aircraftPopupRef = useRef<maplibregl.Popup | null>(null);
  const selectedAircraftMetaRef = useRef<any>(null);
  const vesselsRef = useRef<Map<string, any>>(new Map());
  const vesselPopupRef = useRef<maplibregl.Popup | null>(null);
  const activeVesselMmsiRef = useRef<string | null>(null);
  const windLastFetchRef = useRef<number>(0);
  const windFetchInFlightRef = useRef(false);

  useWeatherLayer({
    mapRef,
    mapLoaded,
    settings,
    weatherAllValidTimesRef,
    setWeatherValidTimes,
    windLastFetchRef,
    windFetchInFlightRef,
    setWindGeojson
  });

  useMapEvents({
    isSecondary,
    mapRef,
    currentColor,
    labelPrompt,
    setLabelPrompt,
    setHeadlinePrompt,
    settingsRef,
    setAnnotations
  });

  useUtmGrid(mapRef, settings.layers || []);

  useLayerVisibility({
    map: mapRef.current,
    mapLoaded,
    mapStyleLoaded,
    mapStyleTick,
    settings,
    activeTool,
    revealedTriggers,
    hiddenTriggers,
    selectedAircraftId,
    selectedVesselMmsi,
    selectedWeatherTime,
    weatherValidTimes,
    selectedEarthquake,
    selectedVolcano,
    selectedEarthquakeShakemap,
    selectedVolcanoPolygon,
    selectedCemsEarthquake,
    selectedCemsEarthquakeFeatures,
    weatherForecastLayerIdsRef,
    weatherForecastSourceIdsRef,
    lastActiveWeatherTimeRef,
    weatherAllValidTimesRef,
    annotations,
    windLastFetchRef
  });

  useAisStream({
    map: mapRef.current,
    mapLoaded,
    settings,
    vesselsRef,
    activeVesselMmsiRef,
    vesselPopupRef
  });


  const clearActiveDrawMarkers = () => {
    Object.values(activeDrawMarkersRef.current).forEach(m => m.remove());
    activeDrawMarkersRef.current = {};
  };

  const terrestrialCountriesRef = useRef<any>(null);


  const handleRouteWaypointDragEnd = async (annId: string, wpIdx: number, newLngLat: [number, number]) => {
    const ann = annotations.find(a => a.id === annId);
    if (!ann || ann.type !== 'route' || !ann.coordinates) return;

    const newCoords = [...ann.coordinates];
    newCoords[wpIdx] = newLngLat;

    const { fullCoords, fullLegs } = await fetchFullRoute(newCoords, ann.routeMode || 'driving', settings.googleMapsToken);
    
    if (setAnnotations) {
      setAnnotations(prev => {
        return prev.map(a => {
          if (a.id === annId) {
            return { 
              ...a, 
              coordinates: newCoords, 
              routeGeometry: { type: 'LineString', coordinates: fullCoords }, 
              routeLegs: fullLegs 
            };
          }
          return a;
        });
      });
    }
  };

  
  const [animationTick, setAnimationTick] = useState(0);
  const isDrawing = useRef(false);

  useMapInitialization({
    mapContainer,
    mapRef,
    settings,
    settingsRef,
    setMapLoaded,
    setMapStyleLoaded,
    setMapStyleTick,
    setRevealedTriggers,
    setHiddenTriggers,
    onMapInit,
    setSettings,
    originalFiltersRef,
    currentColorRef,
    setAnnotationsRef,
    triggerProgressRef,
    triggerTimestampsRef,
  });



  useMapExport({
    map: mapRef.current,
    mapLoaded,
    settings,
    imageExportScale,
    isExporting
  });


  useAnnotationsStream({
    map: mapRef.current,
    mapLoaded,
    mapStyleLoaded,
    mapStyleTick,
    annotations,
    setAnnotations,
    selectedAnnotationId,
    setSelectedAnnotationId,
    revealedTriggers,
    hiddenTriggers,
    triggerProgressRef,
    triggerTimestampsRef,
    animationTick,
    setAnimationTick,
    activeTool,
    settings,
    t,
    getBaseTemplate,
    handleRouteWaypointDragEnd,
    markersRef,
    onEditIcon: setEditingIconAnnotation,
    onViewMedia: setViewingMediaAnnotation,
    setLabelPrompt,
    isToolbarOpen
  });



  useEffect(() => {
    if (mapRef.current) {
      (window as any).__DEBUG_MAP__ = mapRef.current;
    }
  }, [mapLoaded]);



  // Helper to safely upgrade legacy Mapbox/MapLibre filters into expressions
  // This prevents crashes when combining user-uploaded legacy JSON styles with modern expressions.









  useWindAnimation({
    map: mapRef.current,
    canvas: windCanvasRef.current,
    mapLoaded,
    settings,
    windGeojson,
    isSecondary,
    selectedWeatherTime
  });


  // Flights Layer Visibility

  useFlightStream({
    map: mapRef.current,
    mapLoaded,
    settings,
    activeTool,
    revealedTriggers,
    hiddenTriggers,
    annotations,
    selectedAircraftId,
    setSelectedAircraftId,
    selectedAircraftMetaRef,
    selectedFlightTrackRef,
    aircraftPopupRef,
    t
  });


  useMapStyling({
    mapContainer,
    map: mapRef.current,
    mapLoaded,
    mapStyleLoaded,
    mapStyleTick,
    settings,

    originalFiltersRef
  });
  useDisasterStream({
    map: mapRef.current,
    mapLoaded,
    settings,
    selectedCycloneId,
    cycloneTimelinePercent,
    setCycloneTimelinePercent,
    selectedEarthquake,
    selectedVolcano,
    selectedEarthquakeShakemap,
    selectedCemsEarthquakeFeatures,
    setSelectedCemsEarthquakeFeatures,
    selectedVolcanoPolygon,
    activeDrawMarkersRef,
    selectionMarkersRef,

  });

  useNighttimeLayer({
    map: mapRef.current,
    mapLoaded,
    settings
  });

  useContourLayer({
    map: mapRef.current,
    mapLoaded,
    mapStyleLoaded,
    mapStyleTick,
    settings
  });

  useDOMMarkers({
    map: mapRef.current,
    mapLoaded,
    annotations,
    activeTool
  });



  useAircraftSearch({
    map: mapRef.current,
    settings,
    setSelectedAircraftId
  });

  const { updateActiveDrawing } = useMapDrawingCursor({
    map: mapRef.current,
    mapLoaded,
    activeTool,
    currentStrokeType,
    clearActiveDrawMarkers,
    isDrawing
  });

  useAircraftPopup({
    map: mapRef.current,
    selectedAircraftId,
    settings,
    aircraftPopupRef,
    selectedAircraftMetaRef
  });


  useAnnotationTools({
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
    setSettings: setSettings as React.Dispatch<React.SetStateAction<AppSettings>>,
    selectedIconId,
    routeMode,
    activeDrawMarkersRef,
    setActiveDistance,
    updateActiveDrawing,
    clearActiveDrawMarkers,
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
    terrestrialCountriesRef,
    isToolbarOpen
  });

  const activeWindLayer = settings.layers.find(l => l.type === 'weather_forecast' && l.visible && l.showWindParticles !== false);
  const windLayerVisible = Boolean(activeWindLayer);
  const showWindLegend = Boolean(activeWindLayer && activeWindLayer.windParticleColorBySpeed === true);



  const activeWeatherLayer = settings.layers.find(l => l.type === 'weather_forecast' && l.visible);
  const weatherLayerVisible = Boolean(activeWeatherLayer);
  const isCycloneLayerVisible = settings.layers.some(l => l.type === 'gdacs_cyclones' && l.visible);
  const isNighttimeLayerVisible = settings.layers.some(l => l.type === 'nighttime' && l.visible);
  const activeNighttimeLayer = settings.layers.find(l => l.type === 'nighttime' && l.visible);
  const nighttimeHour = activeNighttimeLayer?.nighttimeHour ?? 0;

  const hasDateLayers = settings.layers.some(l => 
    l.visible && (
      ["deepstate", "gdacs_earthquakes", "gdacs_volcanoes", "gdacs_cyclones", "wildfires", "nighttime", "weather_forecast"].includes(l.type) || l.id === "floods"
    )
  );





  return (
    <div className={`absolute inset-0 w-full h-full touch-none ${isSecondary ? 'pointer-events-none' : ''}`} style={{ clipPath, WebkitClipPath: clipPath, zIndex: isSecondary ? 10 : 0 }}>
      <div ref={mapContainer} className="w-full h-full touch-none" />
        {/* Weather Subcomponents */}
        <CityWeatherMarkers 
          map={mapRef.current} 
          mapLoaded={mapLoaded} 
          weatherLayer={weatherLayerForTime} 
          selectedWeatherTime={selectedWeatherTime} 
          weatherValidTimes={weatherValidTimes} 
        />
      {!isSecondary && (windLayerVisible || weatherLayerVisible) && (
        <>
          {windLayerVisible && <canvas ref={windCanvasRef} className="absolute inset-0 w-full h-full pointer-events-none z-[2]" />}
          {weatherLayerVisible && (
            <WeatherToggle 
              weatherToggleRef={weatherToggleRef}
              activeWeatherLayer={activeWeatherLayer}
              setSettings={setSettings as React.Dispatch<React.SetStateAction<AppSettings>>}
              uiBottomPadding={settings?.uiBottomPadding}
            />
          )}

          {showWindLegend && (
            <WindLegend 
              isSidebarOpen={isSidebarOpen}
              uiBottomPadding={settings?.uiBottomPadding}
            />
          )}
        </>
      )}

      <HeadlineOverlays 
        annotations={annotations}
        activeTool={activeTool}
        selectedAnnotationId={selectedAnnotationId}
        revealedTriggers={revealedTriggers}
        hiddenTriggers={hiddenTriggers}
        setAnnotations={setAnnotations}
        setSelectedAnnotationId={setSelectedAnnotationId}
        setHeadlinePrompt={setHeadlinePrompt}
      />

      <CycloneTimelineOverlay
        isCycloneLayerVisible={isCycloneLayerVisible}
        selectedCycloneId={selectedCycloneId}
        isSidebarOpen={isSidebarOpen}
        isToolbarOpen={isToolbarOpen}
        cycloneTimelinePercent={cycloneTimelinePercent}
        setCycloneTimelinePercent={setCycloneTimelinePercent}
        uiBottomPadding={settings?.uiBottomPadding}
      />

      <NighttimeTimelineOverlay
        isNighttimeLayerVisible={isNighttimeLayerVisible}
        selectedCycloneId={selectedCycloneId}
        isCycloneLayerVisible={isCycloneLayerVisible}
        hasDateLayers={hasDateLayers}
        isSidebarOpen={isSidebarOpen}
        isToolbarOpen={isToolbarOpen}
        nighttimeHour={nighttimeHour}
        setSettings={setSettings}
        activeNighttimeLayer={activeNighttimeLayer}
        uiBottomPadding={settings?.uiBottomPadding}
      />

            {editingIconAnnotation && (
        <IconSettingsModal
          annotation={editingIconAnnotation}
          onSave={(updates) => {
            setAnnotations(prev => prev.map(a => a.id === editingIconAnnotation.id ? { ...a, ...updates } : a));
            setEditingIconAnnotation(null);
          }}
          onClose={() => setEditingIconAnnotation(null)}
        />
      )}
      
      {viewingMediaAnnotation && (
        <MediaViewerModal
          annotation={viewingMediaAnnotation}
          onClose={() => setViewingMediaAnnotation(null)}
        />
      )}
    </div>
  );
};

