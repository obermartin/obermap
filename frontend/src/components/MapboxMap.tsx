import React, { useEffect, useRef, useState, useCallback } from 'react';
import { CityWeatherMarkers } from './weather/CityWeatherMarkers';
import { fetchOpenMeteo } from '../utils/weatherUtils';
import { motion } from 'framer-motion';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { Annotation, ToolType, AppSettings, StrokeType, RouteMode, MapLayer } from '../types';
import { useTranslation } from '../contexts/I18nContext';
import { fetchFullRoute } from '../utils/routingUtils';
import { getTerminatorPolygon } from '../utils/terminatorUtils';

import { globalLabelManager } from '../labels/LabelMarkerManager';
import { useAnnotationTools } from '../hooks/useAnnotationTools';
import { useFlightStream } from '../hooks/useFlightStream';
import { useAisStream } from '../hooks/useAisStream';
import { useMapStyling } from '../hooks/useMapStyling';
import { useMapExport } from '../hooks/useMapExport';import { useMapInitialization } from '../hooks/useMapInitialization';
import { useAnnotationsStream } from '../hooks/useAnnotationsStream';
import { useDOMMarkers } from '../hooks/useDOMMarkers';
import { useDisasterStream } from '../hooks/useDisasterStream';

import { getFlagHtml } from '../utils/mapUtils';
import { useLayerVisibility } from '../hooks/useLayerVisibility';
import { useDisasterAlerts } from '../hooks/useDisasterAlerts';
import { HeadlineOverlays } from "./annotations/HeadlineOverlays";
import { CycloneTimelineOverlay, NighttimeTimelineOverlay } from "./ui/MapTimelines";

type WindPoint = { id: string; lat: number; lon: number };


const buildWindPoints = (): WindPoint[] => {
  const points: WindPoint[] = [];
  const seen = new Set<string>();

  const addPoint = (id: string, lat: number, lon: number) => {
    const key = `${lat},${lon}`;
    if (seen.has(key)) return;
    seen.add(key);
    points.push({ id, lat, lon });
  };

  const addGrid = (prefix: string, latStart: number, latEnd: number, latStep: number, lonStart: number, lonEnd: number, lonStep: number) => {
    for (let lat = latStart; lat <= latEnd; lat += latStep) {
      for (let lon = lonStart; lon <= lonEnd; lon += lonStep) {
        addPoint(`${prefix}-${lat}-${lon}`, lat, lon);
      }
    }
  };

  addGrid('global', -60, 70, 10, -180, 170, 10);
  addGrid('southern-ocean', -60, -35, 5, -180, 175, 5);
  addGrid('north-atlantic', 35, 70, 5, -80, 30, 5);
  addGrid('north-pacific-west', 30, 65, 5, 120, 180, 5);
  addGrid('north-pacific-east', 30, 65, 5, -180, -120, 5);
  addGrid('west-pacific-typhoon', 0, 35, 5, 100, 180, 5);
  addGrid('atlantic-hurricane', 5, 35, 5, -100, -10, 5);
  addGrid('europe', 34, 62, 2, -12, 32, 2);

  for (let lat = 47; lat <= 55; lat += 1) {
    for (let lon = 6; lon <= 15; lon += 1) {
      addPoint(`germany-${lat}-${lon}`, lat, lon);
    }
  }

  return points;
};

const WIND_POINTS = buildWindPoints();
const WIND_BATCH_SIZE = 100;
const WIND_BATCH_DELAY_MS = 1000;
const WIND_REFRESH_INTERVAL_MS = 60 * 60 * 1000;
const WIND_MIN_OPEN_REFRESH_DELAY_MS = 30 * 60 * 1000;

export interface MapContainerProps {
  activeTool: ToolType;
  currentColor: string;
  currentStrokeType?: StrokeType;
  currentFillOpacity?: number;
  routeMode?: RouteMode;
  annotations: Annotation[];
  setAnnotations: React.Dispatch<React.SetStateAction<Annotation[]>>;
  labelPrompt: { lngLat: [number, number], initialText?: string, initialSecondary?: string } | null;
  setLabelPrompt: React.Dispatch<React.SetStateAction<{ lngLat: [number, number], initialText?: string, initialSecondary?: string } | null>>;
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

export function getContrastYIQ(hexcolor: string) {
  if (!hexcolor) return '#ffffff';
  if (hexcolor.startsWith('#')) hexcolor = hexcolor.slice(1);
  if (hexcolor.length === 3) hexcolor = hexcolor.split('').map(c => c + c).join('');
  const r = parseInt(hexcolor.substr(0, 2), 16) || 0;
  const g = parseInt(hexcolor.substr(2, 2), 16) || 0;
  const b = parseInt(hexcolor.substr(4, 2), 16) || 0;
  const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
  return yiq >= 128 ? '#000000' : '#ffffff';
}



// HeadlineSVGTemplateRenderer was extracted to HeadlineOverlays.tsx

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

  const {
    selectedEarthquake,
    setSelectedEarthquakeState,
    selectedEarthquakeShakemap,
                    selectedCemsEarthquake,
    setSelectedCemsEarthquakeState,
    selectedCemsEarthquakeFeatures,
    activeCemsWildfireFeatures,
    setActiveCemsWildfireFeatures,
    activeCemsFloodFeatures,
    setActiveCemsFloodFeatures,
    selectedVolcano,
    setSelectedVolcanoState,
    selectedVolcanoPolygon,
  } = useDisasterAlerts(mapRef.current, mapLoaded, settings);

  const selectedEarthquakeRef = useRef(selectedEarthquake);
  const selectedCemsEarthquakeRef = useRef(selectedCemsEarthquake);
  const selectedVolcanoRef = useRef(selectedVolcano);
  const weatherToggleRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let animationFrameId: number;

    const updatePosition = () => {
      const toggle = weatherToggleRef.current;
      if (!toggle) {
        animationFrameId = requestAnimationFrame(updatePosition);
        return;
      }
      
      const toolbar = document.getElementById('global-toolbar-container');
      const dateControl = document.getElementById('global-date-control-container');
      
      if (toolbar && dateControl) {
        const toolbarRect = toolbar.getBoundingClientRect();
        const dateRect = dateControl.getBoundingClientRect();
        
        toggle.style.left = `${toolbarRect.right}px`;
        toggle.style.right = `${window.innerWidth - dateRect.left}px`;
      }
      
      animationFrameId = requestAnimationFrame(updatePosition);
    };
    
