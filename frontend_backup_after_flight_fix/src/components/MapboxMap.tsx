import React, { useEffect, useRef, useState, useCallback } from 'react';
import { CityWeatherMarkers } from './weather/CityWeatherMarkers';
import { fetchOpenMeteo } from '../utils/weatherUtils';
import { motion } from 'framer-motion';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { length, along, lineSlice } from '@turf/turf';
import MapboxGeocoder from '@maplibre/maplibre-gl-geocoder';
import '@maplibre/maplibre-gl-geocoder/dist/maplibre-gl-geocoder.css';
import type { Annotation, ToolType, AppSettings, StrokeType, RouteMode, MapLayer } from '../types';
import * as turf from '@turf/turf';
import { useTranslation } from '../contexts/I18nContext';
import { createCirclePolygon, calculateDistance, createArrowFeatures, parseWKT, haversineDistance, safeFetchCemsJson } from '../utils/mapUtils';
import { fetchFullRoute } from '../utils/routingUtils';
import { getTerminatorPolygon } from '../utils/terminatorUtils';

import { customPrompt } from '../utils/dialogService';
import { omProtocol } from '@openmeteo/weather-map-layer';
import { globalLabelManager } from '../labels/LabelMarkerManager';
import excludedCitiesData from '../assets/excluded-cities.json';
import { scaleMapboxExpression } from "../utils/mapboxScaleHelper";
import { useAnnotationTools } from '../hooks/useAnnotationTools';
import { useAisStream } from '../hooks/useAisStream';
import { useLayerVisibility } from '../hooks/useLayerVisibility';
import { useDisasterAlerts } from '../hooks/useDisasterAlerts';
import { HeadlineOverlays } from "./annotations/HeadlineOverlays";
import { CycloneTimelineOverlay, NighttimeTimelineOverlay } from "./ui/MapTimelines";
import { MapboxOverlay } from '@deck.gl/mapbox';
import { PathLayer, TextLayer } from '@deck.gl/layers';
import { ScenegraphLayer } from '@deck.gl/mesh-layers';
import { GLTFLoader } from '@loaders.gl/gltf';




let omProtocolRegistered = false;

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