    updatePosition();
    
    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  useEffect(() => {
    selectedEarthquakeRef.current = selectedEarthquake;
  }, [selectedEarthquake]);

  useEffect(() => {
    selectedCemsEarthquakeRef.current = selectedCemsEarthquake;
  }, [selectedCemsEarthquake]);

  useEffect(() => {
    selectedVolcanoRef.current = selectedVolcano;
  }, [selectedVolcano]);
  const [styleLoadedTick, setStyleLoadedTick] = useState(0);
  const [selectedAircraftId, setSelectedAircraftIdState] = useState<string | null>(null);
  const [selectedVesselMmsi, setSelectedVesselMmsi] = useState<string | null>(null);
  const [selectedCycloneId, setSelectedCycloneIdState] = useState<{ id: string, ep: string } | null>(null);
  const selectedCycloneIdRef = useRef<{ id: string, ep: string } | null>(null);
  const [cycloneTimelinePercent, setCycloneTimelinePercent] = useState<number>(100);
  const [windGeojson] = useState<GeoJSON.FeatureCollection<GeoJSON.Point> | null>(null);
  

  useEffect(() => {
    selectedEarthquakeRef.current = selectedEarthquake;
  }, [selectedEarthquake]);

  useEffect(() => {
    selectedCemsEarthquakeRef.current = selectedCemsEarthquake;
  }, [selectedCemsEarthquake]);

  useEffect(() => {
    selectedVolcanoRef.current = selectedVolcano;
  }, [selectedVolcano]);
  

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

  const getEffectiveLayerDates = useCallback((layer: MapLayer) => {
    let defaultStartDate = "";
    let defaultEndDate = "";
    const todayStr = new Date().toISOString().split("T")[0];
    if (layer.type === "wildfires") {
      defaultEndDate = todayStr;
      const past7d = new Date(new Date().getTime() - 7 * 24 * 60 * 60 * 1000);
      defaultStartDate = past7d.toISOString().split("T")[0];
    } else {
      defaultStartDate = todayStr;
      defaultEndDate = todayStr;
    }

    const useGlobal = layer.useGlobalDate !== false;
    const isGlobalRange = settings.globalDateMode === 'range';
    
    let effectiveStartDate = layer.startDate || defaultStartDate;
    let effectiveEndDate = layer.endDate || defaultEndDate;

    if (useGlobal) {
      if (layer.type === 'deepstate' || layer.type === 'nighttime' || layer.type === 'weather_forecast') {
        // Single date layers
        effectiveStartDate = isGlobalRange ? (settings.globalEndDate || defaultStartDate) : (settings.globalStartDate || defaultStartDate);
      } else {
        // Range layers
        effectiveStartDate = settings.globalStartDate || defaultStartDate;
        effectiveEndDate = isGlobalRange ? (settings.globalEndDate || defaultEndDate) : (settings.globalStartDate || defaultEndDate);
      }
    }

    if (effectiveStartDate === 'today') effectiveStartDate = todayStr;
    if (effectiveEndDate === 'today') effectiveEndDate = todayStr;

    return { effectiveStartDate, effectiveEndDate };
  }, [settings.globalDateMode, settings.globalStartDate, settings.globalEndDate]);

  const weatherLayerForTime = settings.layers.find(l => l.type === 'weather_forecast');
  const weatherLayerEffectiveDate = weatherLayerForTime ? getEffectiveLayerDates(weatherLayerForTime).effectiveStartDate : null;
  const selectedWeatherTime = weatherLayerEffectiveDate && weatherValidTimes.length > 0
    ? (weatherValidTimes.find(t => t.startsWith(weatherLayerEffectiveDate)) || weatherValidTimes[0])
    : null;

  useEffect(() => {
    const handleHide = () => {
      const isShakemapVisible = !!(selectedEarthquakeRef.current || selectedCemsEarthquakeRef.current);
      if (mapRef.current && isShakemapVisible) {
        settingsRef.current.layers.forEach(l => {
          if (l.type === 'gdacs_earthquakes' || l.type === 'cems_rapid_mapping') {
            try {
              mapRef.current!.setFilter(`dynamic-layer-${l.id}`, ['==', '1', '2']);
              if (mapRef.current!.getLayer(`dynamic-layer-${l.id}-label`)) {
                mapRef.current!.setFilter(`dynamic-layer-${l.id}-label`, ['==', '1', '2']);
              }
            } catch(e) {}
          }
        });
      }
    };
    
    const handleRestore = () => {
      if (mapRef.current) {
        settingsRef.current.layers.forEach(l => {
          if (l.type === 'gdacs_earthquakes' || l.type === 'cems_rapid_mapping') {
            const baseLayerId = `dynamic-layer-${l.id}`;
            const labelLayerId = `${baseLayerId}-label`;
            try {
              const eq = selectedEarthquakeRef.current;
              const cems = selectedCemsEarthquakeRef.current;
              if (eq && l.type === 'gdacs_earthquakes') {
                 mapRef.current!.setFilter(baseLayerId, ['!=', ['to-string', ['get', 'eventid']], eq.id]);
                 if (mapRef.current!.getLayer(labelLayerId)) mapRef.current!.setFilter(labelLayerId, ['!=', ['to-string', ['get', 'eventid']], eq.id]);
              } else if (cems && l.type === 'cems_rapid_mapping') {
                 mapRef.current!.setFilter(baseLayerId, ['!=', ['to-string', ['get', 'code']], cems.code]);
                 if (mapRef.current!.getLayer(labelLayerId)) mapRef.current!.setFilter(labelLayerId, ['!=', ['to-string', ['get', 'code']], cems.code]);
              } else {
                 mapRef.current!.setFilter(baseLayerId, null);
                 if (mapRef.current!.getLayer(labelLayerId)) mapRef.current!.setFilter(labelLayerId, null);
              }
            } catch(e) {}
          }
        });
      }
    };
    
    window.addEventListener('hideEarthquakeDotsForExport', handleHide);
    window.addEventListener('restoreEarthquakeDotsForExport', handleRestore);
    return () => {
      window.removeEventListener('hideEarthquakeDotsForExport', handleHide);
      window.removeEventListener('restoreEarthquakeDotsForExport', handleRestore);
    };
  }, []);

  const getBaseTemplate = useCallback((id?: string) => {
    if (!id) return null;
    const v = settings.labelTemplates?.variations?.find(v => v.id === id);
    return v ? v.baseTemplate : id;
  }, [settings.labelTemplates?.variations]);

  useEffect(() => {
    if (settings.labelTemplates) {
      const templatesToLoad = new Set<string>();
      const regBase = getBaseTemplate(settings.labelTemplates.regularLabelTemplate);
      const highBase = getBaseTemplate(settings.labelTemplates.highlightLabelTemplate);
      if (regBase) templatesToLoad.add(regBase);
      if (highBase) templatesToLoad.add(highBase);
      
      annotations.forEach(a => {
        if (a.template) {
          const base = getBaseTemplate(a.template);
          if (base) templatesToLoad.add(base);
        }
      });
      
      const missingTemplates = Array.from(templatesToLoad).filter(t => !globalLabelManager.templates.has(t));
      if (missingTemplates.length > 0) {
        globalLabelManager.loadTemplates(missingTemplates).then(() => {
          setAnnotations(prev => [...prev]);
        });
      }
    }
  }, [settings.labelTemplates, annotations, setAnnotations, getBaseTemplate]);

  useEffect(() => {
    const weatherLayer = settings.layers.find(l => l.type === 'weather_forecast');
    if (weatherLayer && weatherLayer.visible) {
      fetch('https://map-tiles.open-meteo.com/data_spatial/dwd_icon/latest.json')
        .then(res => res.json())
        .then(data => {
          if (data && data.valid_times) {
            weatherAllValidTimesRef.current = data.valid_times;
            const byDate = new Map<string, string[]>();
            data.valid_times.forEach((time: string) => {
              const date = time.split('T')[0];
              if (!byDate.has(date)) byDate.set(date, []);
              byDate.get(date)!.push(time);
            });
            const bestDailyTimes: string[] = [];
            byDate.forEach((times) => {
              const noon = times.find((t: string) => t.includes('T12:00'));
              bestDailyTimes.push(noon || times[0]);
            });
            setWeatherValidTimes(bestDailyTimes);
          }
        })
        .catch(err => console.error("Failed to fetch Open-Meteo metadata", err));
    }
  }, [settings.layers]);
  
  const setSelectedAircraftId = useCallback((id: string | null) => {
    setSelectedAircraftIdState(id);
    window.dispatchEvent(new CustomEvent('aircraftSelected', { detail: id }));
  }, []);

  useEffect(() => {
    const vesselHandler = (e: CustomEvent<string | null>) => setSelectedVesselMmsi(e.detail);
    window.addEventListener('vesselSelected', vesselHandler as EventListener);
    return () => window.removeEventListener('vesselSelected', vesselHandler as EventListener);
  }, []);

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