function getContrastYIQ(hexcolor: string) {
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
  const initialTerrainLoaded = useRef(false);
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
  const cemsFeatureCacheRef = useRef<Record<string, any>>({});
  const weatherToggleRef = useRef<HTMLDivElement>(null);
  const allCemsActivationsRef = useRef<any>(null);

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
  const [cycloneRawData, setCycloneRawData] = useState<any>(null);
  const [windGeojson, setWindGeojsonState] = useState<GeoJSON.FeatureCollection<GeoJSON.Point> | null>(null);
  

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
  const baseFeaturesRef = useRef<GeoJSON.Feature[]>([]);
  const triggerProgressRef = useRef<Record<string, number>>({});
  const triggerTimestampsRef = useRef<Record<string, number>>({});
  const originalBasemapLayoutsRef = useRef<Record<string, { textSize?: any; iconSize?: any }>>({});


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
  const flightHistoryRef = useRef<Record<string, { lastFetched: number; track: [number, number, number, number][] }>>({});
  const deckOverlayRef = useRef<any>(null);

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
  const openSkyTokenRef = useRef<{ token: string, expires: number } | null>(null);
  const updateDeckGLRef = useRef<(() => void) | null>(null);
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
    setWindGeojsonState(geojson);
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

  const getFlagHtml = (countryName: string) => {
    if (!countryName) return '';
    const mappings: Record<string, string> = {
      'United States': 'US', 'Germany': 'DE', 'United Kingdom': 'GB', 'France': 'FR',
      'Italy': 'IT', 'Spain': 'ES', 'Canada': 'CA', 'Australia': 'AU', 'Japan': 'JP',
      'China': 'CN', 'Russia': 'RU', 'Ukraine': 'UA', 'Poland': 'PL', 'Turkey': 'TR',
      'Netherlands': 'NL', 'Switzerland': 'CH', 'Sweden': 'SE', 'Norway': 'NO',
      'Denmark': 'DK', 'Finland': 'FI', 'Austria': 'AT', 'Belgium': 'BE', 'Brazil': 'BR',
      'Mexico': 'MX', 'India': 'IN', 'South Africa': 'ZA', 'Ireland': 'IE', 'Greece': 'GR',
      'Portugal': 'PT', 'New Zealand': 'NZ', 'Singapore': 'SG', 'United Arab Emirates': 'AE',
      'Saudi Arabia': 'SA', 'Israel': 'IL', 'South Korea': 'KR', 'Taiwan': 'TW',
      'Hong Kong': 'HK', 'Thailand': 'TH', 'Malaysia': 'MY', 'Indonesia': 'ID',
      'Vietnam': 'VN', 'Philippines': 'PH', 'Egypt': 'EG', 'Morocco': 'MA'
    };
    const code = mappings[countryName];
    if (!code) return '';
    return `<img src="https://flagcdn.com/w20/${code.toLowerCase()}.png" width="16" alt="${code}" style="vertical-align: middle; border-radius: 1px;" />`;
  };



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
  const cachedTurfDataRef = useRef<{[id: string]: any}>({});
  const activeFeaturesRef = useRef<GeoJSON.Feature[]>([]);

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

  useEffect(() => {
    if (!mapContainer.current) return;

    setMapLoaded(false);

    if (!omProtocolRegistered) {
      try {
        maplibregl.addProtocol('om', omProtocol as any);
        omProtocolRegistered = true;
      } catch (e) {
        console.error("Failed to add MapLibre Protocol Support for Open-Meteo", e);
      }
    }

    let finalStyle: any = settings.mapStyle || 'https://tiles.openfreemap.org/styles/liberty';
    if (typeof finalStyle === 'string' && finalStyle.startsWith('solid:')) {
      finalStyle = {
        version: 8,
        sources: {},
        layers: [
          {
            id: 'background',
            type: 'background',
            paint: {
              'background-color': finalStyle.replace('solid:', '')
            }
          }
        ]
      };
    }

    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: finalStyle,
      center: settings.defaultView.center,
      zoom: settings.defaultView.zoom,
      pitch: settings.defaultView.pitch,
      bearing: settings.defaultView.bearing,
      maxPitch: 85,
      canvasContextAttributes: { preserveDrawingBuffer: true },
      attributionControl: false,
      transformRequest: (url, resourceType) => {
        if (settings.replaceGothamFont !== false && resourceType === 'Glyphs' && decodeURIComponent(url).includes('Gotham Condensed')) {
          try {
            const urlObj = new URL(url);
            const parts = urlObj.pathname.split('/');
            const range = parts.pop();
            const fontstack = decodeURIComponent(parts.pop() || '');
            if (fontstack.startsWith('Gotham Condensed')) {
              return { url: `${window.location.origin}/fonts/PBF/${fontstack}/${range}` };
            }
          } catch (e) {
            console.warn("Failed to rewrite local glyph URL", e);
          }
        }
        return { url };
      }
    });
    
    mapRef.current = map;
    onMapInit?.(map);

    map.on('error', (e: any) => {
      if (e.error && e.error.message && e.error.message.includes('404')) {
        console.error("Map style not found (404). Falling back to default map style.", e.error);
        if (typeof settings.mapStyle === 'string' && settings.mapStyle.includes('api.php?action=basemap_style')) {
          setSettings?.(p => ({ ...p, mapStyle: 'https://tiles.openfreemap.org/styles/liberty' }));
        }
        try {
          map.setStyle('https://tiles.openfreemap.org/styles/liberty');
        } catch (err) {}
      }
    });

    // Add Orbital controls (NavigationControl)
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true, showZoom: false }), 'top-right');
    
    // Add Geocoder
    const doNominatimGeocode = async (config: any) => {
      const features = [];
      try {
        const request = `https://nominatim.openstreetmap.org/search?q=${config.query}&format=geojson&polygon_geojson=1&addressdetails=1`;
        const response = await fetch(request);
        const geojson = await response.json();
        for (const feature of geojson.features) {
          const center = [
            feature.bbox[0] + (feature.bbox[2] - feature.bbox[0]) / 2,
            feature.bbox[1] + (feature.bbox[3] - feature.bbox[1]) / 2
          ];
          const pointFeature = {
            type: 'Feature',
            geometry: { type: 'Point', coordinates: center },
            place_name: feature.properties.display_name,
            properties: feature.properties,
            text: feature.properties.display_name,
            place_type: ['place'],
            center: center,
            bbox: feature.bbox,
            polygonGeometry: feature.geometry
          };
          features.push(pointFeature);
        }
      } catch (e) {
        console.error('Failed to geocode with Nominatim', e);
      }
      return { type: 'FeatureCollection', features } as any;
    };

    const geocoderApi = {
      forwardGeocode: doNominatimGeocode,
      getSuggestions: doNominatimGeocode,
      reverseGeocode: async () => { return { type: 'FeatureCollection', features: [] } as any; }
    };
    
    const geocoder = new MapboxGeocoder(geocoderApi, {
      maplibregl: maplibregl as any,
      collapsed: true,
      marker: false,
      showResultMarkers: false,
      showResultsWhileTyping: true
    });

    geocoder.on('result', (e: any) => {
      if (!e.result || !e.result.geometry) return;
      
      const coords = e.result.center as [number, number];
      const rawName = e.result.text || e.result.place_name || '';
      const name = rawName.split(',')[0].trim();
      const annotationId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      if (setAnnotationsRef.current && mapRef.current) {
        const selectedId = settingsRef.current?.labelTemplates?.highlightLabelTemplate;
        const variation = settingsRef.current?.labelTemplates?.variations?.find(v => v.id === selectedId);
        const actualTemplate = variation ? variation.baseTemplate : selectedId;
        const actualTheme = settingsRef.current?.labelTemplates?.savedThemes?.[selectedId || ''];

        setAnnotationsRef.current(prev => [...prev, {
          id: annotationId,
          type: 'highlight',
          color: currentColorRef.current || '#ffffff',
          template: actualTemplate,
          theme: actualTheme,
          coordinates: coords,
          text: name,
          animationTriggerId: annotationId,
          view: {
            center: coords,
            zoom: mapRef.current!.getZoom(),
            pitch: mapRef.current!.getPitch(),
            bearing: mapRef.current!.getBearing(),
            elevation: mapRef.current!.queryTerrainElevation(coords as [number, number]) || 0
          }
        }]);

        // Wait for geocoder flight to finish, then update the view
        // Only update if we actually reached the destination (flight wasn't aborted)
        mapRef.current.once('moveend', () => {
          const currentCenter = mapRef.current!.getCenter();
          const dist = Math.sqrt(Math.pow(currentCenter.lng - coords[0], 2) + Math.pow(currentCenter.lat - coords[1], 2));
          if (dist < 0.1) {
            const event = new CustomEvent('requestViewCaptureForUpdate', { detail: annotationId });
            window.dispatchEvent(event);
          }
        });
      }
    });

    map.addControl(geocoder, 'top-right');
    
    // Auto-select first result on Enter
    setTimeout(() => {
      const geocoderContainer = document.querySelector('.maplibregl-ctrl-geocoder');
      if (geocoderContainer) {
        geocoderContainer.addEventListener('keydown', (e: any) => {
          if (e.key === 'Enter') {
            const active = geocoderContainer.querySelector('.active');
            if (!active) {
              const firstSuggestion = geocoderContainer.querySelector('.suggestions li');
              if (firstSuggestion) {
                e.preventDefault();
                e.stopPropagation();
                const mouseEvent = new MouseEvent('mouseup', {
                  view: window,
                  bubbles: true,
                  cancelable: true
                });
                firstSuggestion.dispatchEvent(mouseEvent);
              }
            }
          }
        }, { capture: true });
      }
    }, 1000);
    
    // Add Scale control
    map.addControl(new maplibregl.ScaleControl({ maxWidth: 150, unit: 'metric' }), 'top-right');

    map.on('load', () => {
      if (mapRef.current !== map) return;

      // Add a 1x1 solid white pixel for text backplates
      const canvas = document.createElement('canvas');
      canvas.width = 1; canvas.height = 1;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, 1, 1);
        const data = ctx.getImageData(0, 0, 1, 1).data;
        if (!map.hasImage('solid-square')) {
          map.addImage('solid-square', { width: 1, height: 1, data: new Uint8Array(data) } as any);
        }
      }

      // Find first symbol layer to render deepstate below labels
      const styleLayers = map.getStyle().layers || [];
      let firstSymbolId;
      let initFirstAdminId;
      for (let i = 0; i < styleLayers.length; i++) {
        const id = styleLayers[i].id;
        if (!initFirstAdminId && 
            (styleLayers[i].type === 'line' || styleLayers[i].type === 'symbol') &&
            !id.includes('water') && !id.includes('marine') &&
            (id.includes('admin') || id.includes('border') || id.includes('boundar') || id.includes('country'))) {
          initFirstAdminId = id;
        }
        if (styleLayers[i].type === 'symbol') {
          if (!firstSymbolId) firstSymbolId = id;
          if (!id.startsWith('custom-')) {
            originalFiltersRef.current[id] = map.getFilter(id) || null;
            
            // Apply language overrides
            const layout = (styleLayers[i] as any).layout;
            if (layout && layout['text-field']) {
              // Ensure we don't accidentally overwrite icon-only layers that don't have text
              if (typeof layout['text-field'] === 'string' || Array.isArray(layout['text-field'])) {
                const isCountry = id.toLowerCase().includes('country') || id.toLowerCase().includes('admin-0');
                
                // Add any other historically sensitive German names to src/assets/excluded-cities.json
                const excludedCities = excludedCitiesData;

                let textFieldExp: any[];
                
                if (isCountry) {
                  textFieldExp = [
                    'coalesce', ['get', 'name:de'], ['get', 'name:en'], ['get', 'name:latin'], ['get', 'name']
                  ];
                } else {
                  textFieldExp = [
                    'case',
                    ['in', ['coalesce', ['get', 'name:de'], ''], ['literal', excludedCities]],
                    ['coalesce', ['get', 'name:latin'], ['get', 'name:en'], ['get', 'name']],
                    
                    ['coalesce', ['get', 'name:de'], ['get', 'name:en'], ['get', 'name:latin'], ['get', 'name']]
                  ];
                }

                map.setLayoutProperty(id, 'text-field', textFieldExp);
                
                if (settings.replaceGothamFont !== false) {
                  // Map font weights dynamically based on layer type
                  let newFont = 'Gotham Condensed Book';
                  const lowerId = id.toLowerCase();
                  
                  if (lowerId.includes('country') || lowerId.includes('admin-0')) {
                    newFont = 'Gotham Condensed Bold';
                  } else if (lowerId.includes('state') || lowerId.includes('admin-1')) {
                    newFont = 'Gotham Condensed Medium';
                  } else if (lowerId.includes('water') || lowerId.includes('marine') || lowerId.includes('ocean')) {
                    newFont = 'Gotham Condensed Book Italic';
                  } else if (lowerId.includes('city') || lowerId.includes('town')) {
                    newFont = 'Gotham Condensed Medium';
                  } else if (lowerId.includes('road') || lowerId.includes('street') || lowerId.includes('path')) {
                    newFont = 'Gotham Condensed Light';
                  } else {
                    // Attempt to preserve original weight if possible
                    try {
                      const currentFonts = JSON.stringify(layout['text-font']).toLowerCase();
                      if (currentFonts.includes('black') || currentFonts.includes('heavy')) newFont = 'Gotham Condensed Black';
                      else if (currentFonts.includes('bold') || currentFonts.includes('strong')) newFont = 'Gotham Condensed Bold';
                      else if (currentFonts.includes('medium')) newFont = 'Gotham Condensed Medium';
                      else if (currentFonts.includes('light') || currentFonts.includes('thin')) newFont = 'Gotham Condensed Light';
                      
                      if (currentFonts.includes('italic')) newFont += ' Italic';
                    } catch (e) {
                      // Fallback to book
                    }
                  }
                  
                  map.setLayoutProperty(id, 'text-font', [newFont]);
                }
              }
            }
          }
        }
      }

      // Add custom annotations source
      map.addSource('custom-annotations', {
        type: 'geojson',
        promoteId: 'featureId',
        data: { type: 'FeatureCollection', features: [] }
      });

      map.addLayer({
        id: 'custom-polygons',
        type: 'fill',
        source: 'custom-annotations',
        filter: ['==', '$type', 'Polygon'],
        paint: {
          'fill-opacity': ['coalesce', ['get', 'currentOpacity'], ['get', 'fillOpacity'], 0.5],
          'fill-opacity-transition': { duration: 0 },
          'fill-color': ['coalesce', ['get', 'color'], '#ffffff']
        }
      });



      // Add Icons for Flights Layer
      const loadIcon = (name: string, svg: string) => {
        const img = new Image();
        img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
        img.onload = () => {
          if (!map.hasImage(name)) map.addImage(name, img, { sdf: true });
        };
      };

      loadIcon('airplane', `
        <svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 24 24" fill="#ffffff" stroke="none">
          <path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"/>
        </svg>
      `);

      loadIcon('helicopter', `
        <svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 24 24">
          <ellipse cx="12" cy="14" rx="2.5" ry="5" fill="#ffffff" />
          <rect x="11.5" y="18" width="1" height="5" fill="#ffffff" />
          <rect x="9" y="21" width="6" height="1.5" fill="#ffffff" />
          <circle cx="12" cy="14" r="8" fill="none" stroke="#ffffff" stroke-width="0.5" />
          <path d="M4 14 L20 14 M12 6 L12 22" stroke="#ffffff" stroke-width="1.2" />
        </svg>
      `);

      loadIcon('small_aircraft', `
        <svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 24 24">
          <ellipse cx="12" cy="12" rx="2" ry="8" fill="#ffffff" />
          <rect x="3" y="8" width="18" height="2.5" fill="#ffffff" rx="1" />
          <rect x="8" y="18" width="8" height="2" fill="#ffffff" rx="0.5" />
        </svg>
      `);

      loadIcon('military', `
        <svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 24 24">
          <path d="M12 2 L14 12 L22 16 L22 18 L13 16 L12 21 L11 16 L2 18 L2 16 L10 12 Z" fill="#ffffff" />
        </svg>
      `);

      // Add Icons for Vessels Layer
      loadIcon('ship-fast', `
        <svg xmlns="http://www.w3.org/2000/svg" width="112" height="112" viewBox="0 0 28 28">
          <path d="M14 1 L25 25 L14 19 L3 25 Z" fill="#ffffff" />
        </svg>
      `);
      loadIcon('ship-slow', `
        <svg xmlns="http://www.w3.org/2000/svg" width="112" height="112" viewBox="0 0 28 28">
          <path d="M14 1 L25 25 L14 19 L3 25 Z" fill="#ffffff" />
        </svg>
      `);
      loadIcon('ship-still', `
        <svg xmlns="http://www.w3.org/2000/svg" width="112" height="112" viewBox="0 0 28 28">
          <path d="M14 1 L25 25 L14 19 L3 25 Z" fill="none" stroke="#ffffff" stroke-width="1.5" />
        </svg>
      `);
      loadIcon('wind-arrow', `
        <svg xmlns="http://www.w3.org/2000/svg" width="112" height="112" viewBox="0 0 28 28">
          <path d="M14 2 L24 24 L14 18 L4 24 Z" fill="#ffffff" />
        </svg>
      `);

      // Add clip layer for hiding mapbox symbols under highlights
      map.addSource('highlight-clip-source', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
      });

          /* MapLibre does not support the clip layer type yet.
          map.addLayer({
            id: 'highlight-clip-layer',
            type: 'clip',
            source: 'highlight-clip-source',
            layout: {
              'clip-layer-types': ['symbol']
            }
          } as any);
          */

      // Add Flight Track source and layer
      map.addSource('selected-flight-track', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
      });
      
      map.addLayer({
        id: 'selected-flight-track-layer',
        type: 'line',
        source: 'selected-flight-track',
        layout: {
          'line-cap': 'round',
          'line-join': 'round'
        },
        paint: {
          'line-color': '#ffffff',
          'line-width': 4,
          'line-opacity': 0.5
        }
      });

      // Add Automated Flight Tracks shadow source and layer
      map.addSource('automated-flight-tracks-shadow', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
      });
      
      map.addLayer({
        id: 'automated-flight-tracks-shadow-layer',
        type: 'line',
        source: 'automated-flight-tracks-shadow',
        layout: {
          'line-cap': 'round',
          'line-join': 'round'
        },
        paint: {
          'line-color': ['coalesce', ['get', 'color'], '#000000'],
          'line-width': 3,
          'line-opacity': 0.5
        }
      });

      // Add Cyclone Geometry source and layers
      map.addSource('selected-cyclone-geometry', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
      });
      
      map.addLayer({
        id: 'selected-cyclone-cone',
        type: 'fill',
        source: 'selected-cyclone-geometry',
        filter: ['==', '$type', 'Polygon'],
        paint: {
          'fill-color': '#ffffff',
          'fill-opacity': ['*', 0.15, ['coalesce', ['get', '_dynamicOpacity'], 1.0]]
        }
      });

      map.addLayer({
        id: 'selected-cyclone-track',
        type: 'line',
        source: 'selected-cyclone-geometry',
        filter: ['==', '$type', 'LineString'],
        layout: {
          'line-cap': 'round',
          'line-join': 'round'
        },
        paint: {
          'line-color': '#ffffff',
          'line-width': 2,
          'line-opacity': 0.8,
          'line-dasharray': [2, 2]
        }
      });

      map.addLayer({
        id: 'selected-cyclone-point',
        type: 'circle',
        source: 'selected-cyclone-geometry',
        filter: ['==', '$type', 'Point'],
        paint: {
          'circle-radius': [
            'interpolate', ['linear'], ['coalesce', ['get', 'severity'], 5],
            4, 4,
            9, 16
          ],
          'circle-color': [
            'match',
            ['get', 'alertlevel'],
            'Red', '#ff0000',
            'Orange', '#ff9900',
            'Green', '#00ff00',
            '#ffffff'
          ],
          'circle-opacity': 1.0,
          'circle-stroke-width': 2,
          'circle-stroke-color': '#ffffff'
        }
      });

      // Add Vessel Track source and layer
      map.addSource('selected-vessel-track', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
      });
      
      map.addLayer({
        id: 'selected-vessel-track-layer',
        type: 'line',
        source: 'selected-vessel-track',
        layout: {
          'line-cap': 'round',
          'line-join': 'round'
        },
        paint: {
          'line-color': '#ffffff',
          'line-width': 3,
          'line-opacity': 0.8
        }
      });

      // Lines (Paint & Measure & Outlines & Arrows)
      map.addLayer({
        id: 'custom-lines',
        type: 'line',
        source: 'custom-annotations',
        filter: ['any', ['!', ['has', 'strokeType']], ['==', ['get', 'strokeType'], 'solid']],
        layout: {
          'line-cap': 'round',
          'line-join': 'round'
        },
        paint: {
          'line-width': 6,
          'line-color': ['coalesce', ['get', 'color'], '#ffffff'],
          'line-opacity': ['coalesce', ['get', 'currentLineOpacity'], 1],
          'line-opacity-transition': { duration: 0 }
        }
      });

      map.addLayer({
        id: 'custom-lines-dashed',
        type: 'line',
        source: 'custom-annotations',
        filter: ['==', ['get', 'strokeType'], 'dashed'],
        layout: {
          'line-cap': 'round',
          'line-join': 'round'
        },
        paint: {
          'line-width': 6,
          'line-color': ['coalesce', ['get', 'color'], '#ffffff'],
          'line-dasharray': [2, 2],
          'line-opacity': ['coalesce', ['get', 'currentLineOpacity'], 1],
          'line-opacity-transition': { duration: 0 }
        }
      });

      map.addLayer({
        id: 'custom-lines-dotted',
        type: 'line',
        source: 'custom-annotations',
        filter: ['==', ['get', 'strokeType'], 'dotted'],
        layout: {
          'line-cap': 'round',
          'line-join': 'round'
        },
        paint: {
          'line-width': 6,
          'line-color': ['coalesce', ['get', 'color'], '#ffffff'],
          'line-dasharray': [0.01, 2.5],
          'line-opacity': ['coalesce', ['get', 'currentLineOpacity'], 1],
          'line-opacity-transition': { duration: 0 }
        }
      });

      // Arrow Heads
      map.addLayer({
        id: 'custom-arrow-heads',
        type: 'symbol',
        source: 'custom-annotations',
        filter: ['==', ['get', '$type'], 'ArrowHead'],
        layout: {
          'text-field': [
            'case',
            ['==', ['get', 'strokeType'], 'solid'],
            '▲',
            '△'
          ],
          'text-size': 80,
          'text-rotate': ['get', 'bearing'],
          'text-rotation-alignment': 'map',
          'text-pitch-alignment': 'map',
          'text-allow-overlap': true,
          'text-ignore-placement': true,
          'text-anchor': 'center'
        },
        paint: {
          'text-color': ['coalesce', ['get', 'color'], '#ffffff'],
          'text-opacity': ['coalesce', ['get', 'currentLineOpacity'], 1],
          'text-opacity-transition': { duration: 0 }
        }
      });

      // Invisible layer to force Mapbox's collision detection to hide underlying labels
      map.addLayer({
        id: 'annotation-collision-layer',
        type: 'symbol',
        source: 'custom-annotations',
        filter: ['==', ['get', 'type'], 'invisible-collision-box'],
        layout: {
          'text-field': ['get', 'text'],
          'text-font': settings.replaceGothamFont !== false ? ['Gotham Bold', 'Arial Unicode MS Regular'] : ['Arial Unicode MS Regular'],
          'text-size': 14,
          'text-transform': 'uppercase',
          'text-allow-overlap': true,
          'text-ignore-placement': false,
          'text-anchor': 'left',
          'text-offset': [1.5, 0]
        },
        paint: {
          'text-color': 'rgba(0,0,0,0)',
          'text-halo-color': 'rgba(0,0,0,0)',
          'text-halo-width': 2
        }
      });

      // WebGL Annotations fallback removed in favor of 2D Canvas Compositor

      // Setup complete
      setMapLoaded(true);
      setStyleLoadedTick(t => t + 1);
      
      // Selected Annotation Glow
      map.addLayer({
        id: 'custom-selected-glow',
        type: 'line',
        source: 'custom-annotations',
        filter: ['==', 'id', 'none'],
        paint: {
          'line-width': 12,
          'line-color': '#ffffff',
          'line-blur': 8,
          'line-opacity': 0.8
        }
      });

      // Selected Annotation Highlight
      map.addLayer({
        id: 'custom-selected-line',
        type: 'line',
        source: 'custom-annotations',
        filter: ['==', 'id', 'none'],
        paint: {
          'line-width': 8,
          'line-color': '#ffffff',
          'line-dasharray': [2, 2]
        }
      });

      // Active drawing source
      map.addSource('active-drawing', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
      });
      map.addLayer({
        id: 'active-drawing-line',
        type: 'line',
        source: 'active-drawing',
        paint: { 'line-width': 6, 'line-color': ['coalesce', ['get', 'color'], '#ffffff'], 'line-dasharray': [2, 2] }
      });
      map.addLayer({
        id: 'active-drawing-fill',
        type: 'fill',
        source: 'active-drawing',
        filter: ['==', '$type', 'Polygon'],
        paint: { 'fill-opacity': 0.3, 'fill-color': ['coalesce', ['get', 'color'], '#ffffff'] }
      });

      // Selected GeoJSON feature highlighting
      map.addSource('selected-geojson-feature', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
      });
      map.addLayer({
        id: 'geojson-selected-glow',
        type: 'line',
        source: 'selected-geojson-feature',
        paint: {
          'line-width': 12,
          'line-color': '#ffffff',
          'line-blur': 8,
          'line-opacity': 0.8
        }
      });
      map.addLayer({
        id: 'geojson-selected-line',
        type: 'line',
        source: 'selected-geojson-feature',
        paint: {
          'line-width': 8,
          'line-color': '#ffffff',
          'line-dasharray': [2, 2]
        }
      });
    });

    // Add flyTo listener
    const handleFlyTo = ((e: CustomEvent<{ viewId: string, view: Annotation['view'] }>) => {
      const { viewId, view } = e.detail;
      if (view && mapRef.current) {
        if (viewId === 'overview') {
          triggerProgressRef.current = {};
          triggerTimestampsRef.current = {};
          setRevealedTriggers(new Set());
          setHiddenTriggers(new Set());
        } else {
          triggerProgressRef.current[viewId] = 0;
          triggerTimestampsRef.current[viewId] = Date.now();
          setRevealedTriggers(prev => {
            const next = new Set(prev);
            next.add(viewId);
            return next;
          });
          setHiddenTriggers(prev => {
            const next = new Set(prev);
            next.add(viewId);
            return next;
          });
        }
        
                mapRef.current.flyTo({
          center: view.center,
          zoom: view.zoom,
          pitch: view.pitch,
          bearing: view.bearing,
          duration: 2000,
          essential: true
        });

                if (view.elevation !== undefined) {
          mapRef.current.once('moveend', () => {
            const currentCenter = mapRef.current?.getCenter();
            if (currentCenter) {
              const dist = Math.sqrt(Math.pow(currentCenter.lng - view.center[0], 2) + Math.pow(currentCenter.lat - view.center[1], 2));
              if (dist < 0.1) {
                mapRef.current?.jumpTo({
                  center: view.center,
                  zoom: view.zoom,
                  pitch: view.pitch,
                  bearing: view.bearing,
                  elevation: view.elevation
                });
              }
            }
          });
        }
      }
    }) as EventListener;
    window.addEventListener('flyToView', handleFlyTo);

    const handleUpdateAnimationTrigger = ((e: CustomEvent<{ triggerId: string }>) => {
      const { triggerId } = e.detail;
      triggerProgressRef.current[triggerId] = 0;
      triggerTimestampsRef.current[triggerId] = Date.now();
      setRevealedTriggers(prev => {
        const next = new Set(prev);
        next.add(triggerId);
        return next;
      });
      setHiddenTriggers(prev => {
        const next = new Set(prev);
        next.delete(triggerId);
        return next;
      });
    }) as EventListener;
    window.addEventListener('updateAnimationTrigger', handleUpdateAnimationTrigger);

    const handleUpdateHideAnimationTrigger = ((e: CustomEvent<{ triggerId: string }>) => {
      const { triggerId } = e.detail;
      triggerProgressRef.current[triggerId] = 0;
      triggerTimestampsRef.current[triggerId] = Date.now();
      setHiddenTriggers(prev => {
        const next = new Set(prev);
        next.add(triggerId);
        return next;
      });
      setRevealedTriggers(prev => {
        const next = new Set(prev);
        next.delete(triggerId);
        return next;
      });
    }) as EventListener;
    window.addEventListener('updateHideAnimationTrigger', handleUpdateHideAnimationTrigger);

    const handleActivateExportTrigger = ((e: CustomEvent<{ triggerId: string }>) => {
      const { triggerId } = e.detail;
      triggerProgressRef.current[triggerId] = 0;
      triggerTimestampsRef.current[triggerId] = Date.now();
      setRevealedTriggers(prev => {
        const next = new Set(prev);
        next.add(triggerId);
        return next;
      });
      setHiddenTriggers(prev => {
        const next = new Set(prev);
        next.add(triggerId);
        return next;
      });
    }) as EventListener;
    window.addEventListener('activateExportTrigger', handleActivateExportTrigger);

    const handleUpdateBothTriggers = ((e: CustomEvent<{ triggerId: string }>) => {
      const { triggerId } = e.detail;
      triggerProgressRef.current[triggerId] = 0;
      triggerTimestampsRef.current[triggerId] = Date.now();
      setRevealedTriggers(prev => {
        const next = new Set(prev);
        next.add(triggerId);
        return next;
      });
      setHiddenTriggers(prev => {
        const next = new Set(prev);
        next.add(triggerId);
        return next;
      });
    }) as EventListener;
    window.addEventListener('updateBothTriggers', handleUpdateBothTriggers);

    const handleResetAnimationTriggers = () => {
      triggerProgressRef.current = {};
      triggerTimestampsRef.current = {};
      setRevealedTriggers(new Set());
      setHiddenTriggers(new Set());
    };
    window.addEventListener('resetAnimationTriggers', handleResetAnimationTriggers);

    mapRef.current = map;

    return () => {
      window.removeEventListener('flyToView', handleFlyTo);
      window.removeEventListener('updateAnimationTrigger', handleUpdateAnimationTrigger);
      window.removeEventListener('updateHideAnimationTrigger', handleUpdateHideAnimationTrigger);
      window.removeEventListener('activateExportTrigger', handleActivateExportTrigger);
      window.removeEventListener('updateBothTriggers', handleUpdateBothTriggers);
      window.removeEventListener('resetAnimationTriggers', handleResetAnimationTriggers);
      map.remove();
      mapRef.current = null;
    };
  }, [settings.mapStyle, settings.replaceGothamFont]);

  // Handle dynamic mapbox transitions based on settings
  useEffect(() => {
    if (!mapRef.current || !mapLoaded) return;
    const duration = settings.animationDuration ?? 2000;
    const map = mapRef.current;
    
    if (map.getLayer('custom-polygons')) map.setPaintProperty('custom-polygons', 'fill-opacity-transition', { duration });
    if (map.getLayer('custom-lines')) map.setPaintProperty('custom-lines', 'line-opacity-transition', { duration });
    if (map.getLayer('custom-lines-dashed')) map.setPaintProperty('custom-lines-dashed', 'line-opacity-transition', { duration });
    if (map.getLayer('custom-lines-dotted')) map.setPaintProperty('custom-lines-dotted', 'line-opacity-transition', { duration });
    if (map.getLayer('custom-arrow-heads')) map.setPaintProperty('custom-arrow-heads', 'text-opacity-transition', { duration });
  }, [settings.animationDuration, mapLoaded]);

  // Handle view capture request
  useEffect(() => {
    const handleRequestViewCapture = () => {
      if (!mapRef.current) return;
      const map = mapRef.current;
      const center = map.getCenter();
      const view = {
        center: [center.lng, center.lat] as [number, number],
        zoom: map.getZoom(),
        pitch: map.getPitch(),
        bearing: map.getBearing(),
            elevation: map.queryTerrainElevation([center.lng, center.lat] as [number, number]) || 0
          };
      const event = new CustomEvent('viewCaptured', { detail: view });
      window.dispatchEvent(event);
    };
    
    const handleRequestViewCaptureForPosition = () => {
      if (!mapRef.current) return;
      const map = mapRef.current;
      const center = map.getCenter();
      const view = {
        center: [center.lng, center.lat] as [number, number],
        zoom: map.getZoom(),
        pitch: map.getPitch(),
        bearing: map.getBearing(),
            elevation: map.queryTerrainElevation([center.lng, center.lat] as [number, number]) || 0
          };
      const event = new CustomEvent('viewCapturedForPosition', { detail: view });
      window.dispatchEvent(event);
    };

    const handleRequestViewCaptureForUpdate = (e: Event) => {
      if (!mapRef.current) return;
      const customEvent = e as CustomEvent<string>;
      const annotationId = customEvent.detail;
      const map = mapRef.current;
      const center = map.getCenter();
      const view = {
        center: [center.lng, center.lat] as [number, number],
        zoom: map.getZoom(),
        pitch: map.getPitch(),
        bearing: map.getBearing(),
            elevation: map.queryTerrainElevation([center.lng, center.lat] as [number, number]) || 0
          };
      const event = new CustomEvent('viewCapturedForUpdate', { detail: { id: annotationId, view } });
      window.dispatchEvent(event);
    };

    const handleRequestViewCaptureForDefaultUpdate = () => {
      if (!mapRef.current) return;
      const map = mapRef.current;
      const center = map.getCenter();
      const view = {
        center: [center.lng, center.lat] as [number, number],
        zoom: map.getZoom(),
        pitch: map.getPitch(),
        bearing: map.getBearing(),
            elevation: map.queryTerrainElevation([center.lng, center.lat] as [number, number]) || 0
          };
      const event = new CustomEvent('viewCapturedForDefaultUpdate', { detail: view });
      window.dispatchEvent(event);
    };
    
    window.addEventListener('requestViewCapture', handleRequestViewCapture);
    window.addEventListener('requestViewCaptureForPosition', handleRequestViewCaptureForPosition);
    window.addEventListener('requestViewCaptureForUpdate', handleRequestViewCaptureForUpdate);
    window.addEventListener('requestViewCaptureForDefaultUpdate', handleRequestViewCaptureForDefaultUpdate);
    return () => {
      window.removeEventListener('requestViewCapture', handleRequestViewCapture);
      window.removeEventListener('requestViewCaptureForPosition', handleRequestViewCaptureForPosition);
      window.removeEventListener('requestViewCaptureForUpdate', handleRequestViewCaptureForUpdate);
      window.removeEventListener('requestViewCaptureForDefaultUpdate', handleRequestViewCaptureForDefaultUpdate);
    };
  }, []);

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

  // Update mapbox features when annotations change
  useEffect(() => {
    if (!mapRef.current || !mapLoaded) return;
    const source = mapRef.current.getSource('custom-annotations') as maplibregl.GeoJSONSource;
    if (!source) return;
    cachedTurfDataRef.current = {};
    const features: GeoJSON.Feature[] = annotations.reduce((acc: GeoJSON.Feature[], ann) => {
      if (ann.type === 'paint') {
        acc.push({
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: ann.coordinates },
          properties: { color: ann.color, id: ann.id, type: ann.type, strokeType: ann.strokeType || 'solid' }
        });
      } else if (ann.type === 'measure') {
        const dist = calculateDistance(ann.coordinates);
        acc.push({
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: ann.coordinates },
          properties: { color: ann.color, id: ann.id, type: ann.type, textLabel: `${dist.toFixed(2)} km`, strokeType: ann.strokeType || 'solid' }
        });
      } else if (ann.type === 'circle') {
        acc.push({
          type: 'Feature',
          geometry: { type: 'Polygon', coordinates: ann.coordinates },
          properties: { color: ann.color, id: ann.id, type: ann.type, textLabel: `${ann.radius?.toFixed(2)} km`, strokeType: ann.strokeType || 'solid', fillOpacity: ann.fillOpacity ?? 0.5 }
        });
      } else if (ann.type === 'polygon') {
        acc.push({
          type: 'Feature',
          geometry: { type: 'Polygon', coordinates: ann.coordinates },
          properties: { color: ann.color, id: ann.id, type: ann.type, strokeType: ann.strokeType || 'solid', fillOpacity: ann.fillOpacity ?? 0.5 }
        });
      } else if (ann.type === 'arrow' && ann.coordinates && ann.coordinates.length === 2) {
        const arrowFeats = createArrowFeatures(ann.coordinates[0], ann.coordinates[1], ann.color || '#ffffff', ann.id);
        if (arrowFeats) {
          arrowFeats.shaft.properties!.strokeType = ann.strokeType || 'solid';
          arrowFeats.head.properties!.strokeType = 'solid';
          arrowFeats.shaft.properties!.type = 'arrow';
          arrowFeats.head.properties!.type = 'arrow';
          acc.push(arrowFeats.shaft, arrowFeats.head);
        }
      } else if (ann.type === 'highlight' && ann.polygonGeometry) {
        if (ann.polygonGeometry.type === 'Polygon' || ann.polygonGeometry.type === 'MultiPolygon') {
          acc.push({
            type: 'Feature',
            geometry: ann.polygonGeometry,
            properties: { color: ann.color, id: ann.id, type: 'polygon', strokeType: ann.strokeType || 'solid', fillOpacity: ann.fillOpacity ?? 0.5 }
          });
        }
      } else if (ann.type === 'route' && ann.routeGeometry) {
        acc.push({
          type: 'Feature',
          geometry: ann.routeGeometry,
          properties: { color: ann.color, id: ann.id, type: ann.type, strokeType: ann.strokeType || 'solid' }
        });
      }

      // Add invisible collision box to hide underlying mapbox labels
      if (ann.type === 'highlight' && ann.text && ann.coordinates) {
        acc.push({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: ann.coordinates },
          properties: {
            id: `${ann.id}-collision`,
            type: 'invisible-collision-box',
            text: ann.text
          }
        });
      }
      
      // --- Add WebGL Point Features for DOM Annotations (for video export) ---
      // Removed in favor of 2D Canvas Compositor

      return acc;
    }, []).map(f => {
      const targetId = f.id ?? (f.properties ? f.properties.id : undefined);
      if (targetId && f.properties) {
        f.properties.featureId = targetId;
        f.id = targetId;
      }
      return f;
    });

    // Register SVG icons and labels for video export
    // Removed in favor of 2D Canvas Compositor
    baseFeaturesRef.current = features;
    activeFeaturesRef.current = JSON.parse(JSON.stringify(features));



    // Handle DOM markers for labels, measures, and circles
    const expectedMarkers = new Map<string, { lngLat: [number, number], el: HTMLElement, draggable?: boolean, onDragEnd?: (lngLat: [number, number]) => void }>();

    annotations.forEach(ann => {
      if (ann.type === 'label' && ann.coordinates) {
        const onClick = () => {
          if (activeTool !== 'none') {
            setSelectedAnnotationId(ann.id);
          }
          window.dispatchEvent(new CustomEvent('flyToLabel', { detail: ann.id }));
        };
        
        let el: HTMLElement;
        const contrastColor = getContrastYIQ(ann.color || '#ffffff');
        
        if (ann.template) {
          try {
            const baseTemplateName = getBaseTemplate(ann.template) || '';
            const handle = globalLabelManager.createLabel({
              id: ann.id,
              lngLat: ann.coordinates,
              text: ann.secondaryText ? { primary: ann.text || '', secondary: ann.secondaryText } : (ann.text || ''),
              template: baseTemplateName,
              theme: ann.theme || { 
                primaryBackplateFill: globalLabelManager.templates.get(baseTemplateName)?.manifest?.primary?.color || ann.color,
                primaryTextColor: globalLabelManager.templates.get(baseTemplateName)?.manifest?.primary?.typography?.color || contrastColor,
                pointerFill: globalLabelManager.templates.get(baseTemplateName)?.manifest?.primary?.pointer?.color,
                secondaryBackplateFill: globalLabelManager.templates.get(baseTemplateName)?.manifest?.secondary?.color
              },
              onClick
            });
            el = handle.getElement();
          } catch (e) {
            console.error('Error rendering SVG label', e);
            el = document.createElement('div'); // fallback
          }
        } else {
          el = document.createElement('div');
          el.className = 'custom-marker';
          el.innerHTML = `
            <div class="custom-marker-plate" style="background-color: ${ann.color}; border-color: ${ann.color === '#000000' || ann.color === '#000' ? 'rgba(255,255,255,0.1)' : ann.color}">
              <div class="custom-marker-text" style="color: ${contrastColor}; display: flex; flex-direction: column; align-items: flex-start;">
                <span style="font-size: 1.6em; line-height: 1;">${ann.text}</span>
                ${ann.secondaryText ? `<span style="font-size: 1em; line-height: 1;">${ann.secondaryText}</span>` : ''}
              </div>
            </div>
            <div class="custom-marker-pointer" style="border-top-color: ${ann.color}"></div>
          `;
          el.style.cursor = 'pointer';
          el.addEventListener('click', (e) => {
            e.stopPropagation();
            onClick();
          });

        }

        if (ann.id === selectedAnnotationId) {
          el.style.filter = 'drop-shadow(0 0 6px rgba(255,255,255,1)) drop-shadow(0 0 12px rgba(255,255,255,0.8))';
          el.style.zIndex = '1000';
          const content = el.querySelector('.custom-marker-plate') || el.querySelector('.backplate.primary');
          if (content) {
            (content as HTMLElement).style.outline = '2px dashed #ffffff';
            (content as HTMLElement).style.outlineOffset = '2px';
          }
        }
        const isSelected = ann.id === selectedAnnotationId;
        expectedMarkers.set(ann.id, {
          lngLat: ann.coordinates,
          el,
          draggable: isSelected && activeTool !== 'none',
          onDragEnd: (lngLat) => {
            setAnnotations(prev => prev.map(a => a.id === ann.id ? { ...a, coordinates: lngLat } : a));
          }
        });
      } else if (ann.type === 'highlight') {
        const onClick = () => {
          if (activeTool !== 'none') {
            setSelectedAnnotationId(ann.id);
          } else {
            window.dispatchEvent(new CustomEvent('flyToLabel', { detail: ann.id }));
          }
        };

        let el: HTMLElement;
        const contrastColor = getContrastYIQ(ann.color || '#000000');
        
        if (ann.template && !ann.polygonGeometry) {
          try {
            const baseTemplateName = getBaseTemplate(ann.template) || '';
            const handle = globalLabelManager.createLabel({
              id: ann.id,
              lngLat: ann.coordinates,
              text: ann.text || '',
              template: baseTemplateName,
              theme: ann.theme || { 
                primaryBackplateFill: globalLabelManager.templates.get(baseTemplateName)?.manifest?.primary?.color || ann.color,
                primaryTextColor: globalLabelManager.templates.get(baseTemplateName)?.manifest?.primary?.typography?.color || contrastColor,
                pointerFill: globalLabelManager.templates.get(baseTemplateName)?.manifest?.primary?.pointer?.color,
                secondaryBackplateFill: globalLabelManager.templates.get(baseTemplateName)?.manifest?.secondary?.color
              },
              onClick
            });
            el = handle.getElement();
          } catch (e) {
            console.error('Error rendering SVG highlight', e);
            el = document.createElement('div'); // fallback
          }
        } else {
          el = document.createElement('div');
          el.className = `label-marker-${ann.id} ${ann.polygonGeometry ? 'custom-country-marker' : 'custom-highlight-marker'}`;
          el.style.width = '0px';
          el.style.height = '0px';
          el.style.position = 'relative';
          
          if (ann.polygonGeometry) {
            el.innerHTML = `
              <div style="position: absolute; left: 0; top: 0; transform: translate(-50%, -50%); zoom: var(--export-annotation-scale, 1); transform-origin: center center;">
                <div class="custom-country-plate" style="background-color: ${ann.color};">
                  <div class="custom-country-text" style="color: ${contrastColor}">
                    ${ann.text || ''}
                  </div>
                </div>
              </div>
            `;
          } else {
            el.innerHTML = `
              <div style="position: absolute; left: 0; top: 0; transform: translate(-50%, -50%); zoom: var(--export-annotation-scale, 1); transform-origin: center center;">
                <div class="custom-highlight-marker" style="background-color: ${ann.color};">
                  <div class="custom-highlight-plate" style="background-color: ${ann.color};">
                    <div class="custom-highlight-text" style="color: ${contrastColor}">
                      ${ann.text || ''}
                    </div>
                  </div>
                </div>
              </div>
            `;
          }
          
          el.style.cursor = 'pointer';
          el.addEventListener('click', (e) => {
            e.stopPropagation();
            onClick();
          });

        }

        if (ann.id === selectedAnnotationId) {
          el.style.filter = 'drop-shadow(0 0 6px rgba(255,255,255,1)) drop-shadow(0 0 12px rgba(255,255,255,0.8))';
          el.style.zIndex = '1000';
          const content = el.querySelector('.custom-highlight-plate') || el.querySelector('.backplate.primary') || el;
          if (content) {
            (content as HTMLElement).style.outline = '2px dashed #ffffff';
            (content as HTMLElement).style.outlineOffset = '2px';
          }
        }
        
        // Use either centroid or the primary coordinates for marker placement
        const markerLngLat = ann.polygonGeometry && ann.polygonGeometry.type === 'Polygon' ? turf.centerOfMass(ann.polygonGeometry).geometry.coordinates as [number, number] : ann.coordinates;
        if (markerLngLat) {
          expectedMarkers.set(ann.id, { lngLat: markerLngLat, el });
        }
      } else if (ann.type === 'measure' && ann.coordinates) {
        let totalDistance = 0;
        const contrastColor = getContrastYIQ(ann.color || '#ffffff');
        ann.coordinates.forEach((coord: [number, number], i: number) => {
          if (i > 0) {
            totalDistance += turf.distance(ann.coordinates[i-1], coord, { units: 'kilometers' });
          }
          const el = document.createElement('div');
          el.className = 'label-marker-measure-point';
          el.style.width = '0px';
          el.style.height = '0px';
          el.style.position = 'relative';
          el.innerHTML = `
            <div style="position: absolute; left: 0; top: 0; transform: translate(-50%, -50%); zoom: var(--export-annotation-scale, 1); transform-origin: center center; display: flex; align-items: center; justify-content: center;">
              <div class="custom-marker-flat" style="background-color: ${ann.color}; color: ${contrastColor};">
                ${totalDistance.toFixed(2)} km
              </div>
            </div>
          `;
          el.style.cursor = 'pointer';
          el.addEventListener('click', (e) => {
            e.stopPropagation();
            if (activeTool !== 'none') {
              setSelectedAnnotationId(ann.id);
            }
          });

          if (ann.id === selectedAnnotationId) {
            el.style.filter = 'drop-shadow(0 0 6px rgba(255,255,255,1)) drop-shadow(0 0 12px rgba(255,255,255,0.8))';
            el.style.zIndex = '1000';
            el.style.outline = '2px dashed #ffffff';
            el.style.outlineOffset = '2px';
          }
          expectedMarkers.set(`${ann.id}-measure-${i}`, { lngLat: coord, el });
        });
      } else if (ann.type === 'route' && ann.coordinates && ann.routeLegs) {
        const contrastColor = getContrastYIQ(ann.color || '#ffffff');
        let accumulatedDistance = 0;
        let accumulatedDuration = 0;
        
        ann.coordinates.forEach((coord: [number, number], i: number) => {
          const el = document.createElement('div');
          el.className = 'label-marker-route-point';
          el.style.width = '0px';
          el.style.height = '0px';
          el.style.position = 'relative';
          
          let innerClass = '';
          let innerHtml = '';
          
          if (i === 0) {
            innerClass = 'custom-marker-flat text-xs font-bold uppercase tracking-wider';
            innerHtml = 'START';
          } else {
            const leg = ann.routeLegs![i - 1];
            if (leg) {
              accumulatedDistance += leg.distance / 1000;
              accumulatedDuration += leg.duration;
            }
            const hrs = Math.floor(accumulatedDuration / 3600);
            const mins = Math.round((accumulatedDuration % 3600) / 60);
            const timeStr = hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`;
            
            innerClass = 'custom-marker-flat text-center leading-tight';
            innerHtml = `${accumulatedDistance.toFixed(1)} km<br/><span style="font-size:0.75em;opacity:0.9">${timeStr}</span>`;
          }
          
          el.innerHTML = `
            <div style="position: absolute; left: 0; top: 0; transform: translate(-50%, -50%); zoom: var(--export-annotation-scale, 1); transform-origin: center center; display: flex; align-items: center; justify-content: center;">
              <div class="${innerClass}" style="background-color: ${ann.color}; color: ${contrastColor};">
                ${innerHtml}
              </div>
            </div>
          `;
          
          el.style.cursor = 'pointer';
          el.addEventListener('click', (e) => {
            e.stopPropagation();
            if (activeTool !== 'none') {
              setSelectedAnnotationId(ann.id);
            }
          });

          if (ann.id === selectedAnnotationId) {
            el.style.filter = 'drop-shadow(0 0 6px rgba(255,255,255,1)) drop-shadow(0 0 12px rgba(255,255,255,0.8))';
            el.style.zIndex = '1000';
            el.style.outline = '2px dashed #ffffff';
            el.style.outlineOffset = '2px';
          }
          expectedMarkers.set(`${ann.id}-route-${i}`, { 
            lngLat: coord, 
            el,
            draggable: true,
            onDragEnd: (newLngLat: [number, number]) => handleRouteWaypointDragEnd(ann.id, i, newLngLat)
          });
        });
      } else if (ann.type === 'circle' && ann.coordinates?.[0]?.length > 0) {
        try {
          const contrastColor = getContrastYIQ(ann.color || '#ffffff');
          const center = turf.center(turf.polygon(ann.coordinates)).geometry.coordinates as [number, number];
          const centerEl = document.createElement('div');
          centerEl.className = 'label-marker-circle-center';
          centerEl.style.width = '0px';
          centerEl.style.height = '0px';
          centerEl.style.position = 'relative';
          centerEl.innerHTML = `
            <div style="position: absolute; left: 0; top: 0; transform: translate(-50%, -50%); zoom: var(--export-annotation-scale, 1); transform-origin: center center;">
              <div class="custom-marker-dot" style="background-color: ${ann.color};"></div>
            </div>
          `;
          centerEl.style.cursor = 'pointer';
          centerEl.addEventListener('click', (e) => {
            e.stopPropagation();
            if (activeTool !== 'none') {
              setSelectedAnnotationId(ann.id);
            }
          });
          centerEl.addEventListener('mousedown', (e) => e.stopPropagation());
          if (ann.id === selectedAnnotationId) {
            centerEl.style.filter = 'drop-shadow(0 0 6px rgba(255,255,255,1)) drop-shadow(0 0 12px rgba(255,255,255,0.8))';
            centerEl.style.zIndex = '1000';
            centerEl.style.outline = '2px dashed #ffffff';
            centerEl.style.outlineOffset = '2px';
          }
          expectedMarkers.set(`${ann.id}-circle-center`, { lngLat: center, el: centerEl });

          const edge = ann.coordinates[0][0];
          const labelEl = document.createElement('div');
          labelEl.className = 'label-marker-circle-radius';
          labelEl.style.width = '0px';
          labelEl.style.height = '0px';
          labelEl.style.position = 'relative';
          labelEl.innerHTML = `
            <div style="position: absolute; left: 0; top: 0; transform: translate(-50%, -50%); zoom: var(--export-annotation-scale, 1); transform-origin: center center; display: flex; align-items: center; justify-content: center;">
              <div class="custom-marker-flat" style="background-color: ${ann.color}; color: ${contrastColor};">
                ${(ann.radius || 0).toFixed(2)} km
              </div>
            </div>
          `;
          labelEl.style.cursor = 'pointer';
          labelEl.addEventListener('click', (e) => {
            e.stopPropagation();
            if (activeTool !== 'none') {
              setSelectedAnnotationId(ann.id);
            }
          });
          labelEl.addEventListener('dblclick', async (e) => {
            e.stopPropagation();
            if (activeTool !== 'none') {
              const currentRadius = ann.radius?.toFixed(2) || '';
              const newRadiusStr = await customPrompt(t('Enter new radius in km:'), currentRadius);
              if (newRadiusStr !== null) {
                const newRadius = parseFloat(newRadiusStr);
                if (!isNaN(newRadius) && newRadius > 0 && setAnnotationsRef.current) {
                  const circlePoly = createCirclePolygon(center, newRadius);
                  if (circlePoly) {
                    setAnnotationsRef.current(prev => prev.map(a => 
                      a.id === ann.id ? { ...a, radius: newRadius, coordinates: circlePoly.geometry.coordinates } : a
                    ));
                  }
                }
              }
            }
          });
          labelEl.addEventListener('mousedown', (e) => e.stopPropagation());
          if (ann.id === selectedAnnotationId) {
            labelEl.style.filter = 'drop-shadow(0 0 6px rgba(255,255,255,1)) drop-shadow(0 0 12px rgba(255,255,255,0.8))';
            labelEl.style.zIndex = '1000';
            labelEl.style.outline = '2px dashed #ffffff';
            labelEl.style.outlineOffset = '2px';
          }
          expectedMarkers.set(`${ann.id}-circle-radius`, { lngLat: edge, el: labelEl });
        } catch (e) {
          console.error('Error generating circle markers', e);
        }
      } else if (ann.type === 'icon' && ann.coordinates) {
        const allIcons = settings.icons?.flatMap(cat => cat.icons) || [];
        const iconObj = allIcons.find(i => i.id === ann.iconId);
        if (iconObj) {
          const el = document.createElement('div');
          el.className = 'label-marker-icon';
          el.style.width = '0px';
          el.style.height = '0px';
          el.style.position = 'relative';
          el.innerHTML = `
            <div style="position: absolute; left: 0; top: 0; transform: translate(-50%, -50%); zoom: var(--export-annotation-scale, 1); transform-origin: center center; display: flex; align-items: center; justify-content: center;">
              <div class="icon-marker w-16 h-16 flex items-center justify-center p-2 icon-svg-wrapper" style="background-color: ${ann.color || '#ffffff'}; color: ${getContrastYIQ(ann.color || '#ffffff')};">
                ${iconObj.svg}
              </div>
            </div>
          `;
          el.style.cursor = 'pointer';
          
          el.addEventListener('click', (e) => {
            e.stopPropagation();
            if (activeTool !== 'none') {
              setSelectedAnnotationId(ann.id);
            }
          });

          
          if (ann.id === selectedAnnotationId) {
            el.style.filter = 'drop-shadow(0 0 6px rgba(255,255,255,1)) drop-shadow(0 0 12px rgba(255,255,255,0.8))';
            el.style.zIndex = '1000';
            el.style.outline = '2px dashed #ffffff';
            el.style.outlineOffset = '2px';
          }
          const isSelected = ann.id === selectedAnnotationId;
          expectedMarkers.set(ann.id, {
            lngLat: ann.coordinates,
            el,
            draggable: isSelected && activeTool !== 'none',
            onDragEnd: (lngLat) => {
              setAnnotations(prev => prev.map(a => a.id === ann.id ? { ...a, coordinates: lngLat } : a));
            }
          });
        }
      }
    });

    // Always replace markers to ensure fresh event listeners and closures
    Object.keys(markersRef.current).forEach(id => {
      markersRef.current[id].remove();
      delete markersRef.current[id];
    });

    expectedMarkers.forEach((data, id) => {
      let anchor: any = 'center';
      let offset: [number, number] = [0, 0];
      
      if (data.el.dataset.anchorX && data.el.dataset.anchorY) {
        anchor = 'top-left';
        offset = [-parseFloat(data.el.dataset.anchorX), -parseFloat(data.el.dataset.anchorY)];
      } else if (data.el.classList.contains('custom-marker')) {
        anchor = 'bottom';
      }

      const marker = new maplibregl.Marker({ element: data.el, anchor, offset })
        .setLngLat(data.lngLat)
        .addTo(mapRef.current!);
      
      if (data.draggable) {
        marker.setDraggable(true);
        if (data.onDragEnd) {
          marker.on('dragend', () => {
            const lngLat = marker.getLngLat();
            data.onDragEnd!([lngLat.lng, lngLat.lat]);
          });
        }
      }
      markersRef.current[id] = marker;
    });
  }, [annotations, activeTool, mapLoaded, selectedAnnotationId, settings.icons]);

  // Animation Loop for Reveals
  useEffect(() => {
    if (!mapRef.current || !mapLoaded) return;
    
    let frameId: number;

    const duration = settings.animationDuration ?? 2000;
    const labelDuration = settings.labelAnimationDuration ?? 1000;
    const maxDuration = Math.max(duration, labelDuration);

    // Find triggers that need animation
    const overrideVisible = activeTool !== 'none';
    const activeTriggers = overrideVisible ? [] : Array.from(revealedTriggers).filter(t => (triggerProgressRef.current[t] ?? 0) < 1);
    const activeHiddenTriggers = overrideVisible ? [] : Array.from(hiddenTriggers).filter(t => (triggerProgressRef.current[t] ?? 0) < 1);
    const allActiveTriggers = [...activeTriggers, ...activeHiddenTriggers];
    
    const triggerExists = (id: string | undefined) => id ? annotations.some(a => a.id === id) : false;
    
    // First, sync feature-state and static opacities
    annotations.forEach(ann => {
      const hasRevealTrigger = !!ann.animationTriggerId && triggerExists(ann.animationTriggerId);
      const hasHideTrigger = !!ann.hideAnimationTriggerId && triggerExists(ann.hideAnimationTriggerId);
      const hasTriggers = hasRevealTrigger || hasHideTrigger;
      
      const isRevealTriggered = hasRevealTrigger && revealedTriggers.has(ann.animationTriggerId!);
      const isHideTriggered = hasHideTrigger && hiddenTriggers.has(ann.hideAnimationTriggerId!);
      
      let isRevealed = false;
      if (overrideVisible) {
        isRevealed = true;
      } else if (!hasTriggers) {
        isRevealed = true;
      } else {
        const revealTime = hasRevealTrigger ? (triggerTimestampsRef.current[ann.animationTriggerId!] || 0) : -1;
        const hideTime = hasHideTrigger ? (triggerTimestampsRef.current[ann.hideAnimationTriggerId!] || 0) : -1;
        
        if (isHideTriggered && isRevealTriggered) {
          if (hideTime > revealTime) isRevealed = activeHiddenTriggers.includes(ann.hideAnimationTriggerId!);
          else isRevealed = true;
        } else if (isHideTriggered) {
          isRevealed = activeHiddenTriggers.includes(ann.hideAnimationTriggerId!);
        } else if (isRevealTriggered) {
          isRevealed = true;
        } else if (hasHideTrigger && !hasRevealTrigger) {
          isRevealed = true; // start visible if only hide trigger exists
        }
      }

      // Feature-state for opacity fades
      mapRef.current!.setFeatureState(
        { source: 'custom-annotations', id: ann.id },
        { hidden: !isRevealed }
      );

      // DOM Markers static opacity (only if NOT currently animating)
      const isActiveReveal = hasRevealTrigger && activeTriggers.includes(ann.animationTriggerId!);
      const isActiveHide = hasHideTrigger && activeHiddenTriggers.includes(ann.hideAnimationTriggerId!);
      
      if (!isActiveReveal && !isActiveHide) {
        const markerIds = [ann.id, `${ann.id}-circle-center`, `${ann.id}-circle-radius`];
        const noFadeIds: string[] = [];
        
        if (ann.type === 'measure' && ann.coordinates) ann.coordinates.forEach((_: any, i: number) => noFadeIds.push(`${ann.id}-measure-${i}`));
        if (ann.type === 'route' && ann.coordinates) ann.coordinates.forEach((_: any, i: number) => noFadeIds.push(`${ann.id}-route-${i}`));
        
        markerIds.forEach(id => {
          const marker = markersRef.current[id];
          if (marker) {
            const el = marker.getElement();
            if (ann.type === 'highlight' || ann.type === 'label') {
              el.style.transition = 'none';
              el.style.display = isRevealed ? 'block' : 'none';
              
              const isLabel = ann.type === 'label';
              const plateSel = isLabel ? '.custom-marker-plate' : '.custom-highlight-plate, .custom-country-plate';
              const textSel = isLabel ? '.custom-marker-text' : '.custom-highlight-text, .custom-country-text';
              
              const plate = el.querySelector(plateSel) as HTMLElement;
              const text = el.querySelector(textSel) as HTMLElement;
              const pointer = el.querySelector('.custom-marker-pointer') as HTMLElement;
              
              if (pointer) pointer.style.opacity = isRevealed ? '1' : '0';
              if (plate && text) {
                if (isRevealed) {
                   plate.style.clipPath = `inset(0 0% 0 0)`;
                   text.style.transform = `translateY(0%)`;
                } else {
                   if (isLabel) plate.style.clipPath = `inset(100% 0 0 0)`;
                   else plate.style.clipPath = `inset(0 100% 0 0)`;
                   text.style.transform = `translateY(100%)`;
                }
              }
            } else {
              el.style.transition = 'none';
            }
            el.style.opacity = isRevealed ? '1' : '0';
            el.style.display = isRevealed ? 'flex' : 'none';

            el.style.pointerEvents = isRevealed ? 'auto' : 'none';
          }
        });
        
        noFadeIds.forEach(id => {
          const marker = markersRef.current[id];
          if (marker) {
            const el = marker.getElement();
            el.style.transition = 'none';
            el.style.opacity = isRevealed ? '1' : '0';
            el.style.display = isRevealed ? 'flex' : 'none';
            el.style.pointerEvents = isRevealed ? 'auto' : 'none';
          }
        });
      }
    });

    let startTime: number;
    const animate = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const elapsed = timestamp - startTime;
      
      const progress = Math.min(1, elapsed / duration);
      const labelProgress = Math.min(1, elapsed / labelDuration);
      const loopProgress = Math.min(1, elapsed / maxDuration);
      
      allActiveTriggers.forEach(t => {
        triggerProgressRef.current[t] = loopProgress;
      });
      
      // Use the persistent activeFeatures array to avoid GC allocations
      const currentFeatures = activeFeaturesRef.current;
      
      annotations.forEach(ann => {
        const hasRevealTrigger = !!ann.animationTriggerId && triggerExists(ann.animationTriggerId);
        const hasHideTrigger = !!ann.hideAnimationTriggerId && triggerExists(ann.hideAnimationTriggerId);
        const hasTriggers = hasRevealTrigger || hasHideTrigger;
        
        const isRevealTriggered = hasRevealTrigger && revealedTriggers.has(ann.animationTriggerId!);
        const isHideTriggered = hasHideTrigger && hiddenTriggers.has(ann.hideAnimationTriggerId!);
        const revealTime = hasRevealTrigger ? (triggerTimestampsRef.current[ann.animationTriggerId!] || 0) : -1;
        const hideTime = hasHideTrigger ? (triggerTimestampsRef.current[ann.hideAnimationTriggerId!] || 0) : -1;
        
        let isRevealed = false;
        let annProgress = 0;
        let labelAnnProgress = 0;
        
        if (overrideVisible) {
          isRevealed = true;
          annProgress = 1;
          labelAnnProgress = 1;
        } else if (!hasTriggers) {
          isRevealed = true;
          annProgress = 1;
          labelAnnProgress = 1;
        } else {
          // If both triggered, the most recent wins
          if (isHideTriggered && isRevealTriggered) {
             if (hideTime > revealTime) {
                isRevealed = true;
                if (activeHiddenTriggers.includes(ann.hideAnimationTriggerId!)) {
                   annProgress = Math.max(0, 1 - progress);
                   labelAnnProgress = Math.max(0, 1 - labelProgress);
                } else {
                   annProgress = 0;
                   labelAnnProgress = 0;
                   isRevealed = false;
                }
             } else {
                isRevealed = true;
                if (activeTriggers.includes(ann.animationTriggerId!)) {
                    annProgress = progress;
                    labelAnnProgress = labelProgress;
                } else {
                   annProgress = 1;
                   labelAnnProgress = 1;
                }
             }
          } else if (isHideTriggered) {
             if (hasRevealTrigger && !isRevealTriggered) {
               isRevealed = false;
               annProgress = 0;
               labelAnnProgress = 0;
             } else {
               isRevealed = true;
               if (activeHiddenTriggers.includes(ann.hideAnimationTriggerId!)) {
                  annProgress = Math.max(0, 1 - progress);
                  labelAnnProgress = Math.max(0, 1 - labelProgress);
               } else {
                  annProgress = 0;
                  labelAnnProgress = 0;
                  isRevealed = false;
               }
             }
          } else if (isRevealTriggered) {
             isRevealed = true;
             if (activeTriggers.includes(ann.animationTriggerId!)) {
                annProgress = progress;
                labelAnnProgress = labelProgress;
             } else {
                annProgress = 1;
                labelAnnProgress = 1;
             }
          } else {
             if (hasRevealTrigger) {
               isRevealed = false;
               annProgress = 0;
               labelAnnProgress = 0;
             } else if (hasHideTrigger) {
               isRevealed = true;
               annProgress = 1;
               labelAnnProgress = 1;
             } else {
               isRevealed = true;
               annProgress = 1;
               labelAnnProgress = 1;
             }
          }
        }
        
        // Apply hidden property to all features of this annotation
        const featureIndices = currentFeatures.map((f: any, i: number) => (f.id === ann.id || f.properties?.id === ann.id || f.properties?.featureId === ann.id) ? i : -1).filter((i: number) => i !== -1);
        featureIndices.forEach((idx: number) => {
           currentFeatures[idx].properties!.hidden = !isRevealed;
           
           if (ann.type === 'polygon' || ann.type === 'highlight' || ann.type === 'circle') {
             const targetFillOpacity = currentFeatures[idx].properties!.fillOpacity ?? 0.5;
             currentFeatures[idx].properties!.currentOpacity = targetFillOpacity * annProgress;
             currentFeatures[idx].properties!.currentLineOpacity = annProgress;
           } else {
             currentFeatures[idx].properties!.currentLineOpacity = 1;
           }
        });
        
        // Write-on logic
        if ((ann.type === 'paint' || ann.type === 'measure' || ann.type === 'route') && ann.coordinates) {
          featureIndices.forEach((idx: number) => {
             const f = currentFeatures[idx];
             const baseF = baseFeaturesRef.current[idx];
             if (f.geometry.type === 'LineString' && baseF.geometry.type === 'LineString') {
               if (annProgress === 0) {
                 f.geometry.coordinates = [];
               } else if (annProgress < 1) {
                 const baseCoords = baseF.geometry.coordinates;
                 if (baseCoords.length >= 2) {
                   if (!cachedTurfDataRef.current[`${f.id}-line`]) {
                     const line = turf.lineString(baseCoords as any);
                     cachedTurfDataRef.current[`${f.id}-line`] = {
                       line,
                       dist: turf.length(line, { units: 'kilometers' })
                     };
                   }
                   const cache = cachedTurfDataRef.current[`${f.id}-line`];
                   const targetDist = cache.dist * annProgress;
                   if (targetDist > 0) {
                     const sliced = turf.lineSliceAlong(cache.line, 0, targetDist, { units: 'kilometers' });
                     f.geometry.coordinates = sliced.geometry.coordinates;
                   } else {
                     f.geometry.coordinates = [];
                   }
                 } else {
                   f.geometry.coordinates = [];
                 }
               } else {
                 f.geometry.coordinates = baseF.geometry.coordinates;
               }
             } else if (f.geometry.type === 'MultiLineString' && baseF.geometry.type === 'MultiLineString') {
               if (annProgress === 0) {
                 f.geometry.coordinates = [];
               } else if (annProgress < 1) {
                 const baseCoords = baseF.geometry.coordinates as [number, number][][];
                 const totalSegments = baseCoords.length;
                 const targetSegments = Math.max(1, Math.floor(totalSegments * annProgress));
                 f.geometry.coordinates = baseCoords.slice(0, targetSegments);
               } else {
                 f.geometry.coordinates = baseF.geometry.coordinates;
               }
             }
          });
        }

        // Arrow logic
        if (ann.type === 'arrow' && ann.coordinates && ann.coordinates.length === 2) {
           const p1 = ann.coordinates[0];
           const p2 = ann.coordinates[1];
           const shaftIdx = currentFeatures.findIndex((f: any) => f.properties?.featureId === ann.id && f.properties?.$type === 'LineString');
           const headIdx = currentFeatures.findIndex((f: any) => f.properties?.featureId === ann.id && f.properties?.$type === 'ArrowHead');
           
           if (annProgress === 0) {
             if (shaftIdx !== -1) (currentFeatures[shaftIdx].geometry as any).coordinates = [];
             if (headIdx !== -1) (currentFeatures[headIdx].geometry as any).coordinates = [];
           } else {
             const pCurr = [
               p1[0] + (p2[0] - p1[0]) * annProgress,
               p1[1] + (p2[1] - p1[1]) * annProgress
             ];
             const arrowFeats = createArrowFeatures(p1, pCurr as [number, number], ann.color || '#ffffff', ann.id);
             
             if (arrowFeats) {
               if (shaftIdx !== -1) currentFeatures[shaftIdx].geometry = arrowFeats.shaft.geometry;
               if (headIdx !== -1) {
                  currentFeatures[headIdx].geometry = arrowFeats.head.geometry;
                  currentFeatures[headIdx].properties!.bearing = arrowFeats.head.properties?.bearing;
               }
             }
           }
        }
        
        // Circle radial expansion
        if (ann.type === 'circle' && ann.radius && ann.coordinates) {
          const featureIdx = currentFeatures.findIndex((f: any) => f.id === ann.id || f.properties?.featureId === ann.id);
          if (featureIdx !== -1 && currentFeatures[featureIdx].geometry.type === 'Polygon') {
             if (annProgress === 0) {
               currentFeatures[featureIdx].geometry.coordinates = [];
             } else if (annProgress < 1) {
               if (!cachedTurfDataRef.current[`${ann.id}-full-poly`]) {
                 const center = turf.center(turf.polygon(ann.coordinates)).geometry.coordinates as [number, number];
                 cachedTurfDataRef.current[`${ann.id}-center`] = center;
                 cachedTurfDataRef.current[`${ann.id}-full-poly`] = createCirclePolygon(center, ann.radius);
               }
               const center = cachedTurfDataRef.current[`${ann.id}-center`];
               const fullPoly = cachedTurfDataRef.current[`${ann.id}-full-poly`];
               
               if (fullPoly && fullPoly.geometry.coordinates[0]) {
                 const scaledCoords = fullPoly.geometry.coordinates[0].map((coord: [number, number]) => [
                    center[0] + (coord[0] - center[0]) * annProgress,
                    center[1] + (coord[1] - center[1]) * annProgress
                 ]);
                 currentFeatures[featureIdx].geometry.coordinates = [scaledCoords];
               }
             } else {
               currentFeatures[featureIdx].geometry.coordinates = ann.coordinates;
             }
          }
        }
        
        // Update DOM Marker dynamic opacity during animation
        const isAnimatingReveal = hasRevealTrigger && activeTriggers.includes(ann.animationTriggerId!);
        const isAnimatingHide = hasHideTrigger && activeHiddenTriggers.includes(ann.hideAnimationTriggerId!);
        
        if (isAnimatingReveal || isAnimatingHide) {
          const markerIds = [ann.id];
          
          markerIds.forEach(id => {
            const marker = markersRef.current[id];
            if (marker) {
              const el = marker.getElement();
              let p = annProgress;
              if (ann.type === 'label' || ann.type === 'highlight' || ann.type === 'icon') {
                 p = labelAnnProgress;
              }
              
              if (ann.type === 'highlight' || ann.type === 'label') {
                el.style.transition = 'none';
                const isVisible = isRevealed && p > 0;
                
                el.style.opacity = isVisible ? '1' : '0';
                el.style.display = isVisible ? 'block' : 'none';
                el.style.pointerEvents = isVisible ? 'auto' : 'none';
                
                const isLabel = ann.type === 'label';
                const plateSel = isLabel ? '.custom-marker-plate' : '.custom-highlight-plate, .custom-country-plate';
                const textSel = isLabel ? '.custom-marker-text' : '.custom-highlight-text, .custom-country-text';
                
                const plate = el.querySelector(plateSel) as HTMLElement;
                const text = el.querySelector(textSel) as HTMLElement;
                const pointer = el.querySelector('.custom-marker-pointer') as HTMLElement;
                
                if (pointer) {
                   pointer.style.opacity = isVisible ? '1' : '0';
                }
                
                if (plate && text) {
                  if (p <= 0.5) {
                    const plateP = p * 2;
                    if (isLabel) {
                      plate.style.clipPath = `inset(${100 - plateP * 100}% 0 0 0)`;
                    } else {
                      plate.style.clipPath = `inset(0 ${100 - plateP * 100}% 0 0)`;
                    }
                    text.style.transform = `translateY(100%)`;
                  } else {
                    const textP = (p - 0.5) * 2;
                    plate.style.clipPath = `inset(0 0% 0 0)`;
                    text.style.transform = `translateY(${(1 - textP) * 100}%)`;
                  }
                }
              } else {
                el.style.transition = 'none';
                el.style.opacity = p.toString();
                el.style.display = p > 0 ? 'flex' : 'none';
                el.style.pointerEvents = p > 0.5 ? 'auto' : 'none';
              }
            }
          });
          
          if (ann.type === 'circle') {
            const centerMarker = markersRef.current[`${ann.id}-circle-center`];
            const radiusMarker = markersRef.current[`${ann.id}-circle-radius`];
            const isVisible = isRevealed && annProgress > 0;
            
            if (centerMarker) {
               centerMarker.getElement().style.transition = 'none';
               centerMarker.getElement().style.opacity = isVisible ? '1' : '0';
               centerMarker.getElement().style.display = isVisible ? 'flex' : 'none';
               centerMarker.getElement().style.pointerEvents = isVisible ? 'auto' : 'none';
            }
            if (radiusMarker) {
               radiusMarker.getElement().style.transition = 'none';
               radiusMarker.getElement().style.opacity = isVisible ? '1' : '0';
               radiusMarker.getElement().style.display = isVisible ? 'flex' : 'none';
               radiusMarker.getElement().style.pointerEvents = isVisible ? 'auto' : 'none';
               
               const featureIdx = currentFeatures.findIndex((f: any) => f.id === ann.id || f.properties?.featureId === ann.id);
               if (featureIdx !== -1 && currentFeatures[featureIdx].geometry.type === 'Polygon') {
                  const polyCoords = currentFeatures[featureIdx].geometry.coordinates;
                  if (polyCoords && polyCoords[0] && polyCoords[0][0]) {
                     radiusMarker.setLngLat(polyCoords[0][0] as [number, number]);
                  }
               }
            }
          }
          
          if (ann.type === 'measure' && ann.coordinates) {
             ann.coordinates.forEach((_: any, i: number) => {
               const marker = markersRef.current[`${ann.id}-measure-${i}`];
               if (marker) {
                  const threshold = ann.coordinates.length > 1 ? i / (ann.coordinates.length - 1) : 0;
                  const visible = isRevealed && annProgress > 0 && annProgress >= threshold;
                  marker.getElement().style.transition = 'none';
                  marker.getElement().style.opacity = visible ? '1' : '0';
                  marker.getElement().style.display = visible ? 'flex' : 'none';
                  marker.getElement().style.pointerEvents = visible ? 'auto' : 'none';
               }
             });
          }
          
          if (ann.type === 'route' && ann.coordinates) {
             ann.coordinates.forEach((_: any, i: number) => {
               const marker = markersRef.current[`${ann.id}-route-${i}`];
               if (marker) {
                  const threshold = ann.coordinates.length > 1 ? i / (ann.coordinates.length - 1) : 0;
                  const visible = isRevealed && annProgress > 0 && annProgress >= threshold;
                  marker.getElement().style.transition = 'none';
                  marker.getElement().style.opacity = visible ? '1' : '0';
                  marker.getElement().style.display = visible ? 'flex' : 'none';
                  marker.getElement().style.pointerEvents = visible ? 'auto' : 'none';
               }
             });
          }
        }
      });
      
      const source = mapRef.current?.getSource('custom-annotations') as maplibregl.GeoJSONSource;
      if (source) {
        source.setData({ type: 'FeatureCollection', features: currentFeatures });
      }

      if (progress < 1) {
        frameId = requestAnimationFrame(animate);
      } else {
        
        // Run one last time to ensure exact final positions if needed
        allActiveTriggers.forEach(t => {
          triggerProgressRef.current[t] = 1;
        });

        if (allActiveTriggers.length > 0) {
          setAnimationTick(prev => prev + 1);
        }
      }
    };
    
    // Start animation loop or run static evaluation
    if (allActiveTriggers.length > 0) {
      frameId = requestAnimationFrame(animate);
    } else {
      animate(performance.now());
    }
    
    return () => {
      if (frameId) cancelAnimationFrame(frameId);
    };
  }, [revealedTriggers, hiddenTriggers, annotations, mapLoaded, activeTool, animationTick, selectedAnnotationId, settings.icons]);

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
  const upgradeLegacyFilter = (filter: any): any => {
    if (!Array.isArray(filter) || filter.length === 0) return filter;
    const op = filter[0];
    
    // Check if it's already an expression (second element is an array like ['get', 'class'])
    if (op !== 'all' && op !== 'any' && op !== 'none') {
      if (filter.length > 1 && Array.isArray(filter[1])) {
        return filter; 
      }
    }

    if (op === 'all' || op === 'any' || op === 'none') {
      return [op, ...filter.slice(1).map(upgradeLegacyFilter)];
    }
    if (op === 'has') return ['has', filter[1]];
    if (op === '!has') return ['!', ['has', filter[1]]];
    if (op === 'in') return ['in', ['get', filter[1]], ['literal', filter.slice(2)]];
    if (op === '!in') return ['!', ['in', ['get', filter[1]], ['literal', filter.slice(2)]]];
    if (['==', '!=', '>', '>=', '<', '<='].includes(op)) {
      return [op, ['get', filter[1]], filter[2]];
    }
    return filter;
  };

  // Handle Map Label Density
  useEffect(() => {
    if (!mapRef.current || !mapLoaded || settings.labelDensity === undefined) return;
    
    const density = settings.labelDensity;
    let style;
    try {
      style = mapRef.current.getStyle();
    } catch(e) {
      return; // Style not loaded yet, ignore
    }

    if (style && style.layers) {
      style.layers.forEach(layer => {
        if (layer.type === 'symbol' && !layer.id.startsWith('custom-')) {
          const origFilter = originalFiltersRef.current[layer.id];
          let extraCondition: any = null;

          const id = layer.id.toLowerCase();
          const sourceLayer = layer['source-layer'] ? layer['source-layer'].toLowerCase() : '';

          if (id.includes('ukraine')) {
            if (density < 100) {
              // Smooth population curve: density 0 = 2,000,000 (shows only Kyiv); density 50 = ~125,000; density 80 = ~3,200; density 100 = 0
              const minPopulation = Math.floor(2000000 * Math.pow((100 - density) / 100, 4));
              
              const popCondition = ['>=', ['coalesce', ['to-number', ['get', 'population']], 0], minPopulation];
              
              // Fallback for capitals if they exist in this dataset
              let capCondition: any[] = ['==', '1', '2'];
              if (density === 0) {
                 capCondition = ['all', ['has', 'capital'], ['==', ['get', 'capital'], 2]];
              } else if (density < 10) {
                 capCondition = ['all', ['has', 'capital'], ['<=', ['get', 'capital'], 3]]; 
              } else {
                 capCondition = ['all', ['has', 'capital'], ['>', ['get', 'capital'], 0]];
              }
              
              extraCondition = ['any', popCondition, capCondition];
            }
          } else if (id.includes('place') || sourceLayer.includes('place') || id.includes('settlement') || sourceLayer.includes('settlement') || id.includes('village') || id.includes('town') || id.includes('cit') || id.includes('capital')) {
            if (density < 100) {
              let maxRank = 1;
              if (density > 0) {
                // Use an exponential curve so that the slider is immediately sensitive.
                // At density 100: maxRank = 15
                // At density 50: maxRank = 4
                // At density 0: maxRank = 1
                maxRank = 1 + Math.floor(Math.pow(density / 100, 2) * 14);
              }

              // If a place has no rank, assign it a virtual rank based on its class
              const classBasedRank = ['case',
                ['==', ['get', 'class'], 'city'], 5,
                ['==', ['get', 'class'], 'town'], 10,
                ['==', ['get', 'class'], 'village'], 15,
                ['any',
                  ['==', ['get', 'class'], 'hamlet'],
                  ['==', ['get', 'class'], 'suburb'],
                  ['==', ['get', 'class'], 'neighbourhood'],
                  ['==', ['get', 'class'], 'isolated_dwelling']
                ], 20,
                30
              ];

              const rankCondition = ['<=', ['to-number', ['coalesce', ['get', 'symbolrank'], ['get', 'scalerank'], ['get', 'rank'], classBasedRank]], maxRank];
              
              let capCondition: any[] = ['==', '1', '2'];
              if (density === 0) {
                 capCondition = ['all', ['has', 'capital'], ['==', ['get', 'capital'], 2]]; // National capitals only
              } else if (density < 10) {
                 capCondition = ['all', ['has', 'capital'], ['<=', ['get', 'capital'], 3]]; // National + State capitals
              } else {
                 capCondition = ['all', ['has', 'capital'], ['>', ['get', 'capital'], 0]];   // All capitals
              }
              
              const isCountry = ['any', ['==', ['get', 'class'], 'country'], ['==', ['get', 'type'], 'country']];

              extraCondition = ['any', rankCondition, capCondition, isCountry];
            }
          } else if (id.includes('poi') || id.includes('transit') || sourceLayer.includes('poi') || id.includes('amenity') || id.includes('shop') || id.includes('tourism') || id.includes('leisure') || id.includes('sport') || id.includes('attraction') || id.includes('airport') || id.includes('station') || id.includes('historic') || sourceLayer.includes('amenity') || sourceLayer.includes('shop') || sourceLayer.includes('tourism') || sourceLayer.includes('leisure')) {
            if (density < 15) {
              extraCondition = ['==', 1, 2]; // Hide
            } else if (density < 100) {
              const maxScaleRank = 1 + Math.floor(((density - 15) / 85) * 9);
              extraCondition = ['<=', ['coalesce', ['get', 'scalerank'], ['get', 'rank'], 10], maxScaleRank];
            }
          } else if (id.includes('road') || id.includes('water') || id.includes('natural') || id.includes('highway') || id.includes('path') || id.includes('trail')) {
            if (density < 5) {
              extraCondition = ['==', 1, 2]; // Hide
            }
          }

          let finalFilter = origFilter;
          if (extraCondition) {
            finalFilter = origFilter ? ['all', upgradeLegacyFilter(origFilter), extraCondition] : extraCondition;
          }
          
          try {
            mapRef.current!.setFilter(layer.id, finalFilter);
          } catch(e) {
            console.error('Label density filter error:', e, layer.id, finalFilter);
          }
        }
      });
    }
  }, [settings.labelDensity, mapLoaded, styleLoadedTick]);

  // Update selected annotation filter
  useEffect(() => {
    if (!mapRef.current || !mapRef.current.getLayer('custom-selected-line')) return;
    mapRef.current.setFilter('custom-selected-line', ['==', 'id', selectedAnnotationId || 'none']);
    if (mapRef.current.getLayer('custom-selected-glow')) {
      mapRef.current.setFilter('custom-selected-glow', ['==', 'id', selectedAnnotationId || 'none']);
    }
  }, [selectedAnnotationId]);


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
  const flightsLayer = settings.layers.find(l => l.type === 'flights');
  const triggerExistsForFlights = (id: string | undefined) => id ? annotations.some(a => a.id === id) : false;
  const hasRevealTriggerForFlights = flightsLayer ? !!flightsLayer.animationTriggerId && triggerExistsForFlights(flightsLayer.animationTriggerId) : false;
  const hasHideTriggerForFlights = flightsLayer ? !!flightsLayer.hideAnimationTriggerId && triggerExistsForFlights(flightsLayer.hideAnimationTriggerId) : false;
  const isRevealedForFlights = activeTool !== 'none' || (!hasRevealTriggerForFlights || (flightsLayer && revealedTriggers.has(flightsLayer.animationTriggerId!)));
  const isHiddenForFlights = activeTool === 'none' && flightsLayer && ((hasHideTriggerForFlights && hiddenTriggers.has(flightsLayer.hideAnimationTriggerId!)) || hiddenTriggers.has(flightsLayer.id));
  const isFlightsVisible = flightsLayer?.visible && isRevealedForFlights && !isHiddenForFlights;

  // Polling for flights

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded || !flightsLayer || !isFlightsVisible) {
      if (map && deckOverlayRef.current) {
        map.removeControl(deckOverlayRef.current);
        deckOverlayRef.current.finalize();
        deckOverlayRef.current = null;
      }
      return;
    }

    let timeoutId: ReturnType<typeof setTimeout>;
    let isActive = true;
    let currentInterval = 10000;

    const fetchFlights = async () => {
      if (!isActive) return;
      try {
        const bounds = map.getBounds();
        if (!bounds) return;
        const lamin = bounds.getSouth();
        const lamax = bounds.getNorth();
        const lomin = bounds.getWest();
        const lomax = bounds.getEast();
        
        let token = '';
        if (settings.openSkyCredentials?.clientId && settings.openSkyCredentials?.clientSecret) {
          if (!openSkyTokenRef.current || Date.now() > openSkyTokenRef.current.expires) {
            const tokenRes = await fetch('./api.php?action=opensky_token', {
              method: 'POST',
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
              body: `grant_type=client_credentials&client_id=${encodeURIComponent(settings.openSkyCredentials.clientId)}&client_secret=${encodeURIComponent(settings.openSkyCredentials.clientSecret)}`
            });
            if (tokenRes.ok) {
              const tokenData = await tokenRes.json();
              if (tokenData.access_token) {
                openSkyTokenRef.current = {
                  token: tokenData.access_token,
                  expires: Date.now() + (tokenData.expires_in - 30) * 1000
                };
              }
            }
          }
          if (openSkyTokenRef.current) {
            token = openSkyTokenRef.current.token;
          }
        }
        
        const url = `./api.php?action=opensky&lamin=${lamin}&lomin=${lomin}&lamax=${lamax}&lomax=${lomax}${token ? '&token=' + encodeURIComponent(token) : ''}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`OpenSky API error: ${res.statusText}`);
        
        const data = await res.json();

        if (data.states && data.states.length > 0) {
            // Calculate eligible aircraft for paths
            const visibleStates = data.states.filter((s: any) => s[5] !== null && s[6] !== null && s[5] >= lomin && s[5] <= lomax && s[6] >= lamin && s[6] <= lamax);
            let eligiblePlanes: any[] = [];
            if (flightsLayer.is3DMode) {
                const center = map.getCenter();
                if (center) {
                    visibleStates.sort((a: any, b: any) => {
                        const distA = haversineDistance([center.lng, center.lat], [a[5], a[6]]);
                        const distB = haversineDistance([center.lng, center.lat], [b[5], b[6]]);
                        return distA - distB;
                    });
                }
                eligiblePlanes = visibleStates.slice(0, 20);
            } else {
                eligiblePlanes = visibleStates.slice(0, 20);
            }
            
            if (selectedAircraftIdRef.current) {
                const selectedState = visibleStates.find((s: any) => s[0] === selectedAircraftIdRef.current);
                if (selectedState && !eligiblePlanes.find(p => p[0] === selectedAircraftIdRef.current)) {
                    eligiblePlanes.push(selectedState);
                }
            }
            
            const now = Date.now() / 1000;
            
            // Fetch track for new eligible planes
            for (const p of eligiblePlanes) {
                const icao24 = p[0];
                const history = flightHistoryRef.current[icao24];
                if (!history || (now - history.lastFetched > 60)) { // fetch if no history or older than 60s
                    // Fetch from opensky_track
                    try {
                        const tRes = await fetch(`./api.php?action=opensky_track&icao24=${icao24}&time=0${token ? '&token=' + encodeURIComponent(token) : ''}`);
                        if (tRes.ok) {
                            const tData = await tRes.json();
                            if (tData.path) {
                                let lastValidAlt = 0;
                                // Pre-scanner for first valid altitude
                                for (let i = 0; i < tData.path.length; i++) {
                                    if (tData.path[i][3] !== null) {
                                        lastValidAlt = tData.path[i][3];
                                        break;
                                    }
                                }
                                
                                const validPath = tData.path.filter((pt: any) => pt[0] <= p[3]).map((pt: any) => {
                                    if (pt[3] !== null) lastValidAlt = pt[3];
                                    return [pt[2], pt[1], lastValidAlt, pt[0]]; // [lon, lat, alt, time]
                                });
                                
                                flightHistoryRef.current[icao24] = {
                                    lastFetched: now,
                                    track: validPath
                                };
                            }
                        } else {
                            // Cache empty track to avoid spamming 404 requests
                            flightHistoryRef.current[icao24] = {
                                lastFetched: now,
                                track: flightHistoryRef.current[icao24]?.track || []
                            };
                        }
                    } catch(e) {}
                }
            }
            
            // Append live state to all tracks (both eligible and not, we prune later)
            for (const s of data.states) {
                const icao24 = s[0];
                if (flightHistoryRef.current[icao24]) {
                    const hist = flightHistoryRef.current[icao24];
                    let lastValidAlt = hist.track.length > 0 ? hist.track[hist.track.length - 1][2] : 0;
                    let currentAlt = s[7] !== null ? s[7] : lastValidAlt;
                    
                    // Only append if it's newer than the last point
                    if (hist.track.length === 0 || s[3] > hist.track[hist.track.length - 1][3]) {
                        hist.track.push([s[5], s[6], currentAlt, s[3]]);
                    }
                    
                    // Prune older than 5 minutes (300 seconds)
                    const cutoff = s[3] - 300;
                    hist.track = hist.track.filter((pt: any) => pt[3] >= cutoff);
                }
            }

            for (const s of data.states) {
                if (s[0] === selectedAircraftIdRef.current) {
                    const lastPt = selectedFlightTrackRef.current[selectedFlightTrackRef.current.length - 1];
                    if (!lastPt || lastPt[0] !== s[5] || lastPt[1] !== s[6]) {
                        selectedFlightTrackRef.current = [...selectedFlightTrackRef.current, [s[5], s[6], s[7] !== null ? s[7] : 0, s[3]]];
                        const trackSource = map.getSource('selected-flight-track') as maplibregl.GeoJSONSource;
                        if (trackSource) {
                            trackSource.setData({
                                type: 'FeatureCollection',
                                features: [{
                                    type: 'Feature',
                                    geometry: { type: 'LineString', coordinates: selectedFlightTrackRef.current },
                                    properties: {}
                                }]
                            });
                        }
                    }
                }
            }
            
            // Clean up history for planes no longer eligible
            const eligibleIds = new Set(eligiblePlanes.map(p => p[0]));
            for (const id of Object.keys(flightHistoryRef.current)) {
                if (!eligibleIds.has(id)) {
                    delete flightHistoryRef.current[id];
                }
            }

            updateDeckGLRef.current = () => {
                const pathData = Object.entries(flightHistoryRef.current)
                  .filter(([icao24]) => icao24 !== selectedAircraftIdRef.current)
                  .map(([icao24, h]: [string, any]) => {
                    const aircraftColor = flightsLayer.aircraftColors && Object.keys(flightsLayer.aircraftColors).length > 0 
                      ? (flightsLayer.aircraftColors[icao24] || flightsLayer.globalAircraftColor || '#ffffff') 
                      : (flightsLayer.globalAircraftColor || '#ffffff');
                    
                    let r = 255, g = 255, b = 255;
                    if (aircraftColor.startsWith('#') && aircraftColor.length === 7) {
                        r = parseInt(aircraftColor.slice(1, 3), 16);
                        g = parseInt(aircraftColor.slice(3, 5), 16);
                        b = parseInt(aircraftColor.slice(5, 7), 16);
                    }
                    
                    return {
                        path: h.track.map((pt: any) => [pt[0], pt[1], pt[2]]),
                        color: [r, g, b, 128],
                        hexColor: aircraftColor
                    };
                });

                const shadowSource = map.getSource('automated-flight-tracks-shadow') as maplibregl.GeoJSONSource;
                if (shadowSource) {
                    shadowSource.setData({
                        type: 'FeatureCollection',
                        features: pathData.map((d: any) => ({
                            type: 'Feature',
                            geometry: { type: 'LineString', coordinates: d.path.map((pt: any) => [pt[0], pt[1]]) },
                            properties: { color: d.hexColor }
                        }))
                    });
                }

                if (flightsLayer.is3DMode) {

                const pathLayer = new PathLayer({
                    id: 'flight-paths-3d',
                    data: pathData,
                    getPath: (d: any) => d.path,
                    getColor: (d: any) => d.color,
                    getWidth: 3,
                    widthUnits: 'pixels',
                    jointRounded: true,
                    capRounded: true,
                    billboard: true
                });

                const iconData = data.states.map((state: any) => {
                    const icao24 = state[0];
                    const callsign = state[1] ? state[1].trim() : '';
                    const lon = state[5];
                    const lat = state[6];
                    const alt = state[7] !== null ? state[7] : 0;
                    const trueTrack = state[10] !== null ? state[10] : 0;
                    const velocity = state[9] !== null ? Math.round(state[9] * 3.6) : 0;

                    const aircraftColor = flightsLayer.aircraftColors && Object.keys(flightsLayer.aircraftColors).length > 0 
                      ? (flightsLayer.aircraftColors[icao24] || flightsLayer.globalAircraftColor || '#ffffff') 
                      : (flightsLayer.globalAircraftColor || '#ffffff');
                    
                    let r = 255, g = 255, b = 255;
                    if (aircraftColor.startsWith('#') && aircraftColor.length === 7) {
                        r = parseInt(aircraftColor.slice(1, 3), 16);
                        g = parseInt(aircraftColor.slice(3, 5), 16);
                        b = parseInt(aircraftColor.slice(5, 7), 16);
                    }
                    
                    const isSelected = icao24 === selectedAircraftIdRef.current;
                    const opacity = 255;

                    return {
                        position: [lon, lat, alt],
                        angle: -trueTrack,
                        color: [r, g, b, opacity],
                        callsign: callsign || icao24,
                        icao24: icao24,
                        altitude: alt,
                        velocity: velocity,
                        isSelected: isSelected
                    };
                });



                const currentZoom = map.getZoom();
                const dynamicScale = 250000 / Math.pow(2, currentZoom);

                const iconLayer = new ScenegraphLayer({
                    id: 'flight-icons-3d',
                    data: iconData,
                    scenegraph: './lowpolyjet_v4.glb',
                    loaders: [GLTFLoader],
                    getPosition: (d: any) => d.position,
                    getOrientation: (d: any) => [0, d.angle, 90],
                    sizeScale: dynamicScale,
                    getColor: (d: any) => d.color,
                    pickable: true,
                    onClick: (info) => {
                        if (info.object) {
                            setSelectedAircraftId(info.object.icao24);
                        }
                    },
                    parameters: { depthTest: true }
                });

                const textLayer = new TextLayer({
                    id: 'flight-labels-3d',
                    data: flightsLayer.showCallsigns ? iconData : [],
                    getPosition: (d: any) => d.position,
                    getText: (d: any) => `${d.callsign}\n${Math.round(d.altitude)}m | ${d.velocity}km/h`,
                    getSize: 12,
                    getColor: (d: any) => d.color,
                    getAlignmentBaseline: 'bottom',
                    getPixelOffset: [0, -15],
                    billboard: true,
                    background: false,
                    parameters: { depthTest: true }
                });
                
                const latestTime = flightHistoryRef.current[selectedAircraftIdRef.current || '']?.track.slice(-1)[0]?.[3] || Infinity;
                const selectedPathData = (selectedAircraftIdRef.current && selectedFlightTrackRef.current.length > 0) ? [{
                    path: (() => {
                        let finalPath = selectedFlightTrackRef.current
                            .filter((pt: any) => !pt[3] || pt[3] <= latestTime)
                            .map((pt: any) => [pt[0], pt[1], pt[2] || 0]);
                        
                        // Guarantee the path physically touches the current live icon
                        const liveState = data.states.find((s: any) => s[0] === selectedAircraftIdRef.current);
                        if (liveState && liveState[5] !== null && liveState[6] !== null) {
                            const livePt = [liveState[5], liveState[6], liveState[7] || 0];
                            const lastPathPt = finalPath[finalPath.length - 1];
                            if (!lastPathPt || lastPathPt[0] !== livePt[0] || lastPathPt[1] !== livePt[1]) {
                                finalPath.push(livePt);
                            }
                        }
                        return finalPath;
                    })(),
                    color: (() => {
                        const aircraftColor = flightsLayer.aircraftColors && Object.keys(flightsLayer.aircraftColors).length > 0 
                          ? (flightsLayer.aircraftColors[selectedAircraftIdRef.current || ''] || flightsLayer.globalAircraftColor || '#ffffff') 
                          : (flightsLayer.globalAircraftColor || '#ffffff');
                        let r = 255, g = 255, b = 255;
                        if (aircraftColor.startsWith('#') && aircraftColor.length === 7) {
                            r = parseInt(aircraftColor.slice(1, 3), 16);
                            g = parseInt(aircraftColor.slice(3, 5), 16);
                            b = parseInt(aircraftColor.slice(5, 7), 16);
                        }
                        return [r, g, b, 255];
                    })()
                }] : [];

                const selectedPathLayer = new PathLayer({
                    id: 'selected-flight-path-3d',
                    data: selectedPathData,
                    getPath: (d: any) => d.path,
                    getColor: (d: any) => d.color,
                    getWidth: 5,
                    widthUnits: 'pixels',
                    jointRounded: true,
                    capRounded: true,
                    billboard: true
                });

                if (!deckOverlayRef.current) {
                    deckOverlayRef.current = new MapboxOverlay({
                        interleaved: true,
                        layers: [pathLayer, selectedPathLayer, iconLayer, textLayer]
                    });
                    map.addControl(deckOverlayRef.current);
                } else {
                    deckOverlayRef.current.setProps({
                        layers: [pathLayer, selectedPathLayer, iconLayer, textLayer]
                    });
                }
            } else {
                if (deckOverlayRef.current) {
                    map.removeControl(deckOverlayRef.current);
                    deckOverlayRef.current.finalize();
                    deckOverlayRef.current = null;
                }
            }
          };
          updateDeckGLRef.current();
        }

        const features = (data.states || []).map((state: any) => {
          const lon = state[5];
          const lat = state[6];
          const true_track = state[10];
          if (lon === null || lat === null) return null;
          
          let category = Number(state[17]) || 0;

          if (state[0] === selectedAircraftIdRef.current) {
            // Update Popup and Route
            const callsign = state[1] ? state[1].trim() : '';
            if (callsign && (!selectedAircraftMetaRef.current || selectedAircraftMetaRef.current.callsign !== callsign)) {
              selectedAircraftMetaRef.current = { ...selectedAircraftMetaRef.current, callsign, icao24: state[0] };
              // Fetch route now that we have callsign
              fetch(`./api.php?action=opensky_route&callsign=${callsign}${token ? '&token=' + encodeURIComponent(token) : ''}`)
                .then(res => res.ok ? res.json() : null)
                .then(routeData => {
                  if (routeData && routeData.route) {
                    selectedAircraftMetaRef.current.route = routeData.route.join(' → ');
                  } else {
                    selectedAircraftMetaRef.current.route = t('Unknown Route');
                  }
                })
                .catch(() => {});
            }

            if (flightsLayer.is3DMode) {
              if (aircraftPopupRef.current) {
                aircraftPopupRef.current.remove();
                aircraftPopupRef.current = null;
              }
            } else {
              if (!aircraftPopupRef.current) {
                aircraftPopupRef.current = new maplibregl.Popup({ closeButton: false, closeOnClick: false, className: 'flight-popup' })
                  .setLngLat([lon, lat])
                  .addTo(map);
              } else {
                aircraftPopupRef.current.setLngLat([lon, lat]);
              }
              
              const meta = selectedAircraftMetaRef.current?.icao24 === state[0] ? selectedAircraftMetaRef.current : {};
              const flag = getFlagHtml(state[2]);
              const alt = state[7] !== null ? Math.round(state[7]) + 'm' : 'N/A';
              const spd = state[9] !== null ? Math.round(state[9] * 3.6) + 'km/h' : 'N/A';
              
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
              // Add custom style block to override Mapbox default popup padding and background
              const style = document.createElement('style');
              style.innerHTML = '.flight-popup .maplibregl-popup-content { padding: 0; background: transparent; box-shadow: none; } .flight-popup .maplibregl-popup-tip { border-top-color: #09090b; }';
              document.head.appendChild(style);
              
              aircraftPopupRef.current.setHTML(popupHtml);
            }
          }

          return {
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [lon, lat] },
            properties: {
              icao24: state[0],
              callsign: state[1] ? state[1].trim() : '',
              country: state[2],
              altitude: state[7],
              velocity: state[9],
              true_track: true_track || 0,
              category: category
            }
          };
        }).filter(Boolean);

        const geojson = { type: 'FeatureCollection', features };
        const sourceId = `dynamic-source-${flightsLayer.id}`;
        const source = map.getSource(sourceId) as maplibregl.GeoJSONSource;
        if (source) source.setData(geojson as GeoJSON.FeatureCollection);
        
        currentInterval = 10000; // Reset backoff on success
      } catch(err) {
        console.error('Error fetching flights:', err);
        currentInterval = Math.min(currentInterval * 1.5, 300000); // Exponential backoff up to 5 min
      } finally {
        if (isActive) {
          timeoutId = setTimeout(fetchFlights, currentInterval);
        }
      }
    };

    const onZoom = () => {
      if (updateDeckGLRef.current) updateDeckGLRef.current();
    };
    map.on('zoom', onZoom);

    fetchFlights();
    return () => {
      isActive = false;
      clearTimeout(timeoutId);
      map.off('zoom', onZoom);
    };
  }, [settings.layers, mapLoaded, isFlightsVisible]);


  // Fetch track when selectedAircraftId changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    
    const source = map.getSource('selected-flight-track') as maplibregl.GeoJSONSource;
    if (!source) return;

    selectedFlightTrackRef.current = [];
    source.setData({ type: 'FeatureCollection', features: [] });
    if (updateDeckGLRef.current) updateDeckGLRef.current();

    if (!selectedAircraftId) {
      if (aircraftPopupRef.current) {
        aircraftPopupRef.current.remove();
        aircraftPopupRef.current = null;
      }
      return;
    }

    const flightsLayer = settings.layers.find(l => l.type === 'flights');
    if (!flightsLayer || !flightsLayer.visible) return;

    const fetchTrack = async () => {
      try {
        let token = '';
        if (settings.openSkyCredentials?.clientId && settings.openSkyCredentials?.clientSecret) {
          if (!openSkyTokenRef.current || Date.now() > openSkyTokenRef.current.expires) {
            const tokenRes = await fetch('./api.php?action=opensky_token', {
              method: 'POST',
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
              body: `grant_type=client_credentials&client_id=${encodeURIComponent(settings.openSkyCredentials.clientId)}&client_secret=${encodeURIComponent(settings.openSkyCredentials.clientSecret)}`
            });
            if (tokenRes.ok) {
              const tokenData = await tokenRes.json();
              if (tokenData.access_token) {
                openSkyTokenRef.current = {
                  token: tokenData.access_token,
                  expires: Date.now() + (tokenData.expires_in - 30) * 1000
                };
              }
            }
          }
          if (openSkyTokenRef.current) token = openSkyTokenRef.current.token;
        }

        const url = `./api.php?action=opensky_track&icao24=${selectedAircraftId}&time=0${token ? '&token=' + encodeURIComponent(token) : ''}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error('Failed to fetch track');
        
        const data = await res.json();
        if (data && data.path && data.path.length > 0) {
          let coordinates = data.path.map((pt: any) => [pt[2], pt[1], pt[3] || 0, pt[0]]); // lon, lat, alt, time
          
          const hist = flightHistoryRef.current[selectedAircraftId];
          if (hist && hist.track.length > 0) {
              const oldestHistTime = hist.track[0][3];
              const validApiCoords = coordinates.filter((pt: any) => pt[3] < oldestHistTime);
              validApiCoords.push(...hist.track);
              coordinates = validApiCoords;
          }
          
          selectedFlightTrackRef.current = coordinates;
          source.setData({
            type: 'FeatureCollection',
            features: [{
              type: 'Feature',
              geometry: { type: 'LineString', coordinates },
              properties: {}
            }]
          });
          if (updateDeckGLRef.current) updateDeckGLRef.current();
        } else {
          selectedFlightTrackRef.current = [];
          source.setData({ type: 'FeatureCollection', features: [] });
        }
      } catch (err) {
        console.error('Error fetching track:', err);
        selectedFlightTrackRef.current = [];
        source.setData({ type: 'FeatureCollection', features: [] });
      }

      // Fetch Metadata
      try {
        let token = '';
        if (openSkyTokenRef.current) token = openSkyTokenRef.current.token;

        const metaRes = await fetch(`./api.php?action=opensky_metadata&icao24=${selectedAircraftId}${token ? '&token=' + encodeURIComponent(token) : ''}`);
        let metaData: any = null;
        if (metaRes.ok) metaData = await metaRes.json();
        
        selectedAircraftMetaRef.current = {
          ...selectedAircraftMetaRef.current,
          icao24: selectedAircraftId,
          registration: metaData?.registration || 'Unknown',
          type: metaData?.model || metaData?.manufacturerName || 'Unknown Type'
        };
      } catch (e) {
        console.error('Error fetching metadata:', e);
      }
    };

    fetchTrack();
  }, [selectedAircraftId, mapLoaded, settings.openSkyCredentials]);

  // Fetch geometry when selectedCycloneId changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    
    const source = map.getSource('selected-cyclone-geometry') as maplibregl.GeoJSONSource;
    if (!source) return;

    if (!selectedCycloneId) {
      source.setData({ type: 'FeatureCollection', features: [] });
      return;
    }

    const fetchGeometry = async () => {
      try {
        const cycloneLayer = settings.layers.find(l => l.type === 'gdacs_cyclones');
        if (!cycloneLayer || !cycloneLayer.visible) {
          source.setData({ type: 'FeatureCollection', features: [] });
          return;
        }

        const url = `https://www.gdacs.org/gdacsapi/api/polygons/getgeometry?eventtype=TC&eventid=${selectedCycloneId.id}&episodeid=${selectedCycloneId.ep}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error('Failed to fetch cyclone geometry');
        
        const data = await res.json();
        if (data && data.features) {
          setCycloneRawData(data);
          setCycloneTimelinePercent(100);
        } else {
          setCycloneRawData(null);
          source.setData({ type: 'FeatureCollection', features: [] });
        }
      } catch (err) {
        console.error('Error fetching cyclone geometry:', err);
        setCycloneRawData(null);
        source.setData({ type: 'FeatureCollection', features: [] });
      }
    };

    fetchGeometry();
  }, [selectedCycloneId, mapLoaded, settings.layers]);

  // Effect to process and render the cyclone track based on the timeline slider
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded || !selectedCycloneId || !cycloneRawData) return;
    
    const source = map.getSource('selected-cyclone-geometry') as maplibregl.GeoJSONSource;
    if (!source) return;

    try {
      // 1. Extract and combine all LineString segments into one continuous track
      const lineFeatures = cycloneRawData.features.filter((f: any) => f.geometry.type === 'LineString');
      
      const segments = lineFeatures.map((f: any) => f.geometry.coordinates);
      const allCoordinates: number[][] = [];
      
      if (segments.length > 0) {
        const isSamePoint = (p1: number[], p2: number[]) => Math.abs(p1[0] - p2[0]) < 0.01 && Math.abs(p1[1] - p2[1]) < 0.01;
        const stitched = [...segments[0]];
        const used = new Set([0]);
        
        let added = true;
        while(added) {
          added = false;
          for (let i = 1; i < segments.length; i++) {
            if (used.has(i)) continue;
            const seg = segments[i];
            
            // Check if seg connects to the end of stitched
            if (isSamePoint(stitched[stitched.length - 1], seg[0])) {
              stitched.push(...seg.slice(1));
              used.add(i);
              added = true;
            } 
            // Check if seg connects to the beginning of stitched
            else if (isSamePoint(stitched[0], seg[seg.length - 1])) {
              stitched.unshift(...seg.slice(0, -1));
              used.add(i);
              added = true;
            }
          }
        }

        // Unwrap longitudes for Mapbox to avoid drawing across the entire map at the date line
        let prevLon: number | null = null;
        stitched.forEach(coord => {
          let lon = coord[0];
          let lat = coord[1];
          if (prevLon !== null) {
            while (lon - prevLon > 180) lon -= 360;
            while (lon - prevLon < -180) lon += 360;
          }
          prevLon = lon;
          
          if (allCoordinates.length === 0) {
            allCoordinates.push([lon, lat]);
          } else {
            const last = allCoordinates[allCoordinates.length - 1];
            if (last[0] !== lon || last[1] !== lat) {
              allCoordinates.push([lon, lat]);
            }
          }
        });
      }

      if (allCoordinates.length < 2) {
        // Not enough data for a track, just render whatever we have
        source.setData(cycloneRawData);
        return;
      }

      const masterTrack = {
        type: 'Feature' as const,
        geometry: {
          type: 'LineString' as const,
          coordinates: allCoordinates
        },
        properties: lineFeatures[0]?.properties || {}
      };

      const trackLength = length(masterTrack, { units: 'kilometers' });
      const currentDistance = trackLength * (cycloneTimelinePercent / 100);

      // 2. Interpolate current point
      const currentPoint = along(masterTrack, currentDistance, { units: 'kilometers' });
      // Change its class to Point_Centroid so it matches the layer filter for rendering the circle
      currentPoint.properties = { ...masterTrack.properties, Class: 'Point_Centroid' };

      // 3. Slice the track from start to current point
      let currentTrack;
      if (cycloneTimelinePercent <= 0) {
        // At 0%, track is just a point or very short line, so don't render a track
        currentTrack = { ...masterTrack, geometry: { type: 'LineString', coordinates: [] } };
      } else if (cycloneTimelinePercent >= 100) {
        currentTrack = masterTrack;
      } else {
        const startPoint = { type: 'Feature', geometry: { type: 'Point', coordinates: allCoordinates[0] } };
        currentTrack = lineSlice(startPoint as any, currentPoint, masterTrack);
      }

      // Restore class for the track
      currentTrack.properties = { ...currentTrack.properties, Class: 'Line_Line_1' };

      // 4. Handle the Cone of Uncertainty
      const coneFeature = cycloneRawData.features.find((f: any) => f.properties?.Class === 'Poly_Cones');
      
      const featuresToRender: any[] = [currentPoint, currentTrack];
      if (coneFeature) {
        // We render the cone and adjust its opacity in paint properties dynamically,
        // but since we can't easily animate layer properties here without creating a new layer,
        // we'll inject a dynamic property into the GeoJSON feature!
        const coneOpacity = Math.max(0, (cycloneTimelinePercent - 80) / 20); // fade in from 80% to 100%
        coneFeature.properties = { ...coneFeature.properties, _dynamicOpacity: coneOpacity };
        featuresToRender.push(coneFeature);
      }

      source.setData({
        type: 'FeatureCollection',
        features: featuresToRender
      });
    } catch (e) {
      console.error('Error processing cyclone timeline:', e);
      source.setData(cycloneRawData);
    }
  }, [cycloneTimelinePercent, cycloneRawData, selectedCycloneId, mapLoaded]);

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

  // Fetch detailed CEMS activation when selectedCemsEarthquake changes

  // Fetch detailed CEMS activations for wildfires in the date range
  useEffect(() => {
    const wildfireLayer = settings.layers.find(l => l.type === 'wildfires');
    if (!wildfireLayer || !wildfireLayer.visible || !wildfireLayer.copernicusEnabled) {
      if (activeCemsWildfireFeatures) setActiveCemsWildfireFeatures(null);
      return;
    }

    let isSubscribed = true;
    const { effectiveStartDate, effectiveEndDate } = getEffectiveLayerDates(wildfireLayer);
    
    (async () => {
      try {
        if (!allCemsActivationsRef.current) {
          allCemsActivationsRef.current = fetch(`https://rapidmapping.emergency.copernicus.eu/backend/dashboard-api/public-activations-info/?limit=2000`)
            .then(res => {
              if (!res.ok) throw new Error('Failed to fetch CEMS activations');
              return res.json();
            })
            .then(data => data?.results || []);
        }
        
        let activations;
        try {
          // Await the promise (it might be already resolved, or currently fetching)
          activations = await allCemsActivationsRef.current;
          console.log('[CEMS Debug] Fetched global activations count:', activations?.length);
        } catch (err) {
          console.error('[CEMS Debug] Failed to fetch global activations:', err);
          allCemsActivationsRef.current = null; // reset on error
          return;
        }
        if (!activations) return;

        // Filter for Wildfires in date range
        const sDate = new Date(effectiveStartDate).getTime();
        const eDate = new Date(effectiveEndDate).getTime() + 24*60*60*1000 - 1; // End of day

        const matchingActivations = activations.filter((act: any) => {
          if (act.category !== 'Wildfire') return false;
          const actTime = new Date(act.eventTime || act.activationTime).getTime();
          // allow a small buffer, e.g., 7 days before and after
          const buffer = 7 * 24 * 60 * 60 * 1000;
          return actTime >= sDate - buffer && actTime <= eDate + buffer;
        });

        console.log(`[CEMS Debug] Matching wildfire activations in range (${new Date(sDate).toISOString()} to ${new Date(eDate).toISOString()}):`, matchingActivations.map((a: any) => a.code));

        if (matchingActivations.length === 0) {
          if (isSubscribed) setActiveCemsWildfireFeatures(null);
          return;
        }

        const fetchPromises = matchingActivations.map((act: any) => {
          if (!cemsFeatureCacheRef.current[act.code]) {
            cemsFeatureCacheRef.current[act.code] = (async () => {
              const res = await fetch(`https://rapidmapping.emergency.copernicus.eu/backend/dashboard-api/public-activations/?code=${act.code}`);
              if (!res.ok) throw new Error('Failed to fetch specific activation');
              const data = await res.json();
              
              const actFeatures: any[] = [];
              if (data && data.results && data.results.length > 0 && data.results[0].aois) {
                for (const aoi of data.results[0].aois) {
                  if (aoi.extent) {
                    const aoiGeom = parseWKT(aoi.extent);
                    if (aoiGeom) {
                      actFeatures.push({
                        type: 'Feature',
                        geometry: aoiGeom.geometry,
                        properties: { aoiName: aoi.aoiName, isExtent: true }
                      });
                    }
                  }
                  if (aoi.products) {
                    // Fetch VT layers concurrently as well
                    const vtPromises: Promise<any>[] = [];
                    const productsWithVt = aoi.products.filter((p: any) => p.layers && p.layers.some((l: any) => l.format === 'vt'));
                    const latestProduct = productsWithVt.length > 0 ? productsWithVt.sort((a: any, b: any) => (b.monitoringNumber || 0) - (a.monitoringNumber || 0))[0] : null;
                    const productsToProcess = latestProduct ? [latestProduct] : [];
                    for (const product of productsToProcess) {
                      if (product.layers) {
                        for (const layer of product.layers) {
                          if (layer.format === 'vt' && layer.json) {
                            vtPromises.push(safeFetchCemsJson(layer.json));
                          }
                        }
                      }
                    }
                    const vtResults = await Promise.all(vtPromises);
                    for (const vtFeatures of vtResults) {
                      actFeatures.push(...vtFeatures);
                    }
                  }
                }
              }
              return actFeatures;
            })();
          }

          return cemsFeatureCacheRef.current[act.code].catch((e: any) => {
            console.error('[CEMS Debug] Failed to fetch detailed CEMS activation', e);
            delete cemsFeatureCacheRef.current[act.code];
            return [];
          });
        });

        const allResults = await Promise.all(fetchPromises);
        const allFeatures = allResults.flat();
        console.log('[CEMS Debug] FLOOD FEATURES RESOLVED:', allFeatures.length);

        console.log(`[CEMS Debug] Total features to render:`, allFeatures.length);

        if (isSubscribed) {
          setActiveCemsWildfireFeatures({
            type: 'FeatureCollection',
            features: allFeatures
          });
        }
      } catch (err) {
        console.error('Error fetching CEMS wildfire data', err);
      }
    })();

    return () => { isSubscribed = false; };
  }, [settings.layers, settings.globalDateMode, settings.globalStartDate, settings.globalEndDate, getEffectiveLayerDates]);

  // Fetch detailed CEMS activations for floods in the date range
  useEffect(() => {
    const floodLayer = settings.layers.find(l => l.id === 'floods');
    if (!floodLayer || !floodLayer.visible || !floodLayer.copernicusEnabled) {
      if (activeCemsFloodFeatures) setActiveCemsFloodFeatures(null);
      // cemsFeatureCacheRef.current = {}; // Removed to prevent memory leaks from dangling promises
      return;
    }

    let isSubscribed = true;
    const { effectiveStartDate, effectiveEndDate } = getEffectiveLayerDates(floodLayer);
    
    (async () => {
      try {
        if (!allCemsActivationsRef.current) {
          allCemsActivationsRef.current = fetch(`https://rapidmapping.emergency.copernicus.eu/backend/dashboard-api/public-activations-info/?limit=2000`)
            .then(res => {
              if (!res.ok) throw new Error('Failed to fetch CEMS activations');
              return res.json();
            })
            .then(data => data?.results || []);
        }
        
        let activations;
        try {
          // Await the promise (it might be already resolved, or currently fetching)
          activations = await allCemsActivationsRef.current;
          console.log('[CEMS Debug] Fetched global activations count:', activations?.length);
        } catch (err) {
          console.error('[CEMS Debug] Failed to fetch global activations:', err);
          allCemsActivationsRef.current = null; // reset on error
          return;
        }
        if (!activations) return;

        // Filter for Floods in date range
        const sDate = new Date(effectiveStartDate).getTime();
        const eDate = new Date(effectiveEndDate).getTime() + 24*60*60*1000 - 1; // End of day

        const matchingActivations = activations.filter((act: any) => {
          if (act.category !== 'Flood') return false;
          const actTime = new Date(act.eventTime || act.activationTime).getTime();
          // allow a small buffer, e.g., 7 days before and after
          const buffer = 7 * 24 * 60 * 60 * 1000;
          return actTime >= sDate - buffer && actTime <= eDate + buffer;
        });

        console.log(`[CEMS Debug] Matching flood activations in range (${new Date(sDate).toISOString()} to ${new Date(eDate).toISOString()}):`, matchingActivations.map((a: any) => a.code));

        if (matchingActivations.length === 0) {
          if (isSubscribed) setActiveCemsFloodFeatures(null);
          return;
        }

        const fetchPromises = matchingActivations.map((act: any) => {
          if (!cemsFeatureCacheRef.current[act.code]) {
            cemsFeatureCacheRef.current[act.code] = (async () => {
              const res = await fetch(`https://rapidmapping.emergency.copernicus.eu/backend/dashboard-api/public-activations/?code=${act.code}`);
              if (!res.ok) throw new Error('Failed to fetch specific activation');
              const data = await res.json();
              
              const actFeatures: any[] = [];
              if (data && data.results && data.results.length > 0 && data.results[0].aois) {
                for (const aoi of data.results[0].aois) {
                  if (aoi.extent) {
                    const aoiGeom = parseWKT(aoi.extent);
                    if (aoiGeom) {
                      actFeatures.push({
                        type: 'Feature',
                        geometry: aoiGeom.geometry,
                        properties: { aoiName: aoi.aoiName, isExtent: true }
                      });
                    }
                  }
                  if (aoi.products) {
                    // Fetch VT layers concurrently as well
                    const vtPromises: Promise<any>[] = [];
                    const productsWithVt = aoi.products.filter((p: any) => p.layers && p.layers.some((l: any) => l.format === 'vt'));
                    const latestProduct = productsWithVt.length > 0 ? productsWithVt.sort((a: any, b: any) => (b.monitoringNumber || 0) - (a.monitoringNumber || 0))[0] : null;
                    const productsToProcess = latestProduct ? [latestProduct] : [];
                    for (const product of productsToProcess) {
                      if (product.layers) {
                        for (const layer of product.layers) {
                          if (layer.format === 'vt' && layer.json) {
                            vtPromises.push(safeFetchCemsJson(layer.json));
                          }
                        }
                      }
                    }
                    const vtResults = await Promise.all(vtPromises);
                    for (const vtFeatures of vtResults) {
                      actFeatures.push(...vtFeatures);
                    }
                  }
                }
              }
              return actFeatures;
            })();
          }

          return cemsFeatureCacheRef.current[act.code].catch((e: any) => {
            console.error('[CEMS Debug] Failed to fetch detailed CEMS activation', e);
            delete cemsFeatureCacheRef.current[act.code];
            return [];
          });
        });

        const allResults = await Promise.all(fetchPromises);
        const allFeatures = allResults.flat();
        console.log('[CEMS Debug] FLOOD FEATURES RESOLVED:', allFeatures.length);

        if (isSubscribed) {
          setActiveCemsFloodFeatures({
            type: 'FeatureCollection',
            features: allFeatures
          });
        }
      } catch (err) {
        console.error('Error fetching CEMS flood data', err);
      }
    })();

    return () => { isSubscribed = false; };
  }, [settings.layers, settings.globalDateMode, settings.globalStartDate, settings.globalEndDate, getEffectiveLayerDates]);

  // Fetch shakemap when selectedEarthquake changes

  // Update earthquake labels filter
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    
    settings.layers.forEach(layer => {
      if (layer.type === 'gdacs_earthquakes' || layer.type === 'cems_rapid_mapping') {
        const baseLayerId = `dynamic-layer-${layer.id}`;
        const labelLayerId = `${baseLayerId}-label`;
        
        if (map.getLayer(baseLayerId)) {
          if (selectedEarthquake && layer.type === 'gdacs_earthquakes') {
             map.setFilter(baseLayerId, ['!=', ['to-string', ['get', 'eventid']], selectedEarthquake.id]);
             if (map.getLayer(labelLayerId)) {
               map.setFilter(labelLayerId, ['!=', ['to-string', ['get', 'eventid']], selectedEarthquake.id]);
             }
          } else if (selectedCemsEarthquake && layer.type === 'cems_rapid_mapping') {
             map.setFilter(baseLayerId, ['!=', ['to-string', ['get', 'code']], selectedCemsEarthquake.code]);
             if (map.getLayer(labelLayerId)) {
               map.setFilter(labelLayerId, ['!=', ['to-string', ['get', 'code']], selectedCemsEarthquake.code]);
             }
          } else {
             map.setFilter(baseLayerId, null);
             if (map.getLayer(labelLayerId)) map.setFilter(labelLayerId, null);
          }
        }
      }
    });
  }, [selectedEarthquake, selectedCemsEarthquake, mapLoaded, settings.layers]);

  // Update cyclone point filter to hide selected cyclone point
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    
    settings.layers.forEach(layer => {
      if (layer.type === 'gdacs_cyclones') {
        const layerId = `dynamic-layer-${layer.id}`;
        if (map.getLayer(layerId)) {
          if (selectedCycloneId) {
            map.setFilter(layerId, ['!=', ['to-string', ['get', 'eventid']], selectedCycloneId.id]);
          } else {
            map.setFilter(layerId, null);
          }
        }
      }
    });
  }, [selectedCycloneId, mapLoaded, settings.layers]);

  // Render selected earthquake DOM label
  useEffect(() => {
    const map = mapRef.current;
    if (activeDrawMarkersRef.current['selected-eq-label']) {
      activeDrawMarkersRef.current['selected-eq-label'].remove();
      delete activeDrawMarkersRef.current['selected-eq-label'];
    }
    if (selectionMarkersRef.current['selected-eq-label']) {
      selectionMarkersRef.current['selected-eq-label'].remove();
      delete selectionMarkersRef.current['selected-eq-label'];
    }
    
    if (!map || !mapLoaded || !selectedEarthquake) {
      return;
    }

    const { coordinates, properties } = selectedEarthquake;
    const alertLevel = properties.alertlevel;
    const bgColor = alertLevel === 'Red' ? '#ef4444' : alertLevel === 'Orange' ? '#f97316' : alertLevel === 'Green' ? '#22c55e' : '#6b7280';
    
    const fromDate = properties.fromdate || '';
    let dateStr = '';
    if (fromDate.length >= 10) {
       dateStr = `${fromDate.substring(8, 10)}.${fromDate.substring(5, 7)}.${fromDate.substring(0, 4)}`;
    }

    const el = document.createElement('div');
    el.className = 'flex flex-col items-center justify-center pointer-events-none shakemap-marker-dot';
    el.style.backgroundColor = bgColor;
    el.style.color = '#ffffff';
    el.style.padding = '4px 8px';
    el.style.fontFamily = 'Gotham Bold, Arial Unicode MS Regular, sans-serif';
    el.style.fontSize = '12px';
    el.style.fontWeight = 'bold';
    el.style.lineHeight = '1.2';
    el.style.textAlign = 'center';
    el.style.whiteSpace = 'nowrap';
    el.style.zIndex = '50';
    
    el.innerHTML = `<div>${dateStr}</div>`;

    const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
      .setLngLat(coordinates)
      .addTo(map);

    selectionMarkersRef.current['selected-eq-label'] = marker;

    return () => {
      if (selectionMarkersRef.current['selected-eq-label']) {
        selectionMarkersRef.current['selected-eq-label'].remove();
        delete selectionMarkersRef.current['selected-eq-label'];
      }
    };
  }, [selectedEarthquake, mapLoaded]);



  // Render selected earthquake shakemap
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    if (!map.getSource('selected-earthquake-shakemap-source')) {
      map.addSource('selected-earthquake-shakemap-source', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
      });
      
      const eqLayer = settings.layers.find(l => l.type === 'gdacs_earthquakes');
      let beforeId = 'custom-polygons';
      const firstSymbolId = map.getStyle().layers?.find(l => l.type === 'symbol')?.id;
      if (firstSymbolId) {
        beforeId = firstSymbolId;
      } else if (eqLayer && map.getLayer(`dynamic-layer-${eqLayer.id}`)) {
        beforeId = `dynamic-layer-${eqLayer.id}`;
      }

      map.addLayer({
        id: 'selected-earthquake-shakemap-fill',
        type: 'fill',
        source: 'selected-earthquake-shakemap-source',
        paint: {
          'fill-color': ['coalesce', ['get', 'fill'], '#ff9900'],
          'fill-opacity': 0.3
        }
      }, beforeId);

      map.addLayer({
        id: 'selected-earthquake-shakemap-line',
        type: 'line',
        source: 'selected-earthquake-shakemap-source',
        paint: {
          'line-color': ['coalesce', ['get', 'stroke'], '#ff0000'],
          'line-width': 1,
          'line-opacity': 0.8
        }
      }, beforeId);
    }

    const source = map.getSource('selected-earthquake-shakemap-source') as maplibregl.GeoJSONSource;
    if (source) {
      source.setData(selectedEarthquakeShakemap || { type: 'FeatureCollection', features: [] });
    }

    const eqLayer = settings.layers.find(l => l.type === 'gdacs_earthquakes');
    if (eqLayer) {
      const useColor = eqLayer.colorCodeShakemap !== false;
      const colorExpr = useColor 
        ? [
            'step',
            ['to-number', ['get', 'intensity'], 0],
            '#ffffff',
            2, '#bfccff',
            4, '#a0e6ff',
            5, '#80ffff',
            6, '#7aff93',
            7, '#ffff00',
            8, '#ffc800',
            9, '#ff9100',
            10, '#ff0000'
          ]
        : null; // null means we'll handle fallback separately
        
      const shakemapVisibility = eqLayer.shakemapEnabled !== false ? 'visible' : 'none';
      if (map.getLayer('selected-earthquake-shakemap-fill')) {
        map.setLayoutProperty('selected-earthquake-shakemap-fill', 'visibility', shakemapVisibility);
        map.setPaintProperty('selected-earthquake-shakemap-fill', 'fill-color', colorExpr || ['coalesce', ['get', 'fill'], '#ff9900']);
        map.setPaintProperty('selected-earthquake-shakemap-fill', 'fill-opacity', (eqLayer.shakemapOpacity ?? 1.0) * 0.3); // base is 0.3
      }
      
      if (map.getLayer('selected-earthquake-shakemap-line')) {
        map.setLayoutProperty('selected-earthquake-shakemap-line', 'visibility', shakemapVisibility);
        map.setPaintProperty('selected-earthquake-shakemap-line', 'line-color', colorExpr || ['coalesce', ['get', 'stroke'], '#ff0000']);
        map.setPaintProperty('selected-earthquake-shakemap-line', 'line-opacity', (eqLayer.shakemapOpacity ?? 1.0) * 0.8); // base is 0.8
      }
    }
  }, [selectedEarthquakeShakemap, mapLoaded, settings.layers]);

  // Render selected CEMS earthquake VT layers
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    if (!map.getSource('selected-cems-vt-source')) {
      map.addSource('selected-cems-vt-source', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
      });

      const cemsLayer = settings.layers.find(l => l.type === 'cems_rapid_mapping');
      const beforeId = (cemsLayer && map.getLayer(`dynamic-layer-${cemsLayer.id}`)) ? `dynamic-layer-${cemsLayer.id}` : 'custom-polygons';

      map.addLayer({
        id: 'selected-cems-vt-extent',
        type: 'line',
        source: 'selected-cems-vt-source',
        filter: ['==', 'isExtent', true],
        paint: {
          'line-color': '#ffff00',
          'line-width': 2,
          'line-dasharray': [2, 2]
        }
      }, beforeId);

      map.addLayer({
        id: 'selected-cems-vt-polygons',
        type: 'fill',
        source: 'selected-cems-vt-source',
        filter: ['all', 
          ['!=', 'isExtent', true], 
          ['==', '$type', 'Polygon'],
          ['any',
            ['==', 'damage_gra', 'Destroyed'],
            ['==', 'damage_gra', 'Damaged'],
            ['==', 'damage_gra', 'Possibly damaged']
          ]
        ],
        paint: {
          'fill-color': [
            'match',
            ['get', 'damage_gra'],
            'Destroyed', '#ff0000',
            'Damaged', '#ff9900',
            'Possibly damaged', '#ffff00',
            'No visible damage', '#888888',
            '#888888'
          ],
          'fill-opacity': [
            'match',
            ['get', 'damage_gra'],
            'Destroyed', 0.6,
            'Damaged', 0.6,
            'Possibly damaged', 0.6,
            'No visible damage', 0.6,
            0.25
          ]
        }
      }, beforeId);

      map.addLayer({
        id: 'selected-cems-vt-lines',
        type: 'line',
        source: 'selected-cems-vt-source',
        filter: ['all', 
          ['!=', 'isExtent', true], 
          ['==', '$type', 'LineString'],
          ['any',
            ['==', 'damage_gra', 'Destroyed'],
            ['==', 'damage_gra', 'Damaged'],
            ['==', 'damage_gra', 'Possibly damaged']
          ]
        ],
        paint: {
          'line-color': [
            'match',
            ['get', 'damage_gra'],
            'Destroyed', '#ff0000',
            'Damaged', '#ff9900',
            'Possibly damaged', '#ffff00',
            'No visible damage', '#888888',
            '#888888'
          ],
          'line-width': 3,
          'line-opacity': [
            'match',
            ['get', 'damage_gra'],
            'Destroyed', 1,
            'Damaged', 1,
            'Possibly damaged', 1,
            'No visible damage', 1,
            0.25
          ]
        }
      }, beforeId);

      map.addLayer({
        id: 'selected-cems-vt-points',
        type: 'circle',
        source: 'selected-cems-vt-source',
        filter: ['all', 
          ['!=', 'isExtent', true], 
          ['==', '$type', 'Point'],
          ['any',
            ['==', 'damage_gra', 'Destroyed'],
            ['==', 'damage_gra', 'Damaged'],
            ['==', 'damage_gra', 'Possibly damaged']
          ]
        ],
        paint: {
          'circle-radius': 4,
          'circle-color': [
            'match',
            ['get', 'damage_gra'],
            'Destroyed', '#ff0000',
            'Damaged', '#ff9900',
            'Possibly damaged', '#ffff00',
            'No visible damage', '#888888',
            '#888888'
          ],
          'circle-opacity': [
            'match',
            ['get', 'damage_gra'],
            'Destroyed', 1,
            'Damaged', 1,
            'Possibly damaged', 1,
            'No visible damage', 1,
            0.25
          ],
          'circle-stroke-width': 0
        }
      }, beforeId);
    }

    const source = map.getSource('selected-cems-vt-source') as maplibregl.GeoJSONSource;
    if (source) {
      source.setData(selectedCemsEarthquakeFeatures || { type: 'FeatureCollection', features: [] });
    }

    const eqLayer = settings.layers.find(l => l.type === 'gdacs_earthquakes');
    const isEqCemsEnabled = !!eqLayer?.copernicusEnabled;
    const isCemsEnabled = selectedEarthquake ? isEqCemsEnabled : isEqCemsEnabled;
    const cemsVisibility = isCemsEnabled ? 'visible' : 'none';
    const cemsOpacity = selectedEarthquake ? (eqLayer?.copernicusOpacity ?? 1.0) : 1.0;
    
    if (map.getLayer('selected-cems-vt-extent')) {
      map.setLayoutProperty('selected-cems-vt-extent', 'visibility', cemsVisibility);
      map.setPaintProperty('selected-cems-vt-extent', 'line-opacity', cemsOpacity);
    }
    if (map.getLayer('selected-cems-vt-polygons')) {
      map.setLayoutProperty('selected-cems-vt-polygons', 'visibility', cemsVisibility);
      map.setPaintProperty('selected-cems-vt-polygons', 'fill-opacity', [
        'match',
        ['get', 'damage_gra'],
        'Destroyed', 0.6 * cemsOpacity,
        'Damaged', 0.6 * cemsOpacity,
        'Possibly damaged', 0.6 * cemsOpacity,
        'No visible damage', 0.6 * cemsOpacity,
        0.25 * cemsOpacity
      ]);
    }
    if (map.getLayer('selected-cems-vt-lines')) {
      map.setLayoutProperty('selected-cems-vt-lines', 'visibility', cemsVisibility);
      map.setPaintProperty('selected-cems-vt-lines', 'line-opacity', [
        'match',
        ['get', 'damage_gra'],
        'Destroyed', 1 * cemsOpacity,
        'Damaged', 1 * cemsOpacity,
        'Possibly damaged', 1 * cemsOpacity,
        'No visible damage', 1 * cemsOpacity,
        0.25 * cemsOpacity
      ]);
    }
    if (map.getLayer('selected-cems-vt-points')) {
      map.setLayoutProperty('selected-cems-vt-points', 'visibility', cemsVisibility);
      map.setPaintProperty('selected-cems-vt-points', 'circle-opacity', cemsOpacity);
      map.setPaintProperty('selected-cems-vt-points', 'circle-stroke-opacity', cemsOpacity);
    }

  }, [selectedCemsEarthquakeFeatures, mapLoaded, settings.layers]);

  // Render CEMS Wildfire Features
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    let beforeId = 'custom-polygons';
    const style = map.getStyle();
    if (style && style.layers) {
      for (const l of style.layers) {
        if (l.id.includes('admin') || l.id.includes('border') || l.type === 'symbol') {
          beforeId = l.id;
          break;
        }
      }
    }

    if (!map.getSource('active-wildfire-cems-vt-source')) {
      map.addSource('active-wildfire-cems-vt-source', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
      });

      // Add Extent Layer
      map.addLayer({
        id: 'active-wildfire-cems-vt-extent',
        type: 'line',
        source: 'active-wildfire-cems-vt-source',
        filter: ['==', 'isExtent', true],
        layout: {
          'line-join': 'round',
          'line-cap': 'round'
        },
        paint: {
          'line-color': '#ff9900',
          'line-width': 2,
          'line-dasharray': [2, 2]
        }
      }, beforeId);

      // Add Polygons
      map.addLayer({
        id: 'active-wildfire-cems-vt-polygons',
        type: 'fill',
        source: 'active-wildfire-cems-vt-source',
        filter: ['all', ['==', '$type', 'Polygon'], ['!=', 'isExtent', true]],
        paint: {
          'fill-color': [
            'match',
            ['coalesce', ['get', 'damage_gra'], 'none'],
            'Destroyed', '#ff0000',
            'Damaged', '#ff9900',
            'Possibly damaged', '#ffff00',
            'No visible damage', '#888888',
            '#ff0000'
          ]
        }
      }, beforeId);

      // Add Lines
      map.addLayer({
        id: 'active-wildfire-cems-vt-lines',
        type: 'line',
        source: 'active-wildfire-cems-vt-source',
        filter: ['all', 
          ['!=', 'isExtent', true], 
          ['==', '$type', 'LineString'],
          ['any',
            ['==', 'damage_gra', 'Destroyed'],
            ['==', 'damage_gra', 'Damaged'],
            ['==', 'damage_gra', 'Possibly damaged']
          ]
        ],
        paint: {
          'line-color': [
            'match',
            ['get', 'damage_gra'],
            'Destroyed', '#ff0000',
            'Damaged', '#ff9900',
            'Possibly damaged', '#ffff00',
            'No visible damage', '#888888',
            '#888888'
          ],
          'line-width': 3
        }
      }, beforeId);

      // Add Points
      map.addLayer({
        id: 'active-wildfire-cems-vt-points',
        type: 'circle',
        source: 'active-wildfire-cems-vt-source',
        filter: ['all', 
          ['!=', 'isExtent', true], 
          ['==', '$type', 'Point'],
          ['any',
            ['==', 'damage_gra', 'Destroyed'],
            ['==', 'damage_gra', 'Damaged'],
            ['==', 'damage_gra', 'Possibly damaged']
          ]
        ],
        paint: {
          'circle-color': [
            'match',
            ['get', 'damage_gra'],
            'Destroyed', '#ff0000',
            'Damaged', '#ff9900',
            'Possibly damaged', '#ffff00',
            'No visible damage', '#888888',
            '#888888'
          ],
          'circle-radius': 4
        }
      }, beforeId);
    }

    const wfLayer = settings.layers.find(l => l.type === 'wildfires');
    const isCemsEnabled = !!wfLayer?.copernicusEnabled && !!activeCemsWildfireFeatures;
    const cemsVisibility = isCemsEnabled ? 'visible' : 'none';
    const cemsOpacity = wfLayer?.copernicusOpacity ?? 1.0;
    
    if (map.getLayer('active-wildfire-cems-vt-extent')) {
      map.setLayoutProperty('active-wildfire-cems-vt-extent', 'visibility', cemsVisibility);
      map.setPaintProperty('active-wildfire-cems-vt-extent', 'line-opacity', cemsOpacity);
    }
    if (map.getLayer('active-wildfire-cems-vt-polygons')) {
      map.setLayoutProperty('active-wildfire-cems-vt-polygons', 'visibility', cemsVisibility);
      map.setPaintProperty('active-wildfire-cems-vt-polygons', 'fill-opacity', [
        'case',
        ['==', ['coalesce', ['get', 'obj_type'], ''], 'Not Analysed'], 0,
        ['match',
          ['coalesce', ['get', 'damage_gra'], 'none'],
          'Destroyed', 0.6 * cemsOpacity,
          'Damaged', 0.6 * cemsOpacity,
          'Possibly damaged', 0.6 * cemsOpacity,
          'No visible damage', 0.6 * cemsOpacity,
          0.6 * cemsOpacity
        ]
      ]);
    }
    if (map.getLayer('active-wildfire-cems-vt-lines')) {
      map.setLayoutProperty('active-wildfire-cems-vt-lines', 'visibility', cemsVisibility);
      map.setPaintProperty('active-wildfire-cems-vt-lines', 'line-opacity', [
        'match',
        ['get', 'damage_gra'],
        'Destroyed', cemsOpacity,
        'Damaged', cemsOpacity,
        'Possibly damaged', cemsOpacity,
        'No visible damage', cemsOpacity,
        0.25 * cemsOpacity
      ]);
    }
    if (map.getLayer('active-wildfire-cems-vt-points')) {
      map.setLayoutProperty('active-wildfire-cems-vt-points', 'visibility', cemsVisibility);
      map.setPaintProperty('active-wildfire-cems-vt-points', 'circle-opacity', [
        'match',
        ['get', 'damage_gra'],
        'Destroyed', cemsOpacity,
        'Damaged', cemsOpacity,
        'Possibly damaged', cemsOpacity,
        'No visible damage', cemsOpacity,
        0.25 * cemsOpacity
      ]);
    }

  }, [activeCemsWildfireFeatures, mapLoaded, settings.layers]);


  // Heavy setData operation isolated to prevent memory leaks on settings save
  useEffect(() => {
    if (!mapLoaded || !mapRef.current) return;
    const source = mapRef.current.getSource('active-wildfire-cems-vt-source') as maplibregl.GeoJSONSource;
    if (source) {
      source.setData(activeCemsWildfireFeatures || { type: 'FeatureCollection', features: [] });
    }
  }, [activeCemsWildfireFeatures, mapLoaded]);

  // Heavy setData operation isolated to prevent memory leaks on settings save
  useEffect(() => {
    if (!mapLoaded || !mapRef.current) return;
    const source = mapRef.current.getSource('active-flood-cems-vt-source') as maplibregl.GeoJSONSource;
    if (source) {
      source.setData(activeCemsFloodFeatures || { type: 'FeatureCollection', features: [] });
    }
  }, [activeCemsFloodFeatures, mapLoaded]);

  // Flood CEMS VT rendering
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    let beforeId: string | undefined;
    const style = map.getStyle();
    if (style && style.layers) {
      for (const l of style.layers) {
        if (l.id.includes('admin') || l.id.includes('border') || l.type === 'symbol') {
          beforeId = l.id;
          break;
        }
      }
    }

    if (!map.getSource('active-flood-cems-vt-source')) {
      map.addSource('active-flood-cems-vt-source', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
        tolerance: 0.5 // Reduce geometry complexity to save Web Worker RAM
      });

      // Add Extent Layer
      map.addLayer({
        id: 'active-flood-cems-vt-extent',
        type: 'line',
        source: 'active-flood-cems-vt-source',
        filter: ['==', 'isExtent', true],
        layout: {
          'line-join': 'round',
          'line-cap': 'round'
        },
        paint: {
          'line-color': '#3366ff',
          'line-width': 2,
          'line-dasharray': [2, 2]
        }
      }, beforeId);

      // Add Polygons
      map.addLayer({
        id: 'active-flood-cems-vt-polygons',
        type: 'fill',
        source: 'active-flood-cems-vt-source',
        filter: ['all', ['==', '$type', 'Polygon'], ['!=', 'isExtent', true]],
        paint: {
          'fill-color': [
            'match',
            ['coalesce', ['get', 'damage_gra'], 'none'],
            'Destroyed', '#ff0000',
            'Damaged', '#ff8c00',
            'Possibly damaged', '#ffff00',
            'No visible damage', '#888888',
            '#0000ff'
          ]
        }
      }, beforeId);

      // Add Lines
      map.addLayer({
        id: 'active-flood-cems-vt-lines',
        type: 'line',
        source: 'active-flood-cems-vt-source',
        filter: ['all', 
          ['!=', 'isExtent', true], 
          ['==', '$type', 'LineString'],
          ['any',
            ['==', 'damage_gra', 'Destroyed'],
            ['==', 'damage_gra', 'Damaged'],
            ['==', 'damage_gra', 'Possibly damaged']
          ]
        ],
        paint: {
          'line-color': [
            'match',
            ['get', 'damage_gra'],
            'Destroyed', '#ff0000',
            'Damaged', '#ff8c00',
            'Possibly damaged', '#ffff00',
            'No visible damage', '#888888',
            '#888888'
          ],
          'line-width': 3
        }
      }, beforeId);

      // Add Points
      map.addLayer({
        id: 'active-flood-cems-vt-points',
        type: 'circle',
        source: 'active-flood-cems-vt-source',
        filter: ['all', 
          ['!=', 'isExtent', true], 
          ['==', '$type', 'Point'],
          ['any',
            ['==', 'damage_gra', 'Destroyed'],
            ['==', 'damage_gra', 'Damaged'],
            ['==', 'damage_gra', 'Possibly damaged']
          ]
        ],
        paint: {
          'circle-color': [
            'match',
            ['get', 'damage_gra'],
            'Destroyed', '#ff0000',
            'Damaged', '#ff8c00',
            'Possibly damaged', '#ffff00',
            'No visible damage', '#888888',
            '#888888'
          ],
          'circle-radius': 4
        }
      }, beforeId);
    }

    const floodLayer = settings.layers.find(l => l.id === 'floods');
    const isCemsEnabled = !!floodLayer?.copernicusEnabled && !!activeCemsFloodFeatures;
    const cemsVisibility = isCemsEnabled ? 'visible' : 'none';
    const cemsOpacity = floodLayer?.copernicusOpacity ?? 1.0;
    
    if (map.getLayer('active-flood-cems-vt-extent')) {
      map.setLayoutProperty('active-flood-cems-vt-extent', 'visibility', cemsVisibility);
      map.setPaintProperty('active-flood-cems-vt-extent', 'line-opacity', cemsOpacity);
    }
    if (map.getLayer('active-flood-cems-vt-polygons')) {
      map.setLayoutProperty('active-flood-cems-vt-polygons', 'visibility', cemsVisibility);
      map.setPaintProperty('active-flood-cems-vt-polygons', 'fill-opacity', [
        'case',
        ['==', ['coalesce', ['get', 'obj_type'], ''], 'Not Analysed'], 0,
        ['match',
          ['coalesce', ['get', 'damage_gra'], 'none'],
          'Destroyed', 0.6 * cemsOpacity,
          'Damaged', 0.6 * cemsOpacity,
          'Possibly damaged', 0.6 * cemsOpacity,
          'No visible damage', 0.6 * cemsOpacity,
          0.6 * cemsOpacity
        ]
      ]);
    }
    if (map.getLayer('active-flood-cems-vt-lines')) {
      map.setLayoutProperty('active-flood-cems-vt-lines', 'visibility', cemsVisibility);
      map.setPaintProperty('active-flood-cems-vt-lines', 'line-opacity', [
        'match',
        ['get', 'damage_gra'],
        'Destroyed', cemsOpacity,
        'Damaged', cemsOpacity,
        'Possibly damaged', cemsOpacity,
        'No visible damage', cemsOpacity,
        0.25 * cemsOpacity
      ]);
    }
    if (map.getLayer('active-flood-cems-vt-points')) {
      map.setLayoutProperty('active-flood-cems-vt-points', 'visibility', cemsVisibility);
      map.setPaintProperty('active-flood-cems-vt-points', 'circle-opacity', [
        'match',
        ['get', 'damage_gra'],
        'Destroyed', cemsOpacity,
        'Damaged', cemsOpacity,
        'Possibly damaged', cemsOpacity,
        'No visible damage', cemsOpacity,
        0.25 * cemsOpacity
      ]);
    }

  }, [activeCemsFloodFeatures, mapLoaded, settings.layers]);

  // Render selected volcano DOM label
  useEffect(() => {
    const map = mapRef.current;
    if (selectionMarkersRef.current['selected-volcano-label']) {
      selectionMarkersRef.current['selected-volcano-label'].remove();
      delete selectionMarkersRef.current['selected-volcano-label'];
    }

    if (!map || !mapLoaded || !selectedVolcano) {
      return;
    }

    const { coordinates, properties } = selectedVolcano;
    const alertLevel = properties.alertlevel;
    const bgColor = alertLevel === 'Red' ? '#ff0000' : alertLevel === 'Orange' ? '#ff9900' : alertLevel === 'Green' ? '#00ff00' : '#6b7280';
    
    const eventName = properties.eventname || properties.name || 'Volcano';
    const fromDate = properties.fromdate || '';
    let dateStr = '';
    if (fromDate.length >= 10) {
       dateStr = `${fromDate.substring(8, 10)}.${fromDate.substring(5, 7)}.${fromDate.substring(0, 4)}`;
    }

    const el = document.createElement('div');
    el.className = 'flex flex-col items-center justify-center pointer-events-none';
    el.style.backgroundColor = bgColor;
    el.style.color = '#ffffff';
    el.style.padding = '4px 8px';
    el.style.fontFamily = 'Gotham Bold, Arial Unicode MS Regular, sans-serif';
    el.style.fontSize = '12px';
    el.style.fontWeight = 'bold';
    el.style.lineHeight = '1.2';
    el.style.textAlign = 'center';
    el.style.whiteSpace = 'nowrap';
    el.style.zIndex = '50';
    
    el.innerHTML = `
      <div>${eventName}</div>
      ${dateStr ? `<div>${dateStr}</div>` : ''}
    `;

    if (selectionMarkersRef.current['selected-volcano-label']) {
      selectionMarkersRef.current['selected-volcano-label'].remove();
    }
    
    const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
      .setLngLat(coordinates)
      .addTo(map);

    selectionMarkersRef.current['selected-volcano-label'] = marker;

    return () => {
      if (selectionMarkersRef.current['selected-volcano-label']) {
        selectionMarkersRef.current['selected-volcano-label'].remove();
        delete selectionMarkersRef.current['selected-volcano-label'];
      }
    };
  }, [selectedVolcano, mapLoaded]);

  // Render selected volcano danger zone polygon
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    if (!map.getSource('selected-volcano-polygon-source')) {
      map.addSource('selected-volcano-polygon-source', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
      });
      
      const volLayer = settings.layers.find(l => l.type === 'gdacs_volcanoes');
      const beforeId = (volLayer && map.getLayer(`dynamic-layer-${volLayer.id}`)) ? `dynamic-layer-${volLayer.id}` : 'custom-polygons';

      map.addLayer({
        id: 'selected-volcano-polygon-fill',
        type: 'fill',
        source: 'selected-volcano-polygon-source',
        paint: {
          'fill-color': ['coalesce', ['get', 'fillColor'], '#ff0000'],
          'fill-opacity': 0.3
        }
      }, beforeId);

      map.addLayer({
        id: 'selected-volcano-polygon-line',
        type: 'line',
        source: 'selected-volcano-polygon-source',
        paint: {
          'line-color': ['coalesce', ['get', 'color'], '#ff0000'],
          'line-width': 1,
          'line-opacity': 0.8
        }
      }, beforeId);
    }

    const source = map.getSource('selected-volcano-polygon-source') as maplibregl.GeoJSONSource;
    if (source) {
      source.setData(selectedVolcanoPolygon || { type: 'FeatureCollection', features: [] });
    }
  }, [selectedVolcanoPolygon, mapLoaded, settings.layers]);

  // Dynamically update clip polygons to match screen-space of highlight DOM labels
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    const highlights = annotations.filter(a => a.type === 'highlight' && a.text && a.coordinates);

    const updateClipMasks = () => {
      const source = map.getSource('highlight-clip-source') as maplibregl.GeoJSONSource;
      if (!source) return;

      if (highlights.length === 0) {
        source.setData({ type: 'FeatureCollection', features: [] });
        return;
      }

      const features: GeoJSON.Feature[] = highlights.map(ann => {
        try {
          const pt = map.project(ann.coordinates);
          // Estimate the bounding box in pixels. 
          // 14px uppercase font (approx 8.5px per char) + 20px padding
          const width = (ann.text!.length * 8.5) + 20;
          const height = 30; // 14px + padding top/bottom
          
          const hw = width / 2;
          const hh = height / 2;

          const tl = map.unproject([pt.x - hw, pt.y - hh]);
          const tr = map.unproject([pt.x + hw, pt.y - hh]);
          const br = map.unproject([pt.x + hw, pt.y + hh]);
          const bl = map.unproject([pt.x - hw, pt.y + hh]);

          if (!tl || !tr || !br || !bl) return null;

          return {
            type: 'Feature',
            geometry: {
              type: 'Polygon',
              coordinates: [[
                [tl.lng, tl.lat],
                [tr.lng, tr.lat],
                [br.lng, br.lat],
                [bl.lng, bl.lat],
                [tl.lng, tl.lat]
              ]]
            },
            properties: {}
          };
        } catch (e) {
          return null;
        }
      }).filter(Boolean) as GeoJSON.Feature[];

      source.setData({ type: 'FeatureCollection', features });
    };

    // Update immediately and when the map moves/zooms
    updateClipMasks();
    map.on('move', updateClipMasks);

    return () => {
      map.off('move', updateClipMasks);
    };
  }, [annotations, mapLoaded]);

  // Handle flyTo from label click
  useEffect(() => {
    const handleFlyToLabel = ((e: CustomEvent<string>) => {
      if (activeTool !== 'none' || !mapRef.current) return;
      const annId = e.detail;
      const ann = annotations.find(a => a.id === annId);
      if (ann && ann.view) {
        mapRef.current.flyTo({
          center: ann.view.center,
          zoom: ann.view.zoom,
          pitch: ann.view.pitch,
          bearing: ann.view.bearing
        });
      }
    }) as EventListener;
    window.addEventListener('flyToLabel', handleFlyToLabel);
    return () => window.removeEventListener('flyToLabel', handleFlyToLabel);
  }, [activeTool, annotations]);

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
      l.type === 'weather_forecast' || 
      l.type === 'gdacs_earthquakes' || 
      l.type === 'gdacs_volcanoes' || 
      l.type === 'gdacs_cyclones' || 
      l.type === 'wildfires' || 
      l.type === 'deepstate'
    )
  );

  // 3D Terrain & Environment
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;


    if (settings.enable3dTerrain) {
      if (!map.getSource('aws-terrarium')) {
        map.addSource('aws-terrarium', {
          type: 'raster-dem',
          tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
          encoding: 'terrarium',
          tileSize: 256,
          maxzoom: 15
        });
      }
      map.setTerrain({ source: 'aws-terrarium', exaggeration: settings.terrainExaggeration ?? 1 });

      if (!initialTerrainLoaded.current) {
        initialTerrainLoaded.current = true;
        let userMoved = false;
        const onMove = (e: any) => { if (e.originalEvent) userMoved = true; };
        map.once('movestart', onMove);
        map.once('idle', () => {
          if (!userMoved) {
            map.jumpTo({
              center: settings.defaultView.center,
              zoom: settings.defaultView.zoom,
              pitch: settings.defaultView.pitch,
              bearing: settings.defaultView.bearing,
              ...(settings.defaultView.elevation !== undefined ? { elevation: settings.defaultView.elevation } : {})
            });
          }
          map.off('movestart', onMove);
        });
      }

      if (settings.enableHillshade) {
        const shadowOp = settings.hillshadeShadowOpacity ?? 0.5;
        const highlightOp = settings.hillshadeHighlightOpacity ?? 0.5;
        const shadowColor = `rgba(0,0,0,${shadowOp})`;
        const highlightColor = `rgba(255,255,255,${highlightOp})`;
        const accentColor = `rgba(0,0,0,${shadowOp})`;

        if (!map.getLayer('aws-terrarium-hillshade')) {
          let insertBeforeId;
          const layers = map.getStyle().layers;
          // Find the first water layer so we can insert the hillshade underneath it.
          // This allows the water layer's opacity to mask out underwater terrain.
          for (let i = 0; i < layers.length; i++) {
            if (layers[i].id.includes('water')) {
              insertBeforeId = layers[i].id;
              break;
            }
          }
          if (!insertBeforeId) {
            for (let i = 0; i < layers.length; i++) {
              if (layers[i].type === 'symbol') {
                insertBeforeId = layers[i].id;
                break;
              }
            }
          }

          map.addLayer({
            id: 'aws-terrarium-hillshade',
            type: 'hillshade',
            source: 'aws-terrarium',
            paint: {
              'hillshade-exaggeration': 0.5,
              'hillshade-shadow-color': shadowColor,
              'hillshade-highlight-color': highlightColor,
              'hillshade-accent-color': accentColor
            }
          }, insertBeforeId);
        } else {
          map.setPaintProperty('aws-terrarium-hillshade', 'hillshade-shadow-color', shadowColor);
          map.setPaintProperty('aws-terrarium-hillshade', 'hillshade-highlight-color', highlightColor);
          map.setPaintProperty('aws-terrarium-hillshade', 'hillshade-accent-color', accentColor);
        }
      } else {
        if (map.getLayer('aws-terrarium-hillshade')) {
          map.removeLayer('aws-terrarium-hillshade');
        }
      }

      if (map.getSky && map.getSky()) {
         map.setSky(undefined as any);
      }
      if (mapContainer.current) {
        mapContainer.current.style.backgroundColor = settings.enableSky ? '#88C6FC' : '';
      }

    } else {
      map.setTerrain(null);
      if (map.getLayer('aws-terrarium-hillshade')) {
        map.removeLayer('aws-terrarium-hillshade');
      }
      if (map.getSky && map.getSky()) {
         map.setSky(undefined as any);
      }
    }
  }, [mapLoaded, settings.enable3dTerrain, settings.terrainExaggeration, settings.enableHillshade, settings.hillshadeShadowOpacity, settings.hillshadeHighlightOpacity, settings.enableSky]);

  // Water Layer Styling
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    
    // Only apply to styles that use the standard 'water' fill layer
    if (map.getLayer('water')) {
      if (settings.waterColor !== undefined) {
        map.setPaintProperty('water', 'fill-color', settings.waterColor);
      }
      if (settings.waterOpacity !== undefined) {
        map.setPaintProperty('water', 'fill-opacity', settings.waterOpacity);
      }
    }
  }, [mapLoaded, settings.waterColor, settings.waterOpacity, settings.mapStyle]);

  // Export Scaling Logic (Basemap Labels)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    
    const scale = (settings.exportBasemapScale ?? 1.0) * (imageExportScale || 1.0);
    const style = map.getStyle();
    if (!style || !style.layers) return;

    style.layers.forEach((layer) => {
      // Scale basemap symbol layers (skip custom app layers)
      if (layer.type === 'symbol' && !layer.id.startsWith('custom-') && !layer.id.startsWith('dynamic-') && !layer.id.startsWith('selected-')) {
        // Cache original sizes
        if (!originalBasemapLayoutsRef.current[layer.id]) {
          originalBasemapLayoutsRef.current[layer.id] = {
            textSize: map.getLayoutProperty(layer.id, 'text-size'),
            iconSize: map.getLayoutProperty(layer.id, 'icon-size')
          };
        }

        const origTextSize = originalBasemapLayoutsRef.current[layer.id].textSize ?? 16;
        const origIconSize = originalBasemapLayoutsRef.current[layer.id].iconSize ?? 1;

        try {
          if (scale === 1.0) {
            map.setLayoutProperty(layer.id, 'text-size', origTextSize);
          } else {
            map.setLayoutProperty(layer.id, 'text-size', scaleMapboxExpression(origTextSize, scale));
          }
        } catch (e) {
          console.warn('Failed to scale text-size for layer', layer.id, e);
        }

        try {
          if (scale === 1.0) {
            map.setLayoutProperty(layer.id, 'icon-size', origIconSize);
          } else {
            map.setLayoutProperty(layer.id, 'icon-size', scaleMapboxExpression(origIconSize, scale));
          }
        } catch (e) {
          console.warn('Failed to scale icon-size for layer', layer.id, e);
        }
      }
    });
  }, [mapLoaded, settings.mapStyle, settings.exportBasemapScale, settings.exportScalePreview, isExporting]);

  // Export Scaling Logic (Annotations)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    const domScale = (settings.exportAnnotationScale ?? 1.0);
    const mapboxScale = domScale * (imageExportScale || 1.0);

    // Apply scaling to DOM markers via CSS variable globally
    document.documentElement.style.setProperty('--export-annotation-scale', domScale.toString());

    // Apply scaling to Custom Lines and Strokes
    if (map.getLayer('custom-lines')) {
      map.setPaintProperty('custom-lines', 'line-width', 6 * mapboxScale);
    }
    if (map.getLayer('custom-lines-dashed')) {
      map.setPaintProperty('custom-lines-dashed', 'line-width', 6 * mapboxScale);
    }
    if (map.getLayer('custom-lines-dotted')) {
      map.setPaintProperty('custom-lines-dotted', 'line-width', 6 * mapboxScale);
    }

    if (map.getLayer('custom-polygons-line')) {
      map.setPaintProperty('custom-polygons-line', 'line-width', 3 * mapboxScale);
    }

    if (map.getLayer('custom-arrow-heads')) {
      map.setLayoutProperty('custom-arrow-heads', 'text-size', 80 * mapboxScale);
    }
    
    // Circle Outlines
    if (map.getLayer('custom-circles-line')) {
      map.setPaintProperty('custom-circles-line', 'line-width', 3 * mapboxScale);
    }
  }, [mapLoaded, settings.exportAnnotationScale, settings.exportScalePreview, isExporting, imageExportScale]);


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