  useLayerVisibility({
    map: mapRef.current,
    mapLoaded,
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
    getEffectiveLayerDates,
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

  const applyWindGeojson = useCallback((payload: any) => {
    const map = mapRef.current;
    const geojson = payload?.geojson as GeoJSON.FeatureCollection<GeoJSON.Point> | undefined;
    if (!map || !geojson) return false;

    const source = map.getSource('weather-wind') as maplibregl.GeoJSONSource;
    if (!source) return false;

    source.setData(geojson);
    windLastFetchRef.current = payload.createdAt ? new Date(payload.createdAt).getTime() : Date.now();
    (window as any).__windGeojson = geojson;
    return true;
  }, []);

  const loadWindCache = useCallback(async (cacheId?: string) => {
    try {
      const url = cacheId
        ? `./api.php?action=weather_wind_cache&cacheId=${encodeURIComponent(cacheId)}`
        : './api.php?action=weather_wind_cache';
      const res = await fetch(url);
      if (res.status === 404) return false;
      if (!res.ok) throw new Error(`Weather cache read failed: ${res.statusText}`);
      const data = await res.json();
      if (data && data.geojson && data.geojson.features && data.geojson.features.length > 0) {
        const firstFeature = data.geojson.features[0];
        if (!firstFeature.properties || !firstFeature.properties.dailyTime) {
          return false;
        }
      }
      return applyWindGeojson(data);
    } catch (err) {
      console.warn('Failed to read project Open-Meteo wind cache:', err);
      return false;
    }
  }, [applyWindGeojson]);

  const clearActiveDrawMarkers = () => {
    Object.values(activeDrawMarkersRef.current).forEach(m => m.remove());
    activeDrawMarkersRef.current = {};
  };

  // Drawing state
  const isDrawing = useRef(false);
  const currentShapeCoords = useRef<[number, number][]>([]);

  const circleCenter = useRef<[number, number] | null>(null);
  const arrowStart = useRef<[number, number] | null>(null);
  const currentDrawSessionRef = useRef<number>(0);
  const pendingFetchesRef = useRef<number>(0);

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

  useMapInitialization({
    mapContainer,
    mapRef,
    settings,
    settingsRef,
    setMapLoaded,
    setStyleLoadedTick,
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

  useEffect(() => {
    if (isSecondary) return;
    const handleSaveLabel = ((e: CustomEvent<{ text: string, secondaryText?: string }>) => {
      const { text, secondaryText } = e.detail;
      const map = mapRef.current;
      if (text && labelPrompt && map) {
        const selectedId = settingsRef.current?.labelTemplates?.regularLabelTemplate;
        const variation = settingsRef.current?.labelTemplates?.variations?.find(v => v.id === selectedId);
        const actualTemplate = variation ? variation.baseTemplate : selectedId;
        const actualTheme = settingsRef.current?.labelTemplates?.savedThemes?.[selectedId || ''];
        const newId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
        const newLabel: Annotation = {
          id: newId,
          type: 'label',
          color: currentColor,
          text,
          secondaryText,
          template: actualTemplate,
          theme: actualTheme,
          coordinates: labelPrompt.lngLat,
          animationTriggerId: newId,
          view: {
            center: [map.getCenter().lng, map.getCenter().lat],
            zoom: map.getZoom(),
            pitch: map.getPitch(),
            bearing: map.getBearing(),
            elevation: map.queryTerrainElevation([map.getCenter().lng, map.getCenter().lat]) || 0
          }
        };
        setAnnotations(prev => [...prev, newLabel]);
        setLabelPrompt(null);
      }
    }) as EventListener;
    window.addEventListener('saveLabel', handleSaveLabel);
    return () => window.removeEventListener('saveLabel', handleSaveLabel);
  }, [labelPrompt, currentColor, setAnnotations, setLabelPrompt]);

  useEffect(() => {
    if (isSecondary) return;
    const handleSaveHeadline = ((e: CustomEvent<{ text: string, secondaryText?: string, id?: string }>) => {
      const { text, secondaryText, id } = e.detail;
      if (id) {
        setAnnotations(prev => prev.map(a => a.id === id ? { ...a, text, secondaryText } : a));
      } else {
        const map = mapRef.current;
        const selectedId = settingsRef.current?.labelTemplates?.headlineTemplate || settingsRef.current?.labelTemplates?.regularLabelTemplate;
        const variation = settingsRef.current?.labelTemplates?.variations?.find(v => v.id === selectedId);
        const actualTemplate = variation ? variation.baseTemplate : selectedId;
        const actualTheme = settingsRef.current?.labelTemplates?.savedThemes?.[selectedId || ''] || settingsRef.current?.labelTemplates?.theme;

        const newId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
        setAnnotations(prev => [...prev, {
          id: newId,
          type: 'headline',
          color: currentColor,
          text,
          secondaryText,
          template: actualTemplate,
          theme: actualTheme,
          screenPosition: { x: window.innerWidth / 2 - 200, y: 100 },
          view: map ? {
            center: [map.getCenter().lng, map.getCenter().lat],
            zoom: map.getZoom(),
            pitch: map.getPitch(),
            bearing: map.getBearing(),
            elevation: map.queryTerrainElevation([map.getCenter().lng, map.getCenter().lat]) || 0
          } : undefined
        }]);
      }
      setHeadlinePrompt?.(null);
    }) as EventListener;
    window.addEventListener('saveHeadline', handleSaveHeadline);
    return () => window.removeEventListener('saveHeadline', handleSaveHeadline);
  }, [currentColor, setAnnotations, setHeadlinePrompt]);

  useEffect(() => {
    if (isSecondary) return;
    const handleDropIcon = ((e: CustomEvent<{ clientX: number, clientY: number, iconId: string, color: string }>) => {
      if (!mapRef.current) return;
      const lngLat = mapRef.current.unproject([e.detail.clientX, e.detail.clientY]);
      setAnnotations(prev => [...prev, {
        id: `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
        type: 'icon',
        iconId: e.detail.iconId,
        color: e.detail.color,
        coordinates: [lngLat.lng, lngLat.lat]
      }]);
    }) as EventListener;
    window.addEventListener('requestDropIcon', handleDropIcon);
    return () => window.removeEventListener('requestDropIcon', handleDropIcon);
  }, [setAnnotations]);

  useAnnotationsStream({
    map: mapRef.current,
    mapLoaded,
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
    markersRef
  });



  useEffect(() => {
    if (!mapRef.current || !mapLoaded) return;
    const source = mapRef.current.getSource('selected-geojson-feature') as maplibregl.GeoJSONSource;
    if (!source) return;

    if (activeGeojsonLayerId && selectedGeojsonFeatureId) {
      const layer = settings.layers.find(l => l.id === activeGeojsonLayerId);
      if (layer && layer.data && layer.data.features) {
        const feature = layer.data.features.find((f: any) => f.properties?.id === selectedGeojsonFeatureId);
        if (feature) {
          source.setData({ type: 'FeatureCollection', features: [feature] });
          return;
        }
      }
    }
    
    // Clear selection
    source.setData({ type: 'FeatureCollection', features: [] });
  }, [activeGeojsonLayerId, selectedGeojsonFeatureId, settings.layers, mapLoaded]);

  // Helper to safely upgrade legacy Mapbox/MapLibre filters into expressions
  // This prevents crashes when combining user-uploaded legacy JSON styles with modern expressions.







  // Prototype Open-Meteo wind layer. Renders cached GeoJSON first; API refresh is manual or slow.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    const windLayer = settings.layers.find(l => l.type === 'weather_forecast');
    if (!windLayer || !windLayer.visible) return;

    let isActive = true;
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    const openedAt = Date.now();



    const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

    const writeWindCache = async (geojson: GeoJSON.FeatureCollection<GeoJSON.Point>) => {
      try {
        const res = await fetch('./api.php?action=weather_wind_cache', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            geojson
          })
        });
        if (!res.ok) throw new Error(`Weather cache write failed: ${res.statusText}`);
        const result = await res.json();
        return result;
      } catch (err) {
        console.warn('Failed to write project Open-Meteo wind cache:', err);
        return null;
      }
    };

    const fetchWind = async (force = false) => {
      if (!force && Date.now() - windLastFetchRef.current < WIND_REFRESH_INTERVAL_MS) return;
      if (windFetchInFlightRef.current) return;

      const source = map.getSource('weather-wind') as maplibregl.GeoJSONSource;
      if (!source) return;

      windFetchInFlightRef.current = true;
      try {
        const features: GeoJSON.Feature<GeoJSON.Point>[] = [];

        for (let i = 0; i < WIND_POINTS.length; i += WIND_BATCH_SIZE) {
          if (i > 0) {
            await delay(WIND_BATCH_DELAY_MS);
          }
          if (!isActive) return;

          const batch = WIND_POINTS.slice(i, i + WIND_BATCH_SIZE);
          const latitude = batch.map(point => point.lat).join(',');
          const longitude = batch.map(point => point.lon).join(',');
          const params = new URLSearchParams({
            latitude,
            longitude,
            daily: 'wind_speed_10m_max,wind_direction_10m_dominant,wind_gusts_10m_max',
            forecast_days: '8',
            timezone: 'UTC',
            wind_speed_unit: 'kmh'
          });
          const res = await fetchOpenMeteo(`https://api.open-meteo.com/v1/forecast?${params.toString()}`);
          if (!res.ok) throw new Error(`Open-Meteo wind request failed: ${res.statusText}`);

          const data = await res.json();
          if (!isActive) return;
          const responses = Array.isArray(data) ? data : batch.map(() => data);
          batch.forEach((point, index) => {
            const response = responses[index];
            const daily = response.daily || {};
            features.push({
              type: 'Feature',
              geometry: {
                type: 'Point',
                coordinates: [point.lon, point.lat]
              },
              properties: {
                id: point.id,
                dailyTime: JSON.stringify(daily.time || []),
                windSpeedDaily: JSON.stringify(daily.wind_speed_10m_max || []),
                windDirectionDaily: JSON.stringify(daily.wind_direction_10m_dominant || []),
                windGustDaily: JSON.stringify(daily.wind_gusts_10m_max || [])
              }
            });
          });
          
          if (features.length > 0) {
            applyWindGeojson({
              cacheId: null,
              createdAt: new Date().toISOString(),
              geojson: { type: 'FeatureCollection', features: [...features] }
            });
          }
        }

        const geojson: GeoJSON.FeatureCollection<GeoJSON.Point> = {
          type: 'FeatureCollection',
          features
        };
        const cacheResult = await writeWindCache(geojson);
        applyWindGeojson({ cacheId: cacheResult?.cacheId || null, createdAt: new Date().toISOString(), geojson });
      } catch (err) {
        console.warn('Failed to update Open-Meteo wind layer:', err);
      } finally {
        windFetchInFlightRef.current = false;
      }
    };

    const getNextHourlyRefreshTime = () => {
      const now = Date.now();
      const nextHour = new Date(now);
      nextHour.setMinutes(0, 0, 0);
      nextHour.setHours(nextHour.getHours() + 1);

      const nextHourTime = nextHour.getTime();
      const alignedRefreshTime = nextHourTime - now < WIND_MIN_OPEN_REFRESH_DELAY_MS
        ? nextHourTime + WIND_REFRESH_INTERVAL_MS
        : nextHourTime;
      const cacheEligibleTime = windLastFetchRef.current + WIND_REFRESH_INTERVAL_MS;

      return Math.max(alignedRefreshTime, cacheEligibleTime, openedAt + WIND_MIN_OPEN_REFRESH_DELAY_MS);
    };

    const scheduleHourlyRefresh = () => {
      if (!isActive) return;
      if (refreshTimer) clearTimeout(refreshTimer);

      const delayMs = Math.max(0, getNextHourlyRefreshTime() - Date.now());
      refreshTimer = setTimeout(async () => {
        await fetchWind(false);
        scheduleHourlyRefresh();
      }, delayMs);
    };

    const handleManualRefresh = () => fetchWind(false);
    window.addEventListener('refreshWindLayer', handleManualRefresh);
    loadWindCache().then(hasCache => {
      if (!isActive) return;
      if (!hasCache) {
        fetchWind(true).finally(scheduleHourlyRefresh);
      } else {
        scheduleHourlyRefresh();
      }
    });

    return () => {
      isActive = false;
      window.removeEventListener('refreshWindLayer', handleManualRefresh);
      if (refreshTimer) clearTimeout(refreshTimer);
    };
  }, [settings.layers, mapLoaded, applyWindGeojson, loadWindCache]);

  useEffect(() => {
    const map = mapRef.current;
    const canvas = windCanvasRef.current;
    const windLayer = settings.layers.find(l => l.type === 'weather_forecast');
    if (!map || !canvas || !mapLoaded || !windLayer?.visible || !windGeojson || isSecondary) return;
    if (windLayer.showWindParticles === false) {
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const currentSelectedTime = selectedWeatherTime;

    const vectors = windGeojson.features
      .map(feature => {
        const [lon, lat] = feature.geometry.coordinates;
        
        let times = feature.properties?.dailyTime || [];
        if (typeof times === 'string') {
          try { times = JSON.parse(times); } catch (e) { times = []; }
        }
        
        let timeIndex = 0;
        if (currentSelectedTime) {
           const targetDate = currentSelectedTime.substring(0, 10);
           const foundIdx = times.findIndex((t: string) => t.startsWith(targetDate));
           if (foundIdx !== -1) timeIndex = foundIdx;
        }

        let speeds = feature.properties?.windSpeedDaily;
        if (!speeds) speeds = [feature.properties?.windSpeed ?? 0];
        else if (typeof speeds === 'string') {
          try { speeds = JSON.parse(speeds); } catch (e) { speeds = [feature.properties?.windSpeed ?? 0]; }
        }
        
        let gusts = feature.properties?.windGustDaily;
        if (!gusts) gusts = [feature.properties?.windGust ?? speeds[timeIndex] ?? 0];
        else if (typeof gusts === 'string') {
          try { gusts = JSON.parse(gusts); } catch (e) { gusts = [feature.properties?.windGust ?? speeds[timeIndex] ?? 0]; }
        }
        
        let directions = feature.properties?.windDirectionDaily;
        if (!directions) directions = [feature.properties?.arrowRotation ?? 0];
        else if (typeof directions === 'string') {
          try { directions = JSON.parse(directions); } catch (e) { directions = [feature.properties?.arrowRotation ?? 0]; }
        }

        const speed = Number(speeds[timeIndex] ?? speeds[0] ?? 0);
        const gust = Number(gusts[timeIndex] ?? gusts[0] ?? 0);
        const intensity = Math.max(speed, gust * 0.78);
        const rotation = Number(directions[timeIndex] ?? directions[0] ?? 0);
        const arrowRotation = (rotation + 180) % 360;
        const radians = arrowRotation * Math.PI / 180;
        return {
          lon,
          lat,
          speed,
          gust,
          intensity,
          u: Math.sin(radians) * intensity,
          v: Math.cos(radians) * intensity
        };
      })
      .filter(vector => Number.isFinite(vector.lon) && Number.isFinite(vector.lat));

    if (vectors.length === 0) return;

    let frame = 0;
    let width = 0;
    let height = 0;
    let particles: Array<{ lon: number; lat: number; age: number; maxAge: number }> = [];
    const particleCount = 3400;
    const particleSize = windLayer.windParticleSize ?? 1.5;
    const trailLength = windLayer.windParticleTrail ?? 90;
    const baseTrailAlpha = 0.68 + (Math.max(0, Math.min(100, trailLength)) / 100) * 0.27;
    const maxWindSpeed = Math.max(1, ...vectors.map(vector => vector.intensity));

    const getWindColor = (speed: number) => {
      if (speed < 8) return '#334155';
      if (speed < 18) return '#2563eb';
      if (speed < 30) return '#22d3ee';
      if (speed < 45) return '#4ade80';
      if (speed < 60) return '#facc15';
      if (speed < 80) return '#f97316';
      if (speed < 105) return '#ef4444';
      if (speed < 130) return '#a855f7';
      return '#ffffff';
    };

    const resize = () => {
      const rect = map.getCanvas().getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      width = rect.width;
      height = rect.height;
      canvas.width = Math.max(1, Math.floor(width * dpr));
      canvas.height = Math.max(1, Math.floor(height * dpr));
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const resetParticle = () => {
      const lngLat = map.unproject([Math.random() * width, Math.random() * height]);
      return {
        lon: lngLat.lng,
        lat: lngLat.lat,
        age: Math.floor(Math.random() * 120),
        maxAge: 140 + Math.floor(Math.random() * 100)
      };
    };

    const interpolatedVector = (lon: number, lat: number) => {
      const latScale = Math.max(0.25, Math.cos(lat * Math.PI / 180));
      let weightedU = 0;
      let weightedV = 0;
      let totalWeight = 0;
      let nearest = vectors[0];
      let nearestDistance = Infinity;

      for (const vector of vectors) {
        const dx = (vector.lon - lon) * latScale;
        const dy = vector.lat - lat;
        const distance = dx * dx + dy * dy;
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearest = vector;
        }

        const weight = 1 / Math.max(distance, 0.12);
        weightedU += vector.u * weight;
        weightedV += vector.v * weight;
        totalWeight += weight;
      }

      if (totalWeight <= 0) return nearest;
      const u = weightedU / totalWeight;
      const v = weightedV / totalWeight;
      return {
        u,
        v,
        speed: Math.hypot(u, v),
        gust: Math.hypot(u, v),
        intensity: Math.hypot(u, v)
      };
    };

    resize();
    particles = Array.from({ length: particleCount }, resetParticle);

    const draw = () => {
      ctx.globalCompositeOperation = 'destination-in';
      ctx.fillStyle = `rgba(0, 0, 0, ${baseTrailAlpha})`;
      ctx.fillRect(0, 0, width, height);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = windLayer.windOpacity ?? 1;
      ctx.lineCap = 'round';

      particles = particles.map(particle => {
        const point = map.project([particle.lon, particle.lat]);
        if (particle.age++ > particle.maxAge || point.x < -50 || point.x > width + 50 || point.y < -50 || point.y > height + 50) {
          return resetParticle();
        }

        const vector = interpolatedVector(particle.lon, particle.lat);
        const speedRatio = Math.max(0, Math.min(1, vector.intensity / maxWindSpeed));
        const speedFloor = windLayer.windParticleSpeedBySpeed === false ? 1.5 : 0.5;
        const speedPixels = speedFloor + (windLayer.windParticleSpeedBySpeed === false ? 0 : speedRatio * 2.5);
        
        const dirX = vector.intensity > 0 ? vector.u / vector.intensity : 0;
        const dirY = vector.intensity > 0 ? -vector.v / vector.intensity : 0;

        const nextPoint = {
          x: point.x + dirX * speedPixels,
          y: point.y + dirY * speedPixels
        };

        const nextLngLat = map.unproject([nextPoint.x, nextPoint.y]);
        const nextLon = nextLngLat.lng;
        const nextLat = nextLngLat.lat;

        const tailPoint = {
          x: point.x + dirX * speedPixels * 1.8,
          y: point.y + dirY * speedPixels * 1.8
        };

        ctx.strokeStyle = windLayer.windParticleColorBySpeed === true ? getWindColor(vector.intensity) : (windLayer.windColor || 'rgba(255, 255, 255, 0.75)');
        ctx.lineWidth = windLayer.windParticleSizeBySpeed === true ? particleSize * (0.8 + speedRatio * 2.1) : particleSize;
        ctx.globalAlpha = windLayer.windParticleTrailBySpeed === true
          ? (windLayer.windOpacity ?? 1) * (0.48 + speedRatio * 0.52)
          : (windLayer.windOpacity ?? 1);

        ctx.beginPath();
        ctx.moveTo(point.x, point.y);
        ctx.lineTo(tailPoint.x, tailPoint.y);
        ctx.stroke();

        return { ...particle, lon: nextLon, lat: nextLat };
      });

      frame = requestAnimationFrame(draw);
    };

    const handleResize = () => {
      resize();
      particles = Array.from({ length: particleCount }, resetParticle);
    };

    const clearTrail = () => {
      ctx.clearRect(0, 0, width, height);
    };

    const refreshParticles = () => {
      clearTrail();
      particles = Array.from({ length: particleCount }, resetParticle);
    };

    map.on('resize', handleResize);
    map.on('movestart', clearTrail);
    map.on('zoomstart', clearTrail);
    map.on('rotatestart', clearTrail);
    map.on('pitchstart', clearTrail);
    map.on('moveend', refreshParticles);
    map.on('zoomend', refreshParticles);
    map.on('rotateend', refreshParticles);
    map.on('pitchend', refreshParticles);
    draw();

    return () => {
      cancelAnimationFrame(frame);
      map.off('resize', handleResize);
      map.off('movestart', clearTrail);
      map.off('zoomstart', clearTrail);
      map.off('rotatestart', clearTrail);
      map.off('pitchstart', clearTrail);
      map.off('moveend', refreshParticles);
      map.off('zoomend', refreshParticles);
      map.off('rotateend', refreshParticles);
      map.off('pitchend', refreshParticles);
      ctx.clearRect(0, 0, width, height);
    };
  }, [settings.layers, mapLoaded, windGeojson, isSecondary, selectedWeatherTime]);


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
    settings,
    styleLoadedTick,
    originalFiltersRef
  });
  useDisasterStream({
    map: mapRef.current,
    mapLoaded,
    settings,
    selectedCycloneId,
    cycloneTimelinePercent,
    setCycloneTimelinePercent,
    selectedCemsEarthquake,
    selectedEarthquake,
    selectedVolcano,
    getEffectiveLayerDates,
    selectedEarthquakeShakemap,
    selectedCemsEarthquakeFeatures,
    activeCemsWildfireFeatures,
    setActiveCemsWildfireFeatures,
    activeCemsFloodFeatures,
    setActiveCemsFloodFeatures,
    selectedVolcanoPolygon,
    activeDrawMarkersRef,
    selectionMarkersRef
  });

  // Nighttime layer update
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    
    const nighttimeLayer = settings.layers.find(l => l.type === 'nighttime' && l.visible);
    if (!nighttimeLayer) return;
    
    const sourceId = `dynamic-source-${nighttimeLayer.id}`;
    const source = map.getSource(sourceId) as maplibregl.GeoJSONSource;
    if (!source) return;

    try {
      const dateStr = nighttimeLayer.nighttimeDate || new Date().toISOString().split('T')[0];
      const hr = nighttimeLayer.nighttimeHour ?? 12;
      const hours = Math.floor(hr).toString().padStart(2, '0');
      const minutes = Math.floor((hr % 1) * 60).toString().padStart(2, '0');
      
      const dateString = `${dateStr}T${hours}:${minutes}:00`;
      
      const month = parseInt(dateStr.split('-')[1], 10);
      const isSummer = month >= 4 && month <= 10;
      const offsetStr = isSummer ? '+02:00' : '+01:00';
      const exactDate = new Date(`${dateString}${offsetStr}`);
      
      const geojson = getTerminatorPolygon(exactDate);
      source.setData(geojson);
    } catch (e) {
      console.error('Error updating nighttime layer:', e);
    }
  }, [settings.layers, mapLoaded]);

  useDOMMarkers({
    map: mapRef.current,
    mapLoaded,
    annotations,
    activeTool
  });



  // Handle searchAircraft
  useEffect(() => {
    const handleSearchAircraft = (async (e: Event) => {
      const customEvent = e as CustomEvent<string>;
      const map = mapRef.current;
      if (!map) return;
      const searchTerm = customEvent.detail.toUpperCase();
      
      const flightsLayer = settings.layers.find(l => l.type === 'flights');
      if (!flightsLayer) return;
      const sourceId = `dynamic-source-${flightsLayer.id}`;
      
      // Try to find it in the current map source data first
      const features = map.querySourceFeatures(sourceId);
      const found = features.find(f => 
        (f.properties?.callsign && f.properties.callsign.toUpperCase().includes(searchTerm)) || 
        (f.properties?.icao24 && f.properties.icao24.toUpperCase() === searchTerm)
      );

      if (found && found.geometry.type === 'Point') {
        const coords = found.geometry.coordinates as [number, number];
        map.flyTo({ center: coords, zoom: 8 });
        setSelectedAircraftId(found.properties?.icao24 || null);
        window.dispatchEvent(new CustomEvent('searchAircraftResult', { detail: { found: true } }));
      } else {
        window.dispatchEvent(new CustomEvent('searchAircraftResult', { detail: { found: false } }));
      }
    }) as EventListener;
    window.addEventListener('searchAircraft', handleSearchAircraft);
    return () => window.removeEventListener('searchAircraft', handleSearchAircraft);
  }, [settings.layers]);

  // Render DOM markers for labels and highlights
  useEffect(() => {
    if (!mapRef.current || !mapLoaded) return;
    mapRef.current.getCanvas().style.cursor = activeTool !== 'none' ? 'crosshair' : 'grab';
    clearActiveDrawMarkers();
    isDrawing.current = false;
    mapRef.current.dragPan.enable();
    const source = mapRef.current.getSource('active-drawing') as maplibregl.GeoJSONSource;
    if (source) source.setData({ type: 'FeatureCollection', features: [] });
  }, [activeTool, mapLoaded]);

  const updateActiveDrawing = (geojson: any) => {
    if (!mapRef.current) return;
    const source = mapRef.current.getSource('active-drawing') as maplibregl.GeoJSONSource;
    if (source) {
      source.setData(geojson);
      if (mapRef.current.getLayer('active-drawing-line')) {
        if (currentStrokeType === 'solid') {
          mapRef.current.setPaintProperty('active-drawing-line', 'line-dasharray', undefined);
        } else {
          const dasharray = currentStrokeType === 'dashed' ? [2, 2] : [0.1, 2];
          mapRef.current.setPaintProperty('active-drawing-line', 'line-dasharray', dasharray);
        }
      }
    }
  };

  // Immediate popup rendering for selected aircraft
  useEffect(() => {
    if (!mapRef.current || !selectedAircraftId) return;
    const flightsLayer = settings.layers.find(l => l.type === 'flights');
    if (!flightsLayer || !flightsLayer.visible) return;
    
    if (flightsLayer.is3DMode) {
      if (aircraftPopupRef.current) {
        aircraftPopupRef.current.remove();
        aircraftPopupRef.current = null;
      }
      return;
    }

    const sourceId = `dynamic-source-${flightsLayer.id}`;
    const features = mapRef.current.querySourceFeatures(sourceId);
    const found = features.find(f => f.properties?.icao24 === selectedAircraftId);
    if (!found || found.geometry.type !== 'Point') return;
    
    const [lon, lat] = found.geometry.coordinates as [number, number];
    const callsign = found.properties?.callsign || '';
    
    if (!aircraftPopupRef.current) {
      aircraftPopupRef.current = new maplibregl.Popup({ closeButton: false, closeOnClick: false, className: 'flight-popup' })
        .setLngLat([lon, lat])
        .addTo(mapRef.current);
    } else {
      aircraftPopupRef.current.setLngLat([lon, lat]);
    }
    
    const meta = selectedAircraftMetaRef.current?.icao24 === selectedAircraftId ? selectedAircraftMetaRef.current : {};
    const flag = getFlagHtml(found.properties?.country);
    const alt = found.properties?.altitude !== undefined ? Math.round(found.properties.altitude) + 'm' : 'N/A';
    const spd = found.properties?.velocity !== undefined ? Math.round(found.properties.velocity * 3.6) + 'km/h' : 'N/A';
    
    const popupHtml = `
      <div style="background-color: #09090b; padding: 12px; border-radius: 0; color: white; font-family: ui-sans-serif, system-ui, sans-serif; font-size: 11px; min-width: 180px; text-transform: uppercase;">
        <div style="font-size: 14px; font-weight: 700; margin-bottom: 8px; color: #ffffff; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 4px;">
          <span>${callsign || 'UNKNOWN'}</span>
          <span style="font-size: 16px;">${flag}</span>
        </div>
        <div style="display: grid; grid-template-columns: 40px 1fr; gap: 6px; font-weight: 500;">
          <span style="color: rgba(255,255,255,0.5);">REG:</span> <span style="text-align: right; font-family: monospace;">${meta.registration || 'Loading...'}</span>
          <span style="color: rgba(255,255,255,0.5);">TYPE:</span> <span style="text-align: right; font-family: monospace;">${meta.type || 'Loading...'}</span>
          <span style="color: rgba(255,255,255,0.5);">RTE:</span> <span style="text-align: right; font-family: monospace;">${meta.route || 'Loading...'}</span>
          <span style="color: rgba(255,255,255,0.5);">ALT:</span> <span style="text-align: right; font-family: monospace;">${alt}</span>
          <span style="color: rgba(255,255,255,0.5);">SPD:</span> <span style="text-align: right; font-family: monospace;">${spd}</span>
        </div>
      </div>
    `;
    const style = document.getElementById('flight-popup-style') || document.createElement('style');
    style.id = 'flight-popup-style';
    style.innerHTML = '.flight-popup .maplibregl-popup-content { padding: 0; background: transparent; box-shadow: none; } .flight-popup .maplibregl-popup-tip { border-top-color: #09090b; }';
    if (!document.getElementById('flight-popup-style')) document.head.appendChild(style);
    
    aircraftPopupRef.current.setHTML(popupHtml);
  }, [selectedAircraftId, settings.layers]);


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
    selectedIconId,
    routeMode,
    activeDrawMarkersRef,
    currentDrawSessionRef,
    isDrawing,
    currentShapeCoords,
    circleCenter,
    arrowStart,
    pendingFetchesRef,
    setActiveDistance,
    updateActiveDrawing,
    clearActiveDrawMarkers,
    setSelectedAircraftId,
    selectedCycloneIdRef,
    setSelectedCycloneIdState,
    selectedEarthquakeRef,
    setSelectedEarthquakeState,
    selectedVolcanoRef,
    setSelectedVolcanoState,
    selectedCemsEarthquakeRef,
    setSelectedCemsEarthquakeState,
    activeVesselMmsiRef,
    vesselPopupRef,
    vesselsRef,
    setSelectedAnnotationId,
    setLabelPrompt,
    setHeadlinePrompt,
    terrestrialCountriesRef
  });

  const activeWindLayer = settings.layers.find(l => l.type === 'weather_forecast' && l.visible && l.showWindParticles !== false);
  const windLayerVisible = Boolean(activeWindLayer);
  const showWindLegend = Boolean(activeWindLayer && activeWindLayer.windParticleColorBySpeed === true);
  const windLegendStops = [
    { label: '0-8', color: '#334155' },
    { label: '8-18', color: '#2563eb' },
    { label: '18-30', color: '#22d3ee' },
    { label: '30-45', color: '#4ade80' },
    { label: '45-60', color: '#facc15' },
    { label: '60-80', color: '#f97316' },
    { label: '80-105', color: '#ef4444' },
    { label: '105-130', color: '#a855f7' },
    { label: '130+', color: '#ffffff' }
  ];


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
            <div 
              ref={weatherToggleRef}
              className="absolute z-30 flex items-center justify-center pointer-events-none bottom-6"
            >
              <div className="flex border border-white/20 rounded-full p-1 relative bg-black shadow-xl shrink-0 pointer-events-auto">
                <button
                  onClick={() => {
                    if (!activeWeatherLayer || !setSettings) return;
                    setSettings(prev => ({
                      ...prev,
                      layers: prev.layers.map(l => l.id === activeWeatherLayer.id ? { ...l, showTemperature: true, showPrecipitation: false } : l)
                    }));
                  }}
                  className={`px-4 py-2 text-sm relative z-10 transition-colors whitespace-nowrap rounded-full ${activeWeatherLayer?.showTemperature ? 'text-black' : 'text-white/60 hover:text-white/80'}`}
                >
                  {activeWeatherLayer?.showTemperature && (
                    <motion.div
                      layoutId="weather-type-active-bg-map"
                      className="absolute inset-0 bg-white rounded-full -z-10"
                      transition={{ type: "spring", stiffness: 400, damping: 30 }}
                    />
                  )}
                  {t("Temperature")}
                </button>
                <button
                  onClick={() => {
                    if (!activeWeatherLayer || !setSettings) return;
                    setSettings(prev => ({
                      ...prev,
                      layers: prev.layers.map(l => l.id === activeWeatherLayer.id ? { ...l, showTemperature: false, showPrecipitation: true } : l)
                    }));
                  }}
                  className={`px-4 py-2 text-sm relative z-10 transition-colors whitespace-nowrap rounded-full ${activeWeatherLayer?.showPrecipitation ? 'text-black' : 'text-white/60 hover:text-white/80'}`}
                >
                  {activeWeatherLayer?.showPrecipitation && (
                    <motion.div
                      layoutId="weather-type-active-bg-map"
                      className="absolute inset-0 bg-white rounded-full -z-10"
                      transition={{ type: "spring", stiffness: 400, damping: 30 }}
                    />
                  )}
                  {t("Precipitation")}
                </button>
              </div>

            </div>
          )}

          <div className={`absolute bottom-20 left-6 z-30 max-w-[calc(100vw-3rem)] flex flex-col gap-2 transition-transform duration-300 ease-in-out ${isSidebarOpen ? 'translate-x-[20rem]' : 'translate-x-0'}`}>

            {showWindLegend && (
              <div className="bg-black border border-white/20 text-white flex items-center gap-1.5 px-3 h-12 w-fit max-w-full overflow-x-auto no-scrollbar">
                <span className="text-[10px] text-white/50 font-semibold tracking-wider uppercase shrink-0">Wind Speed</span>
                <div className="flex items-center gap-1.5 shrink-0 border-l border-white/20 pl-3 ml-1.5">
                  <span className="text-[10px] text-white/50 font-semibold tracking-wider uppercase">km/h</span>
                  {windLegendStops.map(stop => (
                    <div key={stop.label} className="flex items-center gap-1">
                      <span
                        className="w-3 h-3 border border-white/20"
                        style={{ backgroundColor: stop.color }}
                      />
                      <span className="text-[10px] text-white/70 font-mono">{stop.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
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
      />
    </div>
  );
};

