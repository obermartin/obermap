import React, { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { length, along, lineSlice } from '@turf/turf';
import MapboxGeocoder from '@maplibre/maplibre-gl-geocoder';
import '@maplibre/maplibre-gl-geocoder/dist/maplibre-gl-geocoder.css';
import type { Annotation, ToolType, AppSettings, StrokeType, RouteMode, MapLayer } from '../types';
import * as turf from '@turf/turf';
import { useTranslation } from '../contexts/I18nContext';
import { createCirclePolygon, calculateDistance, simplifyLine, transliterateToGerman, createArrowFeatures, decodePolyline, parseWKT, haversineDistance } from '../utils/mapUtils';
import { getTerminatorPolygon } from '../utils/terminatorUtils';
import anyAscii from 'any-ascii';
import { customAlert, customPrompt } from '../utils/dialogService';
import * as Mp4Muxer from 'mp4-muxer';
import { omProtocol } from '@openmeteo/weather-map-layer';
import { globalLabelManager } from '../labels/LabelMarkerManager';
import excludedCitiesData from '../assets/excluded-cities.json';
import { scaleMapboxExpression } from "../utils/mapboxScaleHelper";
import { CropOverlay } from "./CropOverlay";


// Simple concurrency limiter for CEMS fetches
const cemsFetchQueue: (() => Promise<void>)[] = [];
let activeCemsFetches = 0;
const MAX_CONCURRENT_CEMS_FETCHES = 10;

async function enqueueCemsFetch<T>(task: () => Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    cemsFetchQueue.push(async () => {
      try {
        resolve(await task());
      } catch (e) {
        reject(e);
      }
    });
    processCemsFetchQueue();
  });
}

// @ts-ignore
window.cemsDebugInfo = () => ({ q: cemsFetchQueue.length, active: activeCemsFetches });

function processCemsFetchQueue() {
  while (activeCemsFetches < MAX_CONCURRENT_CEMS_FETCHES && cemsFetchQueue.length > 0) {
    const task = cemsFetchQueue.shift();
    if (task) {
      activeCemsFetches++;
      task().finally(() => {
        activeCemsFetches--;
        processCemsFetchQueue();
      });
    }
  }
}

async function safeFetchCemsJson(url: string) {
  return enqueueCemsFetch(async () => {
    try {
      const res = await fetch(url);
      if (!res.ok) return [];
      const text = await res.text();
      try {
        const data = JSON.parse(text);
        return data && data.features ? data.features : (data.type === 'Feature' ? [data] : []);
      } catch (err: any) {
        const features: any[] = [];
        let depth = 0;
        let startIdx = -1;
        let inString = false;
        let escape = false;

        for (let i = 0; i < text.length; i++) {
          const char = text[i];
          if (inString) {
            if (escape) escape = false;
            else if (char === '\\') escape = true;
            else if (char === '"') inString = false;
          } else {
            if (char === '"') inString = true;
            else if (char === '{') {
              if (depth === 0) startIdx = i;
              depth++;
            }
            else if (char === '}') {
              depth--;
              if (depth === 0 && startIdx !== -1) {
                try {
                  const obj = JSON.parse(text.substring(startIdx, i + 1));
                  if (obj.type === 'FeatureCollection' && obj.features) {
                    features.push(...obj.features);
                  } else if (obj.type === 'Feature') {
                    features.push(obj);
                  }
                } catch (e) {}
                startIdx = -1;
              }
            }
          }
        }
        return features;
      }
    } catch (e) {
      return [];
    }
  });
}

let omProtocolRegistered = false;
let globalDeepstateHistory: { id: number; createdAt: string }[] | null = null;
let globalDeepstateHistoryPromise: Promise<{ id: number; createdAt: string; }[] | null> | null = null;

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

interface MapContainerProps {
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

const fetchOpenMeteo = async (url: string) => {
  let res = await fetch(url);
  if (res.status === 429 || res.status === 403) {
    console.warn(`Open-Meteo ${res.status} hit, using corsproxy.io fallback...`);
    res = await fetch(`https://corsproxy.io/?${encodeURIComponent(url)}`);
  }
  if (res.status === 429 || res.status === 403) {
    console.warn(`corsproxy.io ${res.status} hit, using codetabs fallback...`);
    res = await fetch(`https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`);
  }
  if (res.status === 429 || res.status === 403 || res.status === 502) {
    console.warn(`codetabs ${res.status} hit, using thingproxy fallback...`);
    res = await fetch(`https://thingproxy.freeboard.io/fetch/${url}`);
  }
  if (res.status === 429 || res.status === 403 || res.status === 502) {
    console.warn(`thingproxy ${res.status} hit, using allorigins fallback...`);
    res = await fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`);
  }
  return res;
};

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
  const [styleLoadedTick, setStyleLoadedTick] = useState(0);
  const [selectedAircraftId, setSelectedAircraftIdState] = useState<string | null>(null);
  const [selectedVesselMmsi, setSelectedVesselMmsi] = useState<string | null>(null);
  const [selectedCycloneId, setSelectedCycloneIdState] = useState<{ id: string, ep: string } | null>(null);
  const selectedCycloneIdRef = useRef<{ id: string, ep: string } | null>(null);
  const [cycloneTimelinePercent, setCycloneTimelinePercent] = useState<number>(100);
  const [cycloneRawData, setCycloneRawData] = useState<any>(null);
  const [windGeojson, setWindGeojsonState] = useState<GeoJSON.FeatureCollection<GeoJSON.Point> | null>(null);
  
  const [selectedEarthquake, setSelectedEarthquakeState] = useState<{ id: string, ep: string, geomUrl: string, coordinates: [number, number], properties: any } | null>(null);
  const selectedEarthquakeRef = useRef<{ id: string, ep: string, geomUrl: string, coordinates: [number, number], properties: any } | null>(null);
  const [selectedEarthquakeShakemap, setSelectedEarthquakeShakemap] = useState<any>(null);
  const [selectedEarthquakeUsgsDyfi10km, setSelectedEarthquakeUsgsDyfi10km] = useState<any>(null);
  const [selectedEarthquakeUsgsDyfi1km, setSelectedEarthquakeUsgsDyfi1km] = useState<any>(null);
  const [selectedEarthquakeUsgsLandslide, setSelectedEarthquakeUsgsLandslide] = useState<{ url: string, extent: [number, number, number, number] } | null>(null);
  const [selectedEarthquakeUsgsLiquefaction, setSelectedEarthquakeUsgsLiquefaction] = useState<{ url: string, extent: [number, number, number, number] } | null>(null);
  const [selectedCemsEarthquake, setSelectedCemsEarthquakeState] = useState<{ id: string, code: string, properties: any, coordinates: [number, number] } | null>(null);
  const selectedCemsEarthquakeRef = useRef<{ id: string, code: string, properties: any, coordinates: [number, number] } | null>(null);
  const [selectedCemsEarthquakeFeatures, setSelectedCemsEarthquakeFeatures] = useState<any>(null);
  const [activeCemsWildfireFeatures, setActiveCemsWildfireFeatures] = useState<any>(null);
  const [activeCemsFloodFeatures, setActiveCemsFloodFeatures] = useState<any>(null);
  const cemsFeatureCacheRef = useRef<Record<string, any>>({});
  const allCemsActivationsRef = useRef<Promise<any[]> | null>(null);


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

  const [selectedVolcano, setSelectedVolcanoState] = useState<{ id: string, ep: string, geomUrl: string, coordinates: [number, number], properties: any } | null>(null);
  const selectedVolcanoRef = useRef<{ id: string, ep: string, geomUrl: string, coordinates: [number, number], properties: any } | null>(null);
  const [selectedVolcanoPolygon, setSelectedVolcanoPolygon] = useState<any>(null);

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
  const [weatherCityData, setWeatherCityData] = useState<{ [name: string]: { temps: number[], codes: number[], times: string[], x: number, y: number, name: string } }>({});
  const weatherCityFetchCacheRef = useRef<Set<string>>(new Set());
  const weatherCityMarkersRef = useRef<{ [name: string]: maplibregl.Marker }>({});
  const lastActiveWeatherTimeRef = useRef<string | null>(null);
  // selectedWeatherTime is now derived from weatherLayer's effectiveStartDate
  const [revealedTriggers, setRevealedTriggers] = useState<Set<string>>(new Set());
  const [hiddenTriggers, setHiddenTriggers] = useState<Set<string>>(new Set());
  const [isDraggingHeadlineId, setIsDraggingHeadlineId] = useState<string | null>(null);
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
  const layerFadeTimeoutsRef = useRef<{[key: string]: NodeJS.Timeout}>({});
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
  const deepstateDataCacheRef = useRef<{ [cacheKey: string]: any }>({});
  const gdacsDataCacheRef = useRef<{ [cacheKey: string]: any }>({});
  const activeDrawMarkersRef = useRef<{ [id: string]: maplibregl.Marker }>({});
  const selectionMarkersRef = useRef<{ [id: string]: maplibregl.Marker }>({});
  const openSkyTokenRef = useRef<{ token: string, expires: number } | null>(null);
  const aircraftPopupRef = useRef<maplibregl.Popup | null>(null);
  const selectedAircraftMetaRef = useRef<any>(null);
  const vesselsRef = useRef<Map<string, any>>(new Map());
  const wsRef = useRef<WebSocket | null>(null);
  const vesselPopupRef = useRef<maplibregl.Popup | null>(null);
  const activeVesselMmsiRef = useRef<string | null>(null);
  const routeClickTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const windLastFetchRef = useRef<number>(0);
  const windFetchInFlightRef = useRef(false);


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

  const getMmsiFlagHtml = (mmsi: string | number) => {
    if (!mmsi) return '';
    const mStr = String(mmsi);
    if (mStr.length !== 9) return '';
    const mid = parseInt(mStr.substring(0, 3));
    const midMap: Record<number, string> = {
      211: 'DE', 218: 'DE', 232: 'GB', 233: 'GB', 234: 'GB', 235: 'GB',
      338: 'US', 366: 'US', 367: 'US', 368: 'US', 369: 'US', 226: 'FR', 227: 'FR', 228: 'FR',
      247: 'IT', 224: 'ES', 225: 'ES', 316: 'CA', 503: 'AU', 431: 'JP', 432: 'JP',
      412: 'CN', 413: 'CN', 414: 'CN', 273: 'RU', 272: 'UA', 261: 'PL', 271: 'TR',
      244: 'NL', 245: 'NL', 246: 'NL', 269: 'CH', 265: 'SE', 266: 'SE', 257: 'NO', 258: 'NO', 259: 'NO',
      219: 'DK', 220: 'DK', 230: 'FI', 203: 'AT', 205: 'BE', 710: 'BR', 345: 'MX', 419: 'IN',
      601: 'ZA', 250: 'IE', 237: 'GR', 238: 'GR', 239: 'GR', 240: 'GR', 241: 'GR', 263: 'PT',
      512: 'NZ', 563: 'SG', 564: 'SG', 565: 'SG', 566: 'SG', 470: 'AE', 403: 'SA', 428: 'IL',
      440: 'KR', 441: 'KR', 416: 'TW', 477: 'HK', 567: 'TH', 533: 'MY', 525: 'ID', 574: 'VN',
      548: 'PH', 622: 'EG', 242: 'MA',
      351: 'PA', 352: 'PA', 353: 'PA', 354: 'PA', 355: 'PA', 356: 'PA', 357: 'PA', 370: 'PA', 371: 'PA', 372: 'PA', 373: 'PA', 374: 'PA',
      636: 'LR', 637: 'LR', 538: 'MH', 215: 'MT', 229: 'MT', 248: 'MT', 249: 'MT', 256: 'MT',
      308: 'BS', 309: 'BS', 311: 'BS', 209: 'CY', 210: 'CY', 212: 'CY', 304: 'AG', 305: 'AG',
      375: 'VC', 376: 'VC', 377: 'VC', 576: 'VU', 577: 'VU', 319: 'KY', 310: 'BM', 236: 'GI', 231: 'FO'
    };
    const code = midMap[mid];
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
  const routeGeometryRef = useRef<any>(null);
  const routeLegsRef = useRef<{ distance: number; duration: number }[]>([]);
  const routeSegmentsRef = useRef<{ [idx: number]: [number, number][] }>({});
  const routeLegsSegmentsRef = useRef<{ [idx: number]: { distance: number, duration: number } }>({});
  const currentDrawSessionRef = useRef<number>(0);
  const pendingFetchesRef = useRef<number>(0);

  const terrestrialCountriesRef = useRef<any>(null);
  const cachedTurfDataRef = useRef<{[id: string]: any}>({});
  const activeFeaturesRef = useRef<GeoJSON.Feature[]>([]);

  const fetchFullRoute = async (coords: [number, number][], rMode: RouteMode, googleMapsToken?: string) => {
    const fullCoords = [coords[0]];
    const fullLegs: { distance: number, duration: number }[] = [];
  
    const fetchSegment = async (p1: [number, number], p2: [number, number]): Promise<{ coords: [number, number][], leg: { distance: number, duration: number } }> => {
      if (rMode === 'train') {
        if (googleMapsToken) {
          try {
            const res = await fetch(`./api.php?action=google_directions&origin=${p1[1]},${p1[0]}&destination=${p2[1]},${p2[0]}&key=${googleMapsToken}`);
            const data = await res.json();
            if (data.routes && data.routes[0]) {
              const route = data.routes[0];
              const leg = route.legs[0];
              let points: [number, number][] = [];
              if (leg.steps && leg.steps.length > 0) {
                const transitSteps = leg.steps.filter((s: any) => s.travel_mode === 'TRANSIT');
                if (transitSteps.length > 0) {
                  transitSteps.forEach((step: any) => {
                    points.push(...decodePolyline(step.polyline.points));
                  });
                } else {
                  points = decodePolyline(route.overview_polyline.points);
                }
              } else {
                points = decodePolyline(route.overview_polyline.points);
              }
              return { coords: points, leg: { distance: leg.distance.value, duration: leg.duration.value } };
            }
          } catch (err) {
            console.error('Google Transit API error:', err);
          }
        }
        const distKm = turf.distance(turf.point(p1), turf.point(p2), { units: 'kilometers' });
        return { coords: [p2], leg: { distance: distKm * 1000, duration: (distKm / 100) * 3600 } };
      } else {
        const endpoint = rMode === 'walking' 
          ? 'https://routing.openstreetmap.de/routed-foot/route/v1/driving' 
          : 'https://router.project-osrm.org/route/v1/driving';
        try {
          const res = await fetch(`${endpoint}/${p1[0]},${p1[1]};${p2[0]},${p2[1]}?overview=full&geometries=geojson`);
          const data = await res.json();
          if (data.routes && data.routes[0]) {
            const route = data.routes[0];
            return { coords: route.geometry.coordinates.slice(1), leg: { distance: route.distance, duration: route.duration } };
          }
        } catch (err) {
          console.error('OSRM API error:', err);
        }
        const distKm = turf.distance(turf.point(p1), turf.point(p2), { units: 'kilometers' });
        return { coords: [p2], leg: { distance: distKm * 1000, duration: (distKm / (rMode === 'walking' ? 5 : 60)) * 3600 } };
      }
    };
  
    const segmentPromises = [];
    for (let i = 1; i < coords.length; i++) {
      segmentPromises.push(fetchSegment(coords[i - 1], coords[i]));
    }
    
    const segments = await Promise.all(segmentPromises);
    
    for (const seg of segments) {
      fullCoords.push(...seg.coords);
      fullLegs.push(seg.leg);
    }
  
    return { fullCoords, fullLegs };
  };

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
        setAnnotationsRef.current(prev => [...prev, {
          id: annotationId,
          type: 'highlight',
          color: currentColorRef.current || '#ffffff',
          template: settingsRef.current?.labelTemplates?.highlightLabelTemplate,
          theme: settingsRef.current?.labelTemplates?.theme,
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
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="#ffffff" stroke="none">
          <path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"/>
        </svg>
      `);

      loadIcon('helicopter', `
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
          <ellipse cx="12" cy="14" rx="2.5" ry="5" fill="#ffffff" />
          <rect x="11.5" y="18" width="1" height="5" fill="#ffffff" />
          <rect x="9" y="21" width="6" height="1.5" fill="#ffffff" />
          <circle cx="12" cy="14" r="8" fill="none" stroke="#ffffff" stroke-width="0.5" />
          <path d="M4 14 L20 14 M12 6 L12 22" stroke="#ffffff" stroke-width="1.2" />
        </svg>
      `);

      loadIcon('small_aircraft', `
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
          <ellipse cx="12" cy="12" rx="2" ry="8" fill="#ffffff" />
          <rect x="3" y="8" width="18" height="2.5" fill="#ffffff" rx="1" />
          <rect x="8" y="18" width="8" height="2" fill="#ffffff" rx="0.5" />
        </svg>
      `);

      loadIcon('military', `
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
          <path d="M12 2 L14 12 L22 16 L22 18 L13 16 L12 21 L11 16 L2 18 L2 16 L10 12 Z" fill="#ffffff" />
        </svg>
      `);

      // Add Icons for Vessels Layer
      loadIcon('ship-fast', `
        <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28">
          <path d="M14 1 L25 25 L14 19 L3 25 Z" fill="#ffffff" />
        </svg>
      `);
      loadIcon('ship-slow', `
        <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28">
          <path d="M14 1 L25 25 L14 19 L3 25 Z" fill="#ffffff" />
        </svg>
      `);
      loadIcon('ship-still', `
        <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28">
          <path d="M14 1 L25 25 L14 19 L3 25 Z" fill="none" stroke="#ffffff" stroke-width="1.5" />
        </svg>
      `);
      loadIcon('wind-arrow', `
        <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28">
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
        const actualTheme = settingsRef.current?.labelTemplates?.savedThemes?.[selectedId || ''] || settingsRef.current?.labelTemplates?.theme;

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
        const newId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
        setAnnotations(prev => [...prev, {
          id: newId,
          type: 'headline',
          color: currentColor,
          text,
          secondaryText,
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
    
    // First, sync feature-state and static opacities
    annotations.forEach(ann => {
      const hasRevealTrigger = !!ann.animationTriggerId;
      const hasHideTrigger = !!ann.hideAnimationTriggerId;
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
        const hasRevealTrigger = !!ann.animationTriggerId;
        const hasHideTrigger = !!ann.hideAnimationTriggerId;
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

  // Render weather city markers
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    const weatherLayer = settings.layers.find(l => l.type === 'weather_forecast');
    const showTemp = weatherLayer?.visible && weatherLayer?.showCityTemperatures !== false;
    const showIcon = weatherLayer?.visible && weatherLayer?.showCityWeatherIcons !== false;

    if (!weatherLayer?.visible || (!showTemp && !showIcon)) {
      Object.keys(weatherCityMarkersRef.current).forEach(id => {
        weatherCityMarkersRef.current[id].remove();
        delete weatherCityMarkersRef.current[id];
      });
      try {
        map.setPaintProperty('label_city', 'text-opacity', 1);
        map.setPaintProperty('label_city_capital', 'text-opacity', 1);
      } catch (e) {}
      return;
    }

    const activeTime = selectedWeatherTime || weatherValidTimes[0];
    const activeDate = activeTime ? activeTime.split('T')[0] : '';

    const getWeatherIconSVG = (code: number) => {
      if (code === 0) return `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>`;
      if (code <= 3) return `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/></svg>`;
      if (code <= 48) return `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 14h16"/><path d="M4 18h16"/><path d="M4 22h16"/><path d="M4 10h16"/><path d="M4 6h16"/></svg>`;
      if (code <= 67 || (code >= 80 && code <= 82)) return `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"/><path d="M16 14v6"/><path d="M8 14v6"/><path d="M12 16v6"/></svg>`;
      if (code <= 77 || code === 85 || code === 86) return `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"/><path d="M8 15h.01"/><path d="M8 19h.01"/><path d="M12 17h.01"/><path d="M12 21h.01"/><path d="M16 15h.01"/><path d="M16 19h.01"/></svg>`;
      if (code >= 95) return `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 16.9A5 5 0 0 0 18 7h-1.26a8 8 0 1 0-11.62 9"/><polyline points="13 11 9 17 15 17 11 23"/></svg>`;
      return `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/></svg>`;
    };

    const activeNames = new Set<string>();

    const EXCLUDED_NON_GERMAN_CITIES = new Set([
      'Prague', 'Prag', 'Praha', 'Plzeň', 'Karlovy Vary', 'Ústí nad Labem', 'Liberec', 'Děčín', 'České Budějovice',
      'Salzburg', 'Linz', 'Innsbruck', 'Bregenz', 'Vienna', 'Wien',
      'Zürich', 'Zurich', 'Basel', 'St. Gallen', 'Winterthur', 'Schaffhausen', 'Bern',
      'Strasbourg', 'Straßburg', 'Mulhouse', 'Colmar', 'Metz', 'Nancy',
      'Luxembourg', 'Luxemburg',
      'Liège', 'Lüttich', 'Brussels', 'Brüssel',
      'Maastricht', 'Eindhoven', 'Enschede', 'Groningen', 'Amsterdam', 'Rotterdam',
      'Szczecin', 'Stettin', 'Zielona Góra', 'Gorzów Wielkopolski', 'Poznań', 'Posen', 'Wrocław', 'Breslau',
      'Odense', 'Copenhagen', 'Kopenhagen'
    ]);

    Object.values(weatherCityData).forEach(data => {
      if (weatherLayer.limitCityWeatherToGermany) {
        if (data.x < 5.86 || data.x > 15.04 || data.y < 47.27 || data.y > 55.08) return;
        if (EXCLUDED_NON_GERMAN_CITIES.has(data.name)) return;
      }

      activeNames.add(data.name);
      
      let timeIndexToUse = 0;
      if (activeDate && data.times) {
        const idx = data.times.indexOf(activeDate);
        if (idx !== -1) timeIndexToUse = idx;
      }
      
      const temp = data.temps[timeIndexToUse];
      const code = data.codes[timeIndexToUse];
      if (temp === undefined) return;
      
      const tempStr = Math.round(temp) + '°';
      const iconSvg = getWeatherIconSVG(code);
      
      let marker = weatherCityMarkersRef.current[data.name];
      if (!marker) {
        const el = document.createElement('div');
        el.className = 'custom-city-weather-marker absolute pointer-events-none flex items-center gap-1.5 px-2 py-0.5 -mt-4 text-white bg-black';
        marker = new maplibregl.Marker({ element: el })
          .setLngLat([data.x, data.y])
          .addTo(map);
        weatherCityMarkersRef.current[data.name] = marker;
      }
      
      const el = marker.getElement();
      el.innerHTML = '';
      if (showTemp) {
        const span = document.createElement('span');
        span.innerText = data.name + ' ' + tempStr;
        span.className = 'font-bold tracking-tight text-[11px] leading-none';
        el.appendChild(span);
      } else {
        const span = document.createElement('span');
        span.innerText = data.name;
        span.className = 'font-bold tracking-tight text-[11px] leading-none';
        el.appendChild(span);
      }
      if (showIcon) {
        const iconDiv = document.createElement('div');
        iconDiv.innerHTML = iconSvg;
        iconDiv.className = '';
        // Resize icon slightly smaller to match text size
        const svg = iconDiv.querySelector('svg');
        if (svg) {
          svg.setAttribute('width', '14');
          svg.setAttribute('height', '14');
        }
        el.appendChild(iconDiv);
      }
    });

    Object.keys(weatherCityMarkersRef.current).forEach(name => {
      if (!activeNames.has(name)) {
        weatherCityMarkersRef.current[name].remove();
        delete weatherCityMarkersRef.current[name];
      }
    });

    try {
      const namesList = Array.from(activeNames);
      if (namesList.length > 0) {
        const opacityExpr: any[] = ['match', ['get', 'name']];
        namesList.forEach(n => { opacityExpr.push(n); opacityExpr.push(0); });
        opacityExpr.push(1); // default
        map.setPaintProperty('label_city', 'text-opacity', opacityExpr);
        map.setPaintProperty('label_city_capital', 'text-opacity', opacityExpr);
      } else {
        map.setPaintProperty('label_city', 'text-opacity', 1);
        map.setPaintProperty('label_city_capital', 'text-opacity', 1);
      }
    } catch (e) {}

  }, [weatherCityData, settings.layers, selectedWeatherTime, weatherValidTimes, mapLoaded]);

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

  // Synchronize dynamic map layers
  useEffect(() => {
    if (!mapRef.current || !mapLoaded) return;
    const map = mapRef.current;
    
    const fadeDuration = settings.labelAnimationDuration ?? 1000;
    const transition = { duration: fadeDuration, delay: 0 };

    const setLayerFade = (mapLibreLayerId: string, layerType: string, isVisible: boolean, maxOpacity: any = 1, layerSidebarVisible: boolean = true) => {
      if (!map.getLayer(mapLibreLayerId)) return;
      
      if (!layerSidebarVisible) {
        map.setLayoutProperty(mapLibreLayerId, 'visibility', 'none');
        if (layerFadeTimeoutsRef.current[mapLibreLayerId]) {
          clearTimeout(layerFadeTimeoutsRef.current[mapLibreLayerId]);
          delete layerFadeTimeoutsRef.current[mapLibreLayerId];
        }
        return;
      }
      
      if (layerFadeTimeoutsRef.current[mapLibreLayerId]) {
        clearTimeout(layerFadeTimeoutsRef.current[mapLibreLayerId]);
        delete layerFadeTimeoutsRef.current[mapLibreLayerId];
      }
      
      const opacityProp = `${layerType}-opacity`;
      const currentVisibility = map.getLayoutProperty(mapLibreLayerId, 'visibility');
      
      if (isVisible) {
        if (currentVisibility === 'none') {
          map.setLayoutProperty(mapLibreLayerId, 'visibility', 'visible');
          setTimeout(() => {
            if (!map.getLayer(mapLibreLayerId)) return;
            map.setPaintProperty(mapLibreLayerId, opacityProp + '-transition', transition);
            map.setPaintProperty(mapLibreLayerId, opacityProp, maxOpacity);
          }, 30);
        } else {
          map.setPaintProperty(mapLibreLayerId, opacityProp + '-transition', transition);
          map.setPaintProperty(mapLibreLayerId, opacityProp, maxOpacity);
        }
      } else {
        map.setPaintProperty(mapLibreLayerId, opacityProp + '-transition', transition);
        map.setPaintProperty(mapLibreLayerId, opacityProp, 0);
        
        layerFadeTimeoutsRef.current[mapLibreLayerId] = setTimeout(() => {
          if (map.getLayer(mapLibreLayerId)) {
            map.setLayoutProperty(mapLibreLayerId, 'visibility', 'none');
          }
          delete layerFadeTimeoutsRef.current[mapLibreLayerId];
        }, fadeDuration);
      }
    };

    let style;
    try {
      style = map.getStyle();
    } catch(e) {
      return; // Style not loaded yet
    }
    
    const layers = (settings.layers || []).map(layer => {
      const hasRevealTrigger = !!layer.animationTriggerId;
      const hasHideTrigger = !!layer.hideAnimationTriggerId;
      
      const overrideVisible = activeTool !== 'none';
      const isRevealed = overrideVisible || (!hasRevealTrigger || revealedTriggers.has(layer.animationTriggerId!));
      const isHidden = !overrideVisible && (hasHideTrigger && hiddenTriggers.has(layer.hideAnimationTriggerId!));
      
      const isTriggerVisible = isRevealed && !isHidden;
      
      return { ...layer, _effectiveOpacityVisible: isTriggerVisible };
    });
    const styleLayers = style?.layers || [];
    const firstSymbolId = styleLayers.find(l => l.type === 'symbol')?.id;
    
    let lastWaterIndex = -1;
    for (let i = 0; i < styleLayers.length; i++) {
      if (styleLayers[i].type === 'fill' && (styleLayers[i].id.includes('water') || styleLayers[i].id.includes('marine') || styleLayers[i].id.includes('ocean'))) {
        lastWaterIndex = i;
      }
    }
    
    let firstAdminId = undefined;
    for (let i = lastWaterIndex + 1; i < styleLayers.length; i++) {
      const l = styleLayers[i];
      if ((l.type === 'line' || l.type === 'symbol') &&
          (l.id.includes('admin') || l.id.includes('border') || l.id.includes('boundar') || l.id.includes('country'))) {
        firstAdminId = l.id;
        break;
      }
    }
    firstAdminId = firstAdminId || firstSymbolId;
    let firstSymbolFont = ['Open Sans Regular'];
    for (let i = 0; i < styleLayers.length; i++) {
      if (styleLayers[i].type === 'symbol') {
        const font = (styleLayers[i] as any).layout?.['text-font'];
        if (font && Array.isArray(font) && font.length > 0 && typeof font[0] === 'string') {
           firstSymbolFont = font;
           break;
        }
      }
    }

    const fallbackFont = settings.replaceGothamFont !== false ? ['Gotham Bold', ...firstSymbolFont] : firstSymbolFont;

    // Identify current custom dynamic layers
    const dynamicLayerIds = (style?.layers || [])
      .filter(l => l.id.startsWith('dynamic-layer-'))
      .map(l => l.id.replace('dynamic-layer-', ''));

    // Remove deleted layers
    dynamicLayerIds.forEach(id => {
      if (!layers.find(l => l.id === id || id.startsWith(`${l.id}-`))) {
        if (map.getLayer(`dynamic-layer-${id}`)) map.removeLayer(`dynamic-layer-${id}`);
        if (map.getLayer(`dynamic-line-${id}`)) map.removeLayer(`dynamic-line-${id}`);
        if (map.getSource(`dynamic-source-${id}`)) {
          map.removeSource(`dynamic-source-${id}`);
        }
      }
    });

    const wantsWind = layers.find(l => l.type === 'weather_forecast' && l.showWindParticles !== false);
    if (!wantsWind) {
      if (map.getSource('weather-wind')) {
        if (map.getLayer('weather-wind-arrows')) map.removeLayer('weather-wind-arrows');
        map.removeSource('weather-wind');
      }
      windLastFetchRef.current = 0;
    } else {
      if (!map.getSource('weather-wind')) {
        map.addSource('weather-wind', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      }
    }


    // Add / Update layers
    layers.forEach((layer) => {
      const sourceId = `dynamic-source-${layer.id}`;
      const layerId = `dynamic-layer-${layer.id}`;
      const lineId = `dynamic-line-${layer.id}`;

      // Re-initialize raster sources if they are dirty (e.g. date changed)
      if ((layer.type === 'raster' || layer.type === 'wildfires') && layer._isDirty) {
        if (layer.type === 'raster' && map.getSource(sourceId)) {
          if (map.getLayer(layerId)) map.removeLayer(layerId);
          if (map.getLayer(lineId)) map.removeLayer(lineId);
          map.removeSource(sourceId);
          layer._isDirty = false;
        } else if (layer.type === 'wildfires' && map.getSource(`${sourceId}-effis`)) {
          if (map.getLayer(`${layerId}-effis`)) map.removeLayer(`${layerId}-effis`);
          map.removeSource(`${sourceId}-effis`);
          layer._isDirty = false;
        }
      }

      if (layer.type === 'weather_forecast') {
        const currentActiveTime = selectedWeatherTime || 'current_time_1H';
        
        const timesToLoadSet = new Set<string>();
        timesToLoadSet.add(currentActiveTime);
        
        // Include previous time so it doesn't blink out immediately while fading
        if (lastActiveWeatherTimeRef.current && lastActiveWeatherTimeRef.current !== currentActiveTime) {
          timesToLoadSet.add(lastActiveWeatherTimeRef.current);
        }
        lastActiveWeatherTimeRef.current = currentActiveTime;
        
        // Preload next few steps for smooth timeline scrubbing
        const activeIndex = weatherValidTimes.indexOf(currentActiveTime);
        if (activeIndex !== -1) {
          for (let i = activeIndex - 1; i <= activeIndex + 2; i++) {
            if (i >= 0 && i < weatherValidTimes.length) {
              timesToLoadSet.add(weatherValidTimes[i]);
            }
          }
        }
        
        const timesToLoad = Array.from(timesToLoadSet);

        const newLayerIds: string[] = [];
        const newSourceIds: string[] = [];

        timesToLoad.forEach((time) => {
          const timeSuffix = time.replace(/[:T-]/g, '');
          const tempSourceId = `${sourceId}-temp-${timeSuffix}`;
          const precipSourceId = `${sourceId}-precip-${timeSuffix}`;
          const tempLayerId = `${layerId}-temp-${timeSuffix}`;
          const precipLayerId = `${layerId}-precip-${timeSuffix}`;
          
          newLayerIds.push(tempLayerId, precipLayerId);
          newSourceIds.push(tempSourceId, precipSourceId);
          
          let timeStepParam = 'time_step=current_time_1H';
          if (time !== 'current_time_1H') {
            const index = weatherAllValidTimesRef.current.indexOf(time);
            timeStepParam = index !== -1 ? `time_step=valid_times_${index}` : `time_step=${time}`;
          }
          const baseUrl = `https://map-tiles.open-meteo.com/data_spatial/dwd_icon/latest.json?${timeStepParam}`;
          const tempUrl = `om://${baseUrl}&variable=temperature_2m`;
          const precipUrl = `om://${baseUrl}&variable=precipitation`;
          
          // Add sources
          if (layer.showTemperature && !map.getSource(tempSourceId)) {
            map.addSource(tempSourceId, { type: 'raster', url: tempUrl, maxzoom: 12 } as any);
          }
          if (layer.showPrecipitation && !map.getSource(precipSourceId)) {
            map.addSource(precipSourceId, { type: 'raster', url: precipUrl, maxzoom: 12 } as any);
          }

          // Remove sources if toggled off
          if (!layer.showTemperature && map.getSource(tempSourceId)) {
            if (map.getLayer(tempLayerId)) map.removeLayer(tempLayerId);
            map.removeSource(tempSourceId);
          }
          if (!layer.showPrecipitation && map.getSource(precipSourceId)) {
            if (map.getLayer(precipLayerId)) map.removeLayer(precipLayerId);
            map.removeSource(precipSourceId);
          }
          
          // Add layers
          if (layer.showTemperature && map.getSource(tempSourceId) && !map.getLayer(tempLayerId)) {
            map.addLayer({
              id: tempLayerId,
              type: 'raster',
              source: tempSourceId,
              layout: { visibility: layer.visible ? 'visible' : 'none' },
              paint: { 'raster-opacity': 0 } // start hidden
            }, firstAdminId);
          }
          if (layer.showPrecipitation && map.getSource(precipSourceId) && !map.getLayer(precipLayerId)) {
            map.addLayer({
              id: precipLayerId,
              type: 'raster',
              source: precipSourceId,
              layout: { visibility: layer.visible ? 'visible' : 'none' },
              paint: { 'raster-opacity': 0 } // start hidden
            }, firstAdminId);
          }
          
          // Update visibility and opacity
          const isActive = time === currentActiveTime;
          const targetOpacity = isActive ? (layer.opacity ?? 0.75) : 0;
          
          if (map.getLayer(tempLayerId)) {
            map.setLayoutProperty(tempLayerId, 'visibility', layer.visible ? 'visible' : 'none');
            setLayerFade(tempLayerId, 'raster', layer._effectiveOpacityVisible ?? true, targetOpacity, layer.visible);
          }
          if (map.getLayer(precipLayerId)) {
            map.setLayoutProperty(precipLayerId, 'visibility', layer.visible ? 'visible' : 'none');
            setLayerFade(precipLayerId, 'raster', layer._effectiveOpacityVisible ?? true, targetOpacity, layer.visible);
          }
        });

        // Cleanup old weather layers that are no longer in timesToLoad
        weatherForecastLayerIdsRef.current.forEach(id => {
          if (!newLayerIds.includes(id)) {
            if (map.getLayer(id)) map.removeLayer(id);
          }
        });
        weatherForecastSourceIdsRef.current.forEach(id => {
          if (!newSourceIds.includes(id)) {
            if (map.getSource(id)) map.removeSource(id);
          }
        });
        
        weatherForecastLayerIdsRef.current = newLayerIds;
        weatherForecastSourceIdsRef.current = newSourceIds;
        
        return; // Skip the rest of the generic layer loop
      }

      if (!map.getSource(sourceId)) {
        if (layer.type === 'geojson' && layer.data) {
          map.addSource(sourceId, { type: 'geojson', data: layer.data });
        } else if (layer.type === 'deepstate' || layer.type === 'gdacs_earthquakes' || layer.type === 'cems_rapid_mapping' || layer.type === 'gdacs_volcanoes' || layer.type === 'gdacs_cyclones' || layer.type === 'nighttime') {
          map.addSource(sourceId, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
        } else if (layer.type === 'wildfires') {
          // Add both sources, we will toggle visibility
          if (!map.getSource(`${sourceId}-effis`)) {
            let processedUrl = layer.url || 'https://maps.effis.emergency.copernicus.eu/gwis?service=WMS&request=GetMap&layers=nrt.ba&version=1.1.1&format=image/png&transparent=true&srs=EPSG:3857&width=256&height=256&styles=&bbox={bbox-epsg-3857}&time={date-start}/{date-end}';
            const { effectiveStartDate, effectiveEndDate } = getEffectiveLayerDates(layer);
            processedUrl = processedUrl.replace(/{date-start}/g, effectiveStartDate).replace(/{date-end}/g, effectiveEndDate);
            map.addSource(`${sourceId}-effis`, { type: 'raster', tiles: [processedUrl], tileSize: 256 });
          } else {
             // update url
            let processedUrl = layer.url || 'https://maps.effis.emergency.copernicus.eu/gwis?service=WMS&request=GetMap&layers=nrt.ba&version=1.1.1&format=image/png&transparent=true&srs=EPSG:3857&width=256&height=256&styles=&bbox={bbox-epsg-3857}&time={date-start}/{date-end}';
            const { effectiveStartDate, effectiveEndDate } = getEffectiveLayerDates(layer);
            processedUrl = processedUrl.replace(/{date-start}/g, effectiveStartDate).replace(/{date-end}/g, effectiveEndDate);
            
            // Mapbox GL JS doesn't allow updating raster source tiles directly without removing/adding, but we can do it if we remove layer/source in cleanup. Let's rely on that or recreate.
            // Wait, actually, the easiest way to force tile reload in mapbox without removing is not supported.
            // But we can just append a timestamp or change source ID if dates change. 
            // For now, let's remove and re-add if dates change (handled in a separate effect).
            // But here we are just adding.
          }
          if (!map.getSource(`${sourceId}-gdacs`)) {
            map.addSource(`${sourceId}-gdacs`, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
          }
        } else if (layer.type === 'raster' && layer.url) {
          let processedUrl = layer.url;
          
          const { effectiveStartDate: startVal, effectiveEndDate: endVal } = getEffectiveLayerDates(layer);
          
          processedUrl = processedUrl.replace(/%7Bdate-today%7D/g, '{date-end}').replace(/%7Bdate-7d%7D/g, '{date-start}');
          processedUrl = processedUrl.replace(/{date-today}/g, '{date-end}').replace(/{date-7d}/g, '{date-start}');
          processedUrl = processedUrl.replace(/{date-start}/g, startVal).replace(/{date-end}/g, endVal);
          
          const sourceConfig: any = { type: 'raster', tiles: [processedUrl], tileSize: 256 };
          if (layer.maxZoom !== undefined) {
            sourceConfig.maxzoom = layer.maxZoom;
          }
          map.addSource(sourceId, sourceConfig);
        } else if (layer.type === 'satellite') {
          map.addSource(sourceId, { type: 'raster', tiles: ['https://ecn.t0.tiles.virtualearth.net/tiles/a{quadkey}.jpeg?g=129'], tileSize: 256, maxzoom: 19 });
        } else if (layer.type === 'flights' || layer.type === 'vessels') {
          map.addSource(sourceId, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
        }
      } else {
        if (layer.type === 'geojson' && layer.data) {
          (map.getSource(sourceId) as maplibregl.GeoJSONSource).setData(layer.data);
        }
      }

      if ((!map.getLayer(layerId) && map.getSource(sourceId)) || (layer.type === 'wildfires' && !map.getLayer(`${layerId}-effis`))) {
        if (layer.type === 'geojson') {
          map.addLayer({
            id: layerId,
            type: 'fill',
            source: sourceId,
            layout: { visibility: layer.visible ? 'visible' : 'none' },
            paint: {
              'fill-color': ['coalesce', ['get', 'fillColor'], '#00A79D'],
              'fill-opacity': ['coalesce', ['get', 'fillOpacity'], 0.5]
            }
          }, firstAdminId);
          map.addLayer({
            id: lineId,
            type: 'line',
            source: sourceId,
            layout: { visibility: layer.visible ? 'visible' : 'none' },
            paint: {
              'line-color': ['coalesce', ['get', 'outlineColor'], 'transparent'],
              'line-width': ['coalesce', ['get', 'outlineWidth'], 0],
              'line-opacity': ['coalesce', ['get', 'outlineOpacity'], 1.0]
            }
          }, firstAdminId);
        } else if (layer.type === 'gdacs_earthquakes' || layer.type === 'gdacs_volcanoes' || layer.type === 'gdacs_cyclones') {
          map.addLayer({
            id: layerId,
            type: 'circle',
            source: sourceId,
            layout: { visibility: layer.visible ? 'visible' : 'none' },
            paint: {
              'circle-radius': [
                'interpolate', ['linear'], ['coalesce', ['get', 'severity', ['get', 'severitydata']], ['get', 'severity'], 5],
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
              'circle-opacity': layer.opacity ?? 0.8,
              'circle-stroke-width': 0
            }
          }, firstSymbolId);

          if (layer.type === 'gdacs_earthquakes') {
            map.addLayer({
              id: `${layerId}-label`,
              type: 'symbol',
              source: sourceId,
              layout: {
                visibility: layer.visible ? 'visible' : 'none',
                'text-field': ['to-string', ['get', 'severity_numeric']],
                'text-font': fallbackFont,
                'text-size': 12,
                'text-anchor': 'center',
                'symbol-sort-key': ['-', 0, ['get', 'severity_numeric']]
              },
              paint: {
                'text-color': '#ffffff',
                'text-halo-color': '#ffffff',
                'text-halo-width': 0.5
              }
            });
          }
        } else if (layer.type === 'cems_rapid_mapping') {
          map.addLayer({
            id: layerId,
            type: 'circle',
            source: sourceId,
            layout: { visibility: layer.visible ? 'visible' : 'none' },
            paint: {
              'circle-radius': 6,
              'circle-color': '#ff0000',
              'circle-opacity': layer.opacity ?? 0.8,
              'circle-stroke-width': 2,
              'circle-stroke-color': '#ffffff'
            }
          }, firstSymbolId);
          map.addLayer({
            id: `${layerId}-label`,
            type: 'symbol',
            source: sourceId,
            layout: {
              visibility: layer.visible ? 'visible' : 'none',
              'text-field': ['get', 'name'],
              'text-font': fallbackFont,
              'text-size': 12,
              'text-anchor': 'top',
              'text-offset': [0, 0.8],
            },
            paint: {
              'text-color': '#ffffff',
              'text-halo-color': '#000000',
              'text-halo-width': 1
            }
          });
        } else if (layer.type === 'nighttime') {
          map.addLayer({
            id: layerId,
            type: 'fill',
            source: sourceId,
            layout: { visibility: layer.visible ? 'visible' : 'none' },
            paint: {
              'fill-color': '#000000',
              'fill-opacity': layer.opacity ?? 0.5
            }
          }, firstAdminId);
        } else if (layer.type === 'wildfires') {
          if (!map.getLayer(`${layerId}-effis`)) {
            map.addLayer({
              id: `${layerId}-effis`,
              type: 'raster',
              source: `${sourceId}-effis`,
              layout: { visibility: layer.visible ? 'visible' : 'none' },
              paint: { 'raster-opacity': layer.opacity ?? 0.75 }
            }, firstAdminId);
          }
        } else if (layer.type === 'deepstate') {
          map.addLayer({
            id: layerId,
            type: 'fill',
            source: sourceId,
            layout: { visibility: layer.visible ? 'visible' : 'none' },
            paint: {
              'fill-opacity': layer.opacity ?? 0.5,
              'fill-color': [
                'case',
                ['in', 'UNKNOWN', ['upcase', ['coalesce', ['get', 'name'], '']]], '#F15A38',
                ['in', 'LIBERATED', ['upcase', ['coalesce', ['get', 'name'], '']]], '#317FE0',
                ['in', 'OCCUPIED', ['upcase', ['coalesce', ['get', 'name'], '']]], '#C91D2C',
                ['in', 'CADR', ['upcase', ['coalesce', ['get', 'name'], '']]], '#AB1926',
                ['in', 'CRIMEA', ['upcase', ['coalesce', ['get', 'name'], '']]], '#AB1926',
                '#888888'
              ]
            }
          }, firstAdminId);
        } else if (layer.type === 'raster' || layer.type === 'satellite') {
          const bMin = layer.brightness !== undefined && layer.brightness > 0 ? layer.brightness : 0;
          const bMax = layer.brightness !== undefined && layer.brightness < 0 ? 1 + layer.brightness : 1;
          map.addLayer({
            id: layerId,
            type: 'raster',
            source: sourceId,
            layout: { visibility: layer.visible ? 'visible' : 'none' },
            paint: { 
              'raster-opacity': layer.opacity ?? 1.0,
              'raster-contrast': layer.contrast ?? 0,
              'raster-saturation': layer.saturation ?? 0,
              'raster-hue-rotate': layer.hue ?? 0,
              'raster-brightness-min': bMin,
              'raster-brightness-max': bMax
            }
          }, firstAdminId);
        } else if (layer.type === 'flights') {
          map.addLayer({
            id: layerId,
            type: 'symbol',
            source: sourceId,
            layout: { 
              visibility: layer.visible ? 'visible' : 'none',
              'icon-image': [
                'match',
                ['get', 'category'],
                8, 'helicopter',
                7, 'military',
                2, 'small_aircraft',
                3, 'small_aircraft',
                9, 'small_aircraft',
                12, 'small_aircraft',
                'airplane' // default
              ],
              'icon-size': 1.6,
              'icon-rotate': ['get', 'true_track'],
              'icon-rotation-alignment': 'map',
              'icon-allow-overlap': true,
              'icon-ignore-placement': true
            },
            paint: {
              'icon-opacity': selectedAircraftId 
                ? ['case', ['==', ['to-string', ['get', 'icao24']], selectedAircraftId], 1.0, 0.5]
                : 1.0,
              'icon-color': layer.aircraftColors && Object.keys(layer.aircraftColors).length > 0 
                ? ['match', ['to-string', ['get', 'icao24']], ...Object.entries(layer.aircraftColors).flat(), layer.globalAircraftColor || '#ffffff'] as any
                : (layer.globalAircraftColor || '#ffffff')
            }
          }, firstSymbolId);
          
          map.addLayer({
            id: `${layerId}-labels`,
            type: 'symbol',
            source: sourceId,
            layout: {
              visibility: layer.visible && layer.showCallsigns ? 'visible' : 'none',
              'text-field': ['case', ['==', ['get', 'callsign'], ''], ['get', 'icao24'], ['get', 'callsign']],
              'text-font': fallbackFont,
              'text-size': 10,
              'text-offset': [0, 1.5],
              'text-anchor': 'top',
              'text-ignore-placement': true,
              'text-allow-overlap': true
            },
            paint: {
              'text-color': layer.aircraftColors && Object.keys(layer.aircraftColors).length > 0 
                ? ['match', ['to-string', ['get', 'icao24']], ...Object.entries(layer.aircraftColors).flat(), layer.globalAircraftColor || '#ffffff'] as any
                : (layer.globalAircraftColor || '#ffffff'),
              'text-opacity': selectedAircraftId 
                ? ['case', ['==', ['to-string', ['get', 'icao24']], selectedAircraftId], 1.0, 0.5]
                : 1.0
            }
          }, firstSymbolId);
        } else if (layer.type === 'vessels') {
          map.addLayer({
            id: layerId,
            type: 'symbol',
            source: sourceId,
            layout: {
              visibility: layer.visible ? 'visible' : 'none',
              'icon-image': ['coalesce', ['get', 'icon'], 'ship-still'],
              'icon-size': [
                'interpolate', ['linear'], ['zoom'],
                3, 0.55,
                8, 0.85,
                13, 1.2
              ],
              'icon-rotate': ['get', 'heading'],
              'icon-rotation-alignment': 'map',
              'icon-allow-overlap': true,
              'icon-ignore-placement': true,
              'text-field': ['step', ['zoom'], '', 9, ['get', 'name']],
              'text-size': 9,
              'text-offset': [0, 1.5],
              'text-anchor': 'top',
              'text-allow-overlap': false,
              'text-ignore-placement': false
            },
            paint: {
              'icon-opacity': selectedVesselMmsi 
                ? ['case', ['==', ['to-string', ['get', 'mmsi']], selectedVesselMmsi], 1.0, 0.5]
                : 1.0,
              'icon-color': layer.vesselColors && Object.keys(layer.vesselColors).length > 0 
                ? [
                    'match', 
                    ['to-string', ['get', 'mmsi']], 
                    ...Object.entries(layer.vesselColors).flat(),
                    layer.globalVesselColor || '#ffffff'
                  ] 
                : (layer.globalVesselColor || '#ffffff') as any,
              'text-color': '#ffffff',
              'text-opacity': ['interpolate', ['linear'], ['zoom'], 9, 0, 10, 1]
            }
          }, firstSymbolId);
        }
      } else if (map.getLayer(layerId)) {
        map.setLayoutProperty(layerId, 'visibility', layer.visible ? 'visible' : 'none');
        if (layer.type === 'nighttime') {
          setLayerFade(layerId, 'fill', layer._effectiveOpacityVisible ?? true, layer.opacity ?? 0.5, layer.visible);
        } else if (layer.type === 'raster' || layer.type === 'satellite') {
          const bMin = layer.brightness !== undefined && layer.brightness > 0 ? layer.brightness : 0;
          const bMax = layer.brightness !== undefined && layer.brightness < 0 ? 1 + layer.brightness : 1;
          setLayerFade(layerId, 'raster', layer._effectiveOpacityVisible ?? true, layer.opacity ?? 1.0, layer.visible);
          map.setPaintProperty(layerId, 'raster-contrast', layer.contrast ?? 0);
          map.setPaintProperty(layerId, 'raster-saturation', layer.saturation ?? 0);
          map.setPaintProperty(layerId, 'raster-hue-rotate', layer.hue ?? 0);
          map.setPaintProperty(layerId, 'raster-brightness-min', bMin);
          map.setPaintProperty(layerId, 'raster-brightness-max', bMax);
        } else if (layer.type === 'flights') {
          const colorExp = layer.aircraftColors && Object.keys(layer.aircraftColors).length > 0 
            ? [
                'match', 
                ['to-string', ['get', 'icao24']], 
                ...Object.entries(layer.aircraftColors).flat(),
                layer.globalAircraftColor || '#ffffff'
              ] 
            : (layer.globalAircraftColor || '#ffffff');
            
          const iconOpacityBase = selectedAircraftId 
            ? ['case', ['==', ['to-string', ['get', 'icao24']], selectedAircraftId], 1.0, 0.5]
            : 1.0;
          setLayerFade(layerId, 'icon', layer._effectiveOpacityVisible ?? true, iconOpacityBase, layer.visible);
          map.setPaintProperty(layerId, 'icon-color', colorExp as any);
          
          if (map.getLayer(`${layerId}-labels`)) {
            map.setLayoutProperty(`${layerId}-labels`, 'visibility', layer.visible && layer.showCallsigns ? 'visible' : 'none');
            const labelOpacityBase = selectedAircraftId 
              ? ['case', ['==', ['to-string', ['get', 'icao24']], selectedAircraftId], 1.0, 0.5]
              : 1.0;
            setLayerFade(`${layerId}-labels`, 'text', layer._effectiveOpacityVisible ?? true, labelOpacityBase, layer.visible);
            map.setPaintProperty(`${layerId}-labels`, 'text-color', colorExp as any);
          } else if (layer.showCallsigns) {
            const firstSymbolId = map.getStyle().layers?.find(l => l.type === 'symbol')?.id;
            map.addLayer({
              id: `${layerId}-labels`,
              type: 'symbol',
              source: `dynamic-source-${layer.id}`,
              layout: {
                visibility: layer.visible ? 'visible' : 'none',
                'text-field': ['case', ['==', ['get', 'callsign'], ''], ['get', 'icao24'], ['get', 'callsign']],
                'text-font': fallbackFont,
                'text-size': 10,
                'text-offset': [0, 1.5],
                'text-anchor': 'top',
                'text-ignore-placement': true,
                'text-allow-overlap': true
              },
              paint: {
                'text-color': colorExp as any,
                'text-opacity': selectedAircraftId 
                  ? ['case', ['==', ['to-string', ['get', 'icao24']], selectedAircraftId], 1.0, 0.5]
                  : 1.0
              }
            }, firstSymbolId);
          }
        } else if (layer.type === 'wildfires') {
          if (map.getLayer(`${layerId}-effis`)) {
            setLayerFade(`${layerId}-effis`, 'raster', layer._effectiveOpacityVisible ?? true, layer.opacity ?? 0.75, layer.visible);
            map.setLayoutProperty(`${layerId}-effis`, 'visibility', layer.visible ? 'visible' : 'none');
          }
        } else if (layer.type === 'gdacs_earthquakes' || layer.type === 'gdacs_volcanoes') {
          if (map.getLayer(layerId)) {
            setLayerFade(layerId, 'circle', layer._effectiveOpacityVisible ?? true, layer.opacity ?? 0.8, layer.visible);
            map.setLayoutProperty(layerId, 'visibility', layer.visible ? 'visible' : 'none');
          }
          if (map.getLayer(`${layerId}-label`)) {
            setLayerFade(`${layerId}-label`, 'text', layer._effectiveOpacityVisible ?? true, 1.0, layer.visible);
            map.setLayoutProperty(`${layerId}-label`, 'visibility', layer.visible ? 'visible' : 'none');
          }
        } else if (layer.type === 'cems_rapid_mapping') {
          if (map.getLayer(layerId)) {
            setLayerFade(layerId, 'circle', layer._effectiveOpacityVisible ?? true, layer.opacity ?? 0.8, layer.visible);
            map.setLayoutProperty(layerId, 'visibility', layer.visible ? 'visible' : 'none');
          }
          if (map.getLayer(`${layerId}-label`)) {
            setLayerFade(`${layerId}-label`, 'text', layer._effectiveOpacityVisible ?? true, 1.0, layer.visible);
            map.setLayoutProperty(`${layerId}-label`, 'visibility', layer.visible ? 'visible' : 'none');
          }
        } else if (layer.type === 'deepstate') {
          setLayerFade(layerId, 'fill', layer._effectiveOpacityVisible ?? true, layer.opacity ?? 0.5, layer.visible);
        }
        
        if (layer.type === 'flights') {
          if (map.getLayer('selected-flight-track-layer')) {
            const opacity = layer.flightpathOpacity ?? 0.8;
            const colorExp = layer.aircraftColors && Object.keys(layer.aircraftColors).length > 0 
              ? [
                  'match', 
                  selectedAircraftId || '', 
                  ...Object.entries(layer.aircraftColors).flat(),
                  layer.globalAircraftColor || '#ffffff'
                ] 
              : (layer.globalAircraftColor || '#ffffff');
              
            map.setPaintProperty('selected-flight-track-layer', 'line-opacity', opacity);
            map.setPaintProperty('selected-flight-track-layer', 'line-color', colorExp as any);
          }
        } else if (layer.type === 'vessels') {
          const colorExp = layer.vesselColors && Object.keys(layer.vesselColors).length > 0 
            ? [
                'match', 
                ['to-string', ['get', 'mmsi']], 
                ...Object.entries(layer.vesselColors).flat(),
                layer.globalVesselColor || '#ffffff'
              ] 
            : (layer.globalVesselColor || '#ffffff');
            
          const iconOpacityBase = selectedVesselMmsi 
            ? ['case', ['==', ['to-string', ['get', 'mmsi']], selectedVesselMmsi], 1.0, 0.5]
            : 1.0;
          setLayerFade(layerId, 'icon', layer._effectiveOpacityVisible ?? true, iconOpacityBase, layer.visible);
          map.setPaintProperty(layerId, 'icon-color', colorExp as any);
          
          if (map.getLayer('selected-vessel-track-layer')) {
            const trackColorExp = layer.vesselColors && Object.keys(layer.vesselColors).length > 0 
              ? [
                  'match', 
                  selectedVesselMmsi || '', 
                  ...Object.entries(layer.vesselColors).flat(),
                  layer.globalVesselColor || '#ffffff'
                ] 
              : (layer.globalVesselColor || '#ffffff');
              
            map.setPaintProperty('selected-vessel-track-layer', 'line-color', trackColorExp as any);
          }
        }
        
        if (layer.type === 'geojson') {
          if (map.getLayer(layerId)) {
            setLayerFade(layerId, 'fill', layer._effectiveOpacityVisible ?? true, ['coalesce', ['get', 'fillOpacity'], 0.5], layer.visible);
          }
        }

        if (map.getLayer(lineId)) {
          map.setLayoutProperty(lineId, 'visibility', layer.visible ? 'visible' : 'none');
          if (layer.type === 'geojson') {
            setLayerFade(lineId, 'line', layer._effectiveOpacityVisible ?? true, ['coalesce', ['get', 'lineOpacity'], 1.0], layer.visible);
          }
        }
      }

      // Fetch data for deepstate if needed
      if (layer.type === 'deepstate') {
        const { effectiveStartDate: targetDate } = getEffectiveLayerDates(layer);
        
        const cacheKey = `${layer.id}-${targetDate}`;
        if (deepstateDataCacheRef.current[cacheKey]) {
          const source = map.getSource(sourceId) as maplibregl.GeoJSONSource;
          if (source) source.setData(deepstateDataCacheRef.current[cacheKey]);
        } else {
          (async () => {
            try {
              let url = `/api.php?action=deepstate_geojson&id=${targetDate}`;
              if (targetDate.length === 10) {
                if (!globalDeepstateHistory) {
                  if (!globalDeepstateHistoryPromise) {
                    globalDeepstateHistoryPromise = fetch('/api.php?action=deepstate_history')
                      .then(r => r.json())
                      .catch(e => {
                        console.error('Failed to fetch deepstate history', e);
                        return null;
                      });
                  }
                  globalDeepstateHistory = await globalDeepstateHistoryPromise;
                  if (globalDeepstateHistory && !Array.isArray(globalDeepstateHistory)) {
                    console.error('Deepstate API returned non-array response:', globalDeepstateHistory);
                    globalDeepstateHistory = null;
                    throw new Error('DeepStateMap API requires authentication (401 Unauthorized) or returned invalid data.');
                  }
                }
                let history = globalDeepstateHistory;
                if (!history && globalDeepstateHistoryPromise) {
                  await globalDeepstateHistoryPromise;
                  history = globalDeepstateHistory;
                }
                if (!history) throw new Error('No history available');
                const entriesForDate = history.filter((entry: any) => entry.createdAt.startsWith(targetDate));
                let targetId: number = entriesForDate.length > 0 ? entriesForDate[entriesForDate.length - 1].id : 0;
                if (targetId === 0) {
                  const pastEntries = history.filter((entry: any) => entry.createdAt < targetDate);
                  if (pastEntries.length > 0) targetId = pastEntries[pastEntries.length - 1].id;
                  else throw new Error('No data found for this date');
                }
                url = `/api.php?action=deepstate_geojson&id=${targetId}`;
              }
              const res = await fetch(url);
              if (!res.ok) throw new Error(`Failed to fetch deepstate data: ${res.statusText}`);
              const data = await res.json();
              const geojsonData = data.map ? data.map : data;
              if (geojsonData && geojsonData.features) {
                const ignoredTerms = [
                  'geoJSON.territories.estonia',
                  'geoJSON.territories.pechorsky-district',
                  'geoJSON.territories.latvia',
                  'geoJSON.territories.belarus'
                ];
                const filteredFeatures = geojsonData.features.filter((f: any) => {
                  const isPolygon = f.geometry?.type === 'Polygon' || f.geometry?.type === 'MultiPolygon';
                  if (!isPolygon) return false;
                  const name = f.properties?.name || '';
                  return !(typeof name === 'string' && ignoredTerms.some(term => name.includes(term)));
                });
                const polygonsOnly = {
                  ...geojsonData,
                  features: filteredFeatures
                };
                deepstateDataCacheRef.current[cacheKey] = polygonsOnly;
                const source = map.getSource(sourceId) as maplibregl.GeoJSONSource;
                if (source) source.setData(polygonsOnly);
              }
            } catch (err) {
              console.error(`Error fetching deepstate for date ${targetDate}:`, err);
              const emptyData = { type: 'FeatureCollection' as const, features: [] };
              deepstateDataCacheRef.current[cacheKey] = emptyData;
              const source = map.getSource(sourceId) as maplibregl.GeoJSONSource;
              if (source) source.setData(emptyData);
            }
          })();
        }
      }

    });

    // Fetch data for GDACS if needed
    for (const layer of layers) {
      if (!layer.visible) continue;
      if (layer.type.startsWith('gdacs_') || layer.type === 'cems_rapid_mapping') {
        const sourceId = `dynamic-source-${layer.id}`;
        let { effectiveStartDate: startDate, effectiveEndDate: endDate } = getEffectiveLayerDates(layer);
        const cacheKey = `${layer.type}-${startDate}-${endDate}`;
        if (gdacsDataCacheRef.current[cacheKey]) {
          const source = map.getSource(sourceId) as maplibregl.GeoJSONSource;
          if (source) source.setData(gdacsDataCacheRef.current[cacheKey]);
        } else {
          (async () => {
            try {
              let geojsonData: any = { type: 'FeatureCollection', features: [] };
              if (layer.type === 'cems_rapid_mapping') {
                const url = `https://rapidmapping.emergency.copernicus.eu/backend/dashboard-api/public-activations-info/?limit=50`;
                const res = await fetch(url);
                if (!res.ok) throw new Error(`Failed to fetch CEMS data`);
                const data = await res.json();
                if (data && data.results) {
                  geojsonData.features = data.results
                    .filter((act: any) => act.category === 'Earthquake')
                    .map((act: any) => {
                      const geom = parseWKT(act.centroid);
                      if (!geom) return null;
                      return {
                        type: 'Feature',
                        geometry: geom.geometry,
                        properties: {
                          ...act,
                        }
                      };
                    }).filter(Boolean);
                }
              } else {
                const eventlist = layer.type.includes('earthquake') || layer.type.includes('shakemap') ? 'EQ' : layer.type === 'gdacs_cyclones' ? 'TC' : 'VO';
                const url = `https://www.gdacs.org/gdacsapi/api/Events/geteventlist/search?eventlist=${eventlist}&fromDate=${startDate}&toDate=${endDate}`;
                const res = await fetch(url);
                if (!res.ok) throw new Error(`Failed to fetch GDACS data: ${res.statusText}`);
                const text = await res.text();
                const data = text ? JSON.parse(text) : { type: 'FeatureCollection', features: [] };
                geojsonData = data;

              if (geojsonData && geojsonData.features) {
                geojsonData.features.forEach((f: any) => {
                  if (f.properties) {
                    f.properties.severity_numeric = f.properties.severitydata?.severity ?? f.properties.severity ?? 0;
                  }
                });

                const isPolygonLayer = layer.type === 'gdacs_cyclones';
                if (isPolygonLayer) {
                  const polygonPromises = geojsonData.features.map(async (feature: any) => {
                    const { eventtype, eventid, episodeid } = feature.properties;
                    try {
                      const geomRes = await fetch(`https://www.gdacs.org/gdacsapi/api/polygons/getgeometry?eventtype=${eventtype}&eventid=${eventid}&episodeid=${episodeid}`);
                      if (geomRes.ok) {
                        const geomData = await geomRes.json();
                        if (geomData && geomData.features) {
                          return geomData.features;
                        }
                      }
                    } catch (e) {
                      console.warn('Failed to fetch polygon for', eventid);
                    }
                    return [feature];
                  });
                  const allPolygons = await Promise.all(polygonPromises);
                  geojsonData.features = allPolygons.flat();
                }
              }
            }
            gdacsDataCacheRef.current[cacheKey] = geojsonData;
              const map = mapRef.current;
              if (map && map.getSource(sourceId)) {
                (map.getSource(sourceId) as maplibregl.GeoJSONSource).setData(geojsonData);
              }
            } catch (err) {
              console.error(`Error fetching GDACS for type ${layer.type}:`, err);
              const emptyData = { type: 'FeatureCollection' as const, features: [] };
              gdacsDataCacheRef.current[cacheKey] = emptyData;
              const map = mapRef.current;
              if (map && map.getSource(sourceId)) {
                (map.getSource(sourceId) as maplibregl.GeoJSONSource).setData(emptyData);
              }
            }
          })();
        }
      }
    }

    // Reorder layers dynamically. Iterate backwards to place the bottom-most layer right before firstAdminId.
    for (let i = layers.length - 1; i >= 0; i--) {
      const layer = layers[i];
      const idsToMoveAdmin: string[] = [];
      const idsToMoveTop: string[] = [];
      
      if (layer.type === 'weather_forecast') {
        idsToMoveTop.push(...weatherForecastLayerIdsRef.current);
      } else if (layer.type === 'wildfires') {
        idsToMoveTop.push('active-wildfire-cems-vt-lines');
        idsToMoveTop.push('active-wildfire-cems-vt-points');
        idsToMoveAdmin.push('active-wildfire-cems-vt-extent');
        idsToMoveAdmin.push('active-wildfire-cems-vt-polygons');
        idsToMoveTop.push('active-flood-cems-vt-lines');
        idsToMoveTop.push('active-flood-cems-vt-points');
        idsToMoveAdmin.push('active-flood-cems-vt-extent');
        idsToMoveAdmin.push('active-flood-cems-vt-polygons');
        idsToMoveAdmin.push(`dynamic-layer-${layer.id}-effis`);
      } else if (layer.type === 'gdacs_earthquakes' || layer.type === 'cems_rapid_mapping') {
        idsToMoveAdmin.push('selected-earthquake-shakemap-fill');
        idsToMoveAdmin.push('selected-earthquake-shakemap-line');
        idsToMoveAdmin.push('selected-usgs-dyfi-10km-fill');
        idsToMoveAdmin.push('selected-usgs-dyfi-1km-fill');
        idsToMoveAdmin.push('selected-usgs-landslide-raster');
        idsToMoveAdmin.push('selected-usgs-liquefaction-raster');
        idsToMoveAdmin.push('selected-cems-vt-extent');
        idsToMoveAdmin.push('selected-cems-vt-polygons');
        idsToMoveAdmin.push('selected-cems-vt-lines');
        idsToMoveTop.push(`dynamic-layer-${layer.id}`); // circles on top
        if (map.getLayer(`dynamic-layer-${layer.id}-label`)) {
          idsToMoveTop.push(`dynamic-layer-${layer.id}-label`); // labels on top
        }
      } else if (layer.type === 'gdacs_volcanoes') {
        idsToMoveAdmin.push('selected-volcano-polygon-fill');
        idsToMoveAdmin.push('selected-volcano-polygon-line');
        idsToMoveTop.push(`dynamic-layer-${layer.id}`); // circles on top
      } else {
        idsToMoveAdmin.push(`dynamic-layer-${layer.id}`);
        if (map.getLayer(`dynamic-line-${layer.id}`)) {
          idsToMoveAdmin.push(`dynamic-line-${layer.id}`);
        }
      }
      
      idsToMoveAdmin.forEach(id => {
        if (map.getLayer(id)) {
          try {
            map.moveLayer(id, firstAdminId);
          } catch (e) {}
        }
      });
      idsToMoveTop.forEach(id => {
        if (map.getLayer(id)) {
          try {
            map.moveLayer(id); // push to very top
          } catch (e) {}
        }
      });
    }

    return () => {
      // Cleanup dynamically created raster layers that were removed from settings
      // We don't remove copernicus or deepstate sources to avoid reload flashes
    };
  }, [settings.layers, activeTool, revealedTriggers, hiddenTriggers, mapLoaded, selectedAircraftId, selectedVesselMmsi, selectedWeatherTime, weatherValidTimes, selectedEarthquake, selectedVolcano, selectedEarthquakeShakemap, selectedVolcanoPolygon, selectedCemsEarthquake, selectedCemsEarthquakeFeatures]);

  // Fetch weather data for visible cities
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    const weatherLayer = settings.layers.find(l => l.type === 'weather_forecast');
    if (!weatherLayer || !weatherLayer.visible || (weatherLayer.showCityTemperatures === false && weatherLayer.showCityWeatherIcons === false)) return;

    let isActive = true;

    const updateCities = async () => {
      if (!isActive) return;
      const features = map.queryRenderedFeatures({ layers: ['label_city', 'label_city_capital'] });
      if (features.length === 0) return;

      const citiesToFetch = new Map<string, { x: number, y: number, name: string }>();
      
      for (const f of features) {
        if (!f.properties || !f.properties.name) continue;
        const name = f.properties.name;
        
        if (weatherCityFetchCacheRef.current.has(name)) continue;
        
        if (f.geometry.type === 'Point') {
          const coords = f.geometry.coordinates as [number, number];
          const x = coords[0];
          const y = coords[1];
          
          if (weatherLayer.limitCityWeatherToGermany) {
            if (x < 5.86 || x > 15.04 || y < 47.27 || y > 55.08) continue;
            
            const EXCLUDED_NON_GERMAN_CITIES = new Set([
              'Prague', 'Prag', 'Praha', 'Plzeň', 'Karlovy Vary', 'Ústí nad Labem', 'Liberec', 'Děčín', 'České Budějovice',
              'Salzburg', 'Linz', 'Innsbruck', 'Bregenz', 'Vienna', 'Wien',
              'Zürich', 'Zurich', 'Basel', 'St. Gallen', 'Winterthur', 'Schaffhausen', 'Bern',
              'Strasbourg', 'Straßburg', 'Mulhouse', 'Colmar', 'Metz', 'Nancy',
              'Luxembourg', 'Luxemburg',
              'Liège', 'Lüttich', 'Brussels', 'Brüssel',
              'Maastricht', 'Eindhoven', 'Enschede', 'Groningen', 'Amsterdam', 'Rotterdam',
              'Szczecin', 'Stettin', 'Zielona Góra', 'Gorzów Wielkopolski', 'Poznań', 'Posen', 'Wrocław', 'Breslau',
              'Odense', 'Copenhagen', 'Kopenhagen'
            ]);
            
            if (EXCLUDED_NON_GERMAN_CITIES.has(name)) continue;
            
            // Also check standard ISO properties if present
            if (f.properties.iso_a2 && f.properties.iso_a2 !== 'DE') continue;
            if (f.properties.iso_3166_1 && f.properties.iso_3166_1 !== 'DE') continue;
            if (f.properties.country_code && f.properties.country_code !== 'DE') continue;
          }
          
          citiesToFetch.set(name, { x, y, name });
        }
        
        if (citiesToFetch.size >= 20) break;
      }

      if (citiesToFetch.size === 0) return;

      const citiesArray = Array.from(citiesToFetch.values());
      const lats = citiesArray.map(c => c.y).join(',');
      const lons = citiesArray.map(c => c.x).join(',');

      citiesArray.forEach(c => weatherCityFetchCacheRef.current.add(c.name));

      try {
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lons}&daily=temperature_2m_max,weather_code&timezone=auto`;
        const res = await fetchOpenMeteo(url);
        if (!res.ok) throw new Error(`Failed to fetch weather for cities: ${res.statusText}`);
        
        const data = await res.json();
        const results = Array.isArray(data) ? data : [data];
        
        if (!isActive) return;

        setWeatherCityData(prev => {
          const next = { ...prev };
          citiesArray.forEach((city, i) => {
            const locData = results[i];
            if (locData && locData.daily && locData.daily.temperature_2m_max) {
              next[city.name] = { 
                ...city, 
                temps: locData.daily.temperature_2m_max,
                codes: locData.daily.weather_code,
                times: locData.daily.time
              };
            }
          });
          return next;
        });
      } catch (err) {
        console.error('Error fetching city weather:', err);
      }
    };

    const debounceTimer = setTimeout(updateCities, 500);
    
    const onMoveEnd = () => {
      setTimeout(updateCities, 300);
    };
    
    map.on('moveend', onMoveEnd);
    
    return () => {
      isActive = false;
      clearTimeout(debounceTimer);
      map.off('moveend', onMoveEnd);
    };
  }, [mapLoaded, settings.layers]);

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

  // Polling for flights
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    const flightsLayer = settings.layers.find(l => l.type === 'flights');
    if (!flightsLayer || !flightsLayer.visible) return;

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

        }
        
        const features = (data.states || []).map((state: any) => {
          const lon = state[5];
          const lat = state[6];
          const true_track = state[10];
          if (lon === null || lat === null) return null;
          
          let category = Number(state[17]) || 0;

          if (state[0] === selectedAircraftIdRef.current) {
            const lastPt = selectedFlightTrackRef.current[selectedFlightTrackRef.current.length - 1];
            if (!lastPt || lastPt[0] !== lon || lastPt[1] !== lat) {
              selectedFlightTrackRef.current = [...selectedFlightTrackRef.current, [lon, lat]];
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

    fetchFlights();
    return () => {
      isActive = false;
      clearTimeout(timeoutId);
    };
  }, [settings.layers, mapLoaded]);

  // Polling for vessels
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    const vesselsLayer = settings.layers.find(l => l.type === 'vessels');
    if (!vesselsLayer || !vesselsLayer.visible) {
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
        wsRef.current = null;
      }
      return;
    }

    const apiKey = settings.aisstreamCredentials?.apiKey;
    if (!apiKey) return;

    let resubTimer: ReturnType<typeof setTimeout> | null = null;
    let flushTimer: ReturnType<typeof setInterval> | null = null;
    let reconnectDelay = 3000;
    let isDirty = false;

    const subscribe = () => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
      const b = map.getBounds();
      if (!b) return;
      const BOUNDS_PAD = 2;
      const s = Math.max(-90, b.getSouth() - BOUNDS_PAD);
      const n = Math.min(90, b.getNorth() + BOUNDS_PAD);
      const w = Math.max(-180, b.getWest() - BOUNDS_PAD);
      const e = Math.min(180, b.getEast() + BOUNDS_PAD);
      wsRef.current.send(JSON.stringify({
        APIKey: apiKey,
        BoundingBoxes: [[[s, w], [n, e]]],
        FilterMessageTypes: ['PositionReport', 'ShipStaticData']
      }));
    };

    const scheduleResub = () => {
      if (resubTimer) clearTimeout(resubTimer);
      resubTimer = setTimeout(() => {
        if (wsRef.current) {
          wsRef.current.onclose = null; // Prevent the auto-reconnect loop
          wsRef.current.close();
          wsRef.current = null;
        }
        connect();
      }, 1000); // Wait 1s after map stops moving to avoid connection spam
    };

    const updateVesselPopup = (v: any) => {
      if (!vesselPopupRef.current) return;
      const spd = v.sog != null ? Math.round(v.sog) + 'kn' : 'N/A';
      const hdg = v.heading != null ? Math.round(v.heading) + '°' : 'N/A';
      const flag = getMmsiFlagHtml(v.mmsi);
      const popupHtml = `
        <div style="background-color: #09090b; padding: 12px; border-radius: 0; color: white; font-family: ui-sans-serif, system-ui, sans-serif; font-size: 11px; min-width: 180px; text-transform: uppercase;">
          <div style="font-size: 14px; font-weight: 700; margin-bottom: 8px; color: #ffffff; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 4px;">
            <span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${v.name || 'UNKNOWN'}</span>
            <span style="font-size: 16px; margin-left: 8px;">${flag}</span>
          </div>
          <div style="display: grid; grid-template-columns: 40px 1fr; gap: 6px; font-weight: 500;">
            <span style="color: rgba(255,255,255,0.5);">MMSI:</span> <span style="text-align: right; font-family: monospace;">${v.mmsi}</span>
            <span style="color: rgba(255,255,255,0.5);">CALL:</span> <span style="text-align: right; font-family: monospace;">${v.callSign || 'N/A'}</span>
            <span style="color: rgba(255,255,255,0.5);">DEST:</span> <span style="text-align: right; font-family: monospace; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${v.destination || 'N/A'}</span>
            <span style="color: rgba(255,255,255,0.5);">SPD:</span> <span style="text-align: right; font-family: monospace;">${spd}</span>
            <span style="color: rgba(255,255,255,0.5);">HDG:</span> <span style="text-align: right; font-family: monospace;">${hdg}</span>
          </div>
        </div>
      `;
      // Ensure popup styles are applied
      const style = document.getElementById('flight-popup-style') || document.createElement('style');
      style.id = 'flight-popup-style';
      style.innerHTML = '.flight-popup .maplibregl-popup-content { padding: 0; background: transparent; box-shadow: none; } .flight-popup .maplibregl-popup-tip { border-top-color: #09090b; }';
      if (!document.getElementById('flight-popup-style')) document.head.appendChild(style);
      
      vesselPopupRef.current.setHTML(popupHtml);
    };

    const startFlush = () => {
      if (flushTimer) clearInterval(flushTimer);
      flushTimer = setInterval(() => {
        if (!isDirty) return;
        isDirty = false;
        
        // Prune old vessels (10 mins)
        const now = Date.now();
        for (const [mmsi, v] of vesselsRef.current.entries()) {
          if (now - v.lastUpdate > 10 * 60 * 1000) {
            vesselsRef.current.delete(mmsi);
            isDirty = true;
          }
        }

        const features: GeoJSON.Feature[] = [];
        for (const v of vesselsRef.current.values()) {
          if (v.lat == null || v.lon == null) continue;
          features.push({
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [v.lon, v.lat] },
            properties: {
              mmsi: v.mmsi,
              name: v.name || v.mmsi,
              sog: v.sog ?? null,
              cog: v.cog ?? null,
              heading: v.heading ?? 0,
              navStatus: v.navStatus ?? null,
              callSign: v.callSign || null,
              destination: v.destination || null,
              shipType: v.shipType ?? null,
              icon: v.icon || 'ship-fast'
            }
          });
          
          if (vesselPopupRef.current && activeVesselMmsiRef.current === v.mmsi) {
             vesselPopupRef.current.setLngLat([v.lon, v.lat]);
             updateVesselPopup(v);
          }
        }
        
        const sourceId = `dynamic-source-${vesselsLayer.id}`;
        const source = map.getSource(sourceId) as maplibregl.GeoJSONSource;
        if (source) source.setData({ type: 'FeatureCollection', features });

        // Update selected vessel track
        const trackSource = map.getSource('selected-vessel-track') as maplibregl.GeoJSONSource;
        if (trackSource) {
          if (activeVesselMmsiRef.current && vesselsRef.current.has(activeVesselMmsiRef.current)) {
            const activeVessel = vesselsRef.current.get(activeVesselMmsiRef.current);
            if (activeVessel && activeVessel.track && activeVessel.track.length > 1) {
              trackSource.setData({
                type: 'FeatureCollection',
                features: [{
                  type: 'Feature',
                  geometry: { type: 'LineString', coordinates: activeVessel.track },
                  properties: {}
                }]
              });
            } else {
              trackSource.setData({ type: 'FeatureCollection', features: [] });
            }
          } else {
            trackSource.setData({ type: 'FeatureCollection', features: [] });
          }
        }
      }, 1000);
    };

    const handleMsg = (msg: any) => {
      const meta = msg.MetaData;
      if (!meta) return;
      const mmsi = String(meta.MMSI ?? meta.mmsi ?? '');
      if (!mmsi) return;

      if (msg.MessageType === 'PositionReport') {
        const pr = msg.Message?.PositionReport ?? {};
        const lat = meta.latitude ?? pr.Latitude;
        const lon = meta.longitude ?? pr.Longitude;
        if (lat == null || lon == null) return;
        const sog = pr.Sog ?? 0;
        const cog = pr.Cog ?? 0;
        const hdg = (pr.TrueHeading != null && pr.TrueHeading !== 511) ? pr.TrueHeading : cog;
        const prev = vesselsRef.current.get(mmsi) ?? {};
        const track = prev.track || [];
        if (track.length === 0 || track[track.length - 1][0] !== lon || track[track.length - 1][1] !== lat) {
          track.push([lon, lat]);
          if (track.length > 500) track.shift(); // Keep max 500 points
        }
        vesselsRef.current.set(mmsi, {
          ...prev, mmsi, lat, lon, sog, cog, heading: hdg, track,
          navStatus: pr.NavigationalStatus ?? prev.navStatus,
          name: (meta.ShipName?.trim() || prev.name || mmsi),
          lastUpdate: Date.now(),
          icon: sog > 3 ? 'ship-fast' : sog > 0.5 ? 'ship-slow' : 'ship-still'
        });
        isDirty = true;
      } else if (msg.MessageType === 'ShipStaticData') {
        const sd = msg.Message?.ShipStaticData ?? {};
        const prev = vesselsRef.current.get(mmsi) ?? { mmsi, lastUpdate: Date.now(), icon: 'ship-still' };
        vesselsRef.current.set(mmsi, {
          ...prev,
          name: ((sd.Name || meta.ShipName || prev.name || mmsi).trim()),
          callSign: sd.CallSign?.trim() || prev.callSign,
          imo: sd.ImoNumber ?? prev.imo,
          shipType: sd.Type ?? prev.shipType,
          destination: sd.Destination?.trim() || prev.destination,
          draught: sd.MaximumStaticDraught ?? prev.draught,
        });
        isDirty = true;
      }
    };

    const connect = () => {
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
        wsRef.current = null;
      }
      try { wsRef.current = new WebSocket('wss://stream.aisstream.io/v0/stream'); }
      catch { return; }

      wsRef.current.onopen = () => {
        reconnectDelay = 3000;
        subscribe();
        startFlush();
      };

      wsRef.current.onmessage = async ({ data }) => {
        try {
          const text = data instanceof Blob ? await data.text() : data;
          const msg = JSON.parse(text);
          handleMsg(msg);
        } catch (e) {}
      };

      wsRef.current.onclose = () => {
        if (flushTimer) clearInterval(flushTimer);
        setTimeout(connect, reconnectDelay);
        reconnectDelay = Math.min(reconnectDelay * 1.5, 30000);
      };
    };

    connect();
    map.on('moveend', scheduleResub);

    return () => {
      map.off('moveend', scheduleResub);
      if (resubTimer) clearTimeout(resubTimer);
      if (flushTimer) clearInterval(flushTimer);
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [settings.layers, mapLoaded, settings.aisstreamCredentials]);

  // Fetch track when selectedAircraftId changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    
    const source = map.getSource('selected-flight-track') as maplibregl.GeoJSONSource;
    if (!source) return;

    if (!selectedAircraftId) {
      source.setData({ type: 'FeatureCollection', features: [] });
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
          const coordinates = data.path.map((pt: any) => [pt[2], pt[1]]); // longitude, latitude
          selectedFlightTrackRef.current = coordinates;
          source.setData({
            type: 'FeatureCollection',
            features: [{
              type: 'Feature',
              geometry: { type: 'LineString', coordinates },
              properties: {}
            }]
          });
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
  useEffect(() => {
    if (!selectedCemsEarthquake) {
      setSelectedCemsEarthquakeFeatures(null);
      return;
    }

    let isSubscribed = true;
    (async () => {
      try {
        const res = await fetch(`https://rapidmapping.emergency.copernicus.eu/backend/dashboard-api/public-activations/?code=${selectedCemsEarthquake.code}`);
        if (!res.ok) throw new Error('Failed to fetch detailed CEMS activation');
        const data = await res.json();
        
        const allFeatures: any[] = [];
        
        if (data && data.results && data.results.length > 0 && data.results[0].aois) {
          for (const aoi of data.results[0].aois) {
            // Also add AOI extent polygon
            if (aoi.extent) {
              const aoiGeom = parseWKT(aoi.extent);
              if (aoiGeom) {
                allFeatures.push({
                  type: 'Feature',
                  geometry: aoiGeom.geometry,
                  properties: { aoiName: aoi.aoiName, isExtent: true }
                });
              }
            }

            if (aoi.products) {
              // Find the latest product that actually contains VT layers!
const productsWithVt = aoi.products.filter((p: any) => p.layers && p.layers.some((l: any) => l.format === 'vt'));
const latestProduct = productsWithVt.length > 0 ? productsWithVt.sort((a: any, b: any) => (b.monitoringNumber || 0) - (a.monitoringNumber || 0))[0] : null;
                    const productsToProcess = latestProduct ? [latestProduct] : [];
                    for (const product of productsToProcess) {
                if (product.layers) {
                  for (const layer of product.layers) {
                    if (layer.format === 'vt' && layer.json) {
                      try {
                        const features = await safeFetchCemsJson(layer.json);
                        if (features && features.length) {
                          allFeatures.push(...features);
                        }
                      } catch (err) {
                        console.error('Failed to fetch CEMS VT layer', err);
                      }
                    }
                  }
                }
              }
            }
          }
        }
        
        if (isSubscribed) {
          setSelectedCemsEarthquakeFeatures({
            type: 'FeatureCollection',
            features: allFeatures
          });
        }
      } catch (err) {
        console.error('Error fetching CEMS details', err);
      }
    })();
    return () => { isSubscribed = false; };
  }, [selectedCemsEarthquake]);

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
  useEffect(() => {
    if (!selectedEarthquake) {
      setSelectedEarthquakeShakemap(null);
      return;
    }

    let isSubscribed = true;
    (async () => {
      try {
        const polyRes = await fetch(selectedEarthquake.geomUrl.replace('http:', 'https:'));
        if (!polyRes.ok) throw new Error('Failed to fetch shakemap');
        const polyData = await polyRes.json();
        if (isSubscribed) {
          setSelectedEarthquakeShakemap(polyData);
        }
      } catch (err) {
        console.error('Error fetching shakemap for selected earthquake:', err);
        if (isSubscribed) {
          setSelectedEarthquakeShakemap(null);
        }
      }
    })();

    return () => { isSubscribed = false; };
  }, [selectedEarthquake]);

  // Fetch USGS overlays when selectedEarthquakeShakemap changes
  useEffect(() => {
    if (!selectedEarthquakeShakemap || !selectedEarthquakeShakemap.features || selectedEarthquakeShakemap.features.length === 0) {
      setSelectedEarthquakeUsgsDyfi10km(null);
      setSelectedEarthquakeUsgsDyfi1km(null);
      setSelectedEarthquakeUsgsLandslide(null);
      setSelectedEarthquakeUsgsLiquefaction(null);
      return;
    }

    let isSubscribed = true;
    (async () => {
      try {
        const sourceId = selectedEarthquakeShakemap.features[0].properties?.sourceid;
        if (!sourceId) return;

        const res = await fetch(`https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&eventid=${sourceId}`);
        if (!res.ok) return; 
        const data = await res.json();
        
        if (!isSubscribed) return;

        const products = data.properties?.products;
        if (!products) return;

        const fixGeoJsonPolygons = (geoJson: any) => {
          if (!geoJson || !geoJson.features) return geoJson;
          const newFeatures = geoJson.features.map((feature: any) => {
            if (feature.geometry && (feature.geometry.type === 'Polygon' || feature.geometry.type === 'MultiPolygon')) {
              const coords = feature.geometry.coordinates;
              const fixRing = (ring: number[][]) => {
                if (ring.length > 0) {
                  const first = ring[0];
                  const last = ring[ring.length - 1];
                  if (first[0] !== last[0] || first[1] !== last[1]) {
                    ring.push([...first]);
                  }
                }
              };
              
              if (feature.geometry.type === 'Polygon') {
                coords.forEach(fixRing);
              } else {
                coords.forEach((polygon: any) => polygon.forEach(fixRing));
              }
            }
            return feature;
          });
          return { ...geoJson, features: newFeatures };
        };

        // DYFI 10km
        if (products.dyfi && products.dyfi[0]?.contents['dyfi_geo_10km.geojson']) {
          const dyfiRes = await fetch(products.dyfi[0].contents['dyfi_geo_10km.geojson'].url);
          if (dyfiRes.ok) {
            const dyfiData = await dyfiRes.json();
            if (isSubscribed) setSelectedEarthquakeUsgsDyfi10km(fixGeoJsonPolygons(dyfiData));
          }
        }

        // DYFI 1km
        if (products.dyfi && products.dyfi[0]?.contents['dyfi_geo_1km.geojson']) {
          const dyfiRes = await fetch(products.dyfi[0].contents['dyfi_geo_1km.geojson'].url);
          if (dyfiRes.ok) {
            const dyfiData = await dyfiRes.json();
            if (isSubscribed) setSelectedEarthquakeUsgsDyfi1km(fixGeoJsonPolygons(dyfiData));
          }
        }

        // Ground Failure
        if (products['ground-failure'] && products['ground-failure'][0]?.contents['info.json']) {
          const gfRes = await fetch(products['ground-failure'][0].contents['info.json'].url);
          if (gfRes.ok) {
            const gfData = await gfRes.json();
            
            // Landslide
            if (gfData.Landslides) {
              const preferred = gfData.Landslides.find((l: any) => l.preferred) || gfData.Landslides[0];
              if (preferred && preferred.overlay && preferred.extent) {
                const overlayUrl = products['ground-failure'][0].contents[preferred.overlay]?.url;
                if (overlayUrl && isSubscribed) {
                  setSelectedEarthquakeUsgsLandslide({ url: overlayUrl, extent: preferred.extent });
                }
              }
            }

            // Liquefaction
            if (gfData.Liquefaction) {
              const preferred = gfData.Liquefaction.find((l: any) => l.preferred) || gfData.Liquefaction[0];
              if (preferred && preferred.overlay && preferred.extent) {
                const overlayUrl = products['ground-failure'][0].contents[preferred.overlay]?.url;
                if (overlayUrl && isSubscribed) {
                  setSelectedEarthquakeUsgsLiquefaction({ url: overlayUrl, extent: preferred.extent });
                }
              }
            }
          }
        }
      } catch (err) {
        console.error('Error fetching USGS data:', err);
      }
    })();

    return () => { isSubscribed = false; };
  }, [selectedEarthquakeShakemap]);

  // Render USGS DYFI 10km
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    if (!map.getSource('selected-usgs-dyfi-10km-source')) {
      map.addSource('selected-usgs-dyfi-10km-source', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
      });

      const eqLayer = settings.layers.find(l => l.type === 'gdacs_earthquakes');
      const beforeId = (eqLayer && map.getLayer(`dynamic-layer-${eqLayer.id}`)) ? `dynamic-layer-${eqLayer.id}` : 'custom-polygons';

      map.addLayer({
        id: 'selected-usgs-dyfi-10km-fill',
        type: 'fill',
        source: 'selected-usgs-dyfi-10km-source',
        paint: {
          'fill-color': [
            'step',
            ['to-number', ['coalesce', ['get', 'cdi'], 0]],
            '#ffffff', 1,
            '#bfccff', 2,
            '#a0e6ff', 3,
            '#80ffff', 4,
            '#7aff93', 5,
            '#ffff00', 6,
            '#ffc800', 7,
            '#ff9100', 8,
            '#ff0000', 9,
            '#c80000'
          ],
          'fill-opacity': eqLayer?.usgsDyfi10kmOpacity ?? 0.6
        }
      }, beforeId);
    }

    const source = map.getSource('selected-usgs-dyfi-10km-source') as maplibregl.GeoJSONSource;
    if (source) {
      source.setData(selectedEarthquakeUsgsDyfi10km || { type: 'FeatureCollection', features: [] });
    }

    const eqLayer = settings.layers.find(l => l.type === 'gdacs_earthquakes');
    const visibility = eqLayer?.usgsDyfi10kmEnabled ? 'visible' : 'none';
    if (map.getLayer('selected-usgs-dyfi-10km-fill')) {
      map.setLayoutProperty('selected-usgs-dyfi-10km-fill', 'visibility', visibility);
      map.setPaintProperty('selected-usgs-dyfi-10km-fill', 'fill-opacity', eqLayer?.usgsDyfi10kmOpacity ?? 0.6);
    }
  }, [selectedEarthquakeUsgsDyfi10km, mapLoaded, settings.layers]);

  // Render USGS DYFI 1km
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    if (!map.getSource('selected-usgs-dyfi-1km-source')) {
      map.addSource('selected-usgs-dyfi-1km-source', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
      });

      const eqLayer = settings.layers.find(l => l.type === 'gdacs_earthquakes');
      const beforeId = (eqLayer && map.getLayer(`dynamic-layer-${eqLayer.id}`)) ? `dynamic-layer-${eqLayer.id}` : 'custom-polygons';

      map.addLayer({
        id: 'selected-usgs-dyfi-1km-fill',
        type: 'fill',
        source: 'selected-usgs-dyfi-1km-source',
        paint: {
          'fill-color': [
            'step',
            ['to-number', ['coalesce', ['get', 'cdi'], 0]],
            '#ffffff', 1,
            '#bfccff', 2,
            '#a0e6ff', 3,
            '#80ffff', 4,
            '#7aff93', 5,
            '#ffff00', 6,
            '#ffc800', 7,
            '#ff9100', 8,
            '#ff0000', 9,
            '#c80000'
          ],
          'fill-opacity': eqLayer?.usgsDyfi1kmOpacity ?? 0.6
        }
      }, beforeId);
    }

    const source = map.getSource('selected-usgs-dyfi-1km-source') as maplibregl.GeoJSONSource;
    if (source) {
      source.setData(selectedEarthquakeUsgsDyfi1km || { type: 'FeatureCollection', features: [] });
    }

    const eqLayer = settings.layers.find(l => l.type === 'gdacs_earthquakes');
    const visibility = eqLayer?.usgsDyfi1kmEnabled ? 'visible' : 'none';
    if (map.getLayer('selected-usgs-dyfi-1km-fill')) {
      map.setLayoutProperty('selected-usgs-dyfi-1km-fill', 'visibility', visibility);
      map.setPaintProperty('selected-usgs-dyfi-1km-fill', 'fill-opacity', eqLayer?.usgsDyfi1kmOpacity ?? 0.6);
    }
  }, [selectedEarthquakeUsgsDyfi1km, mapLoaded, settings.layers]);

  // Render USGS Landslide Overlay
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    if (!map.getSource('selected-usgs-landslide-source') && selectedEarthquakeUsgsLandslide) {
      map.addSource('selected-usgs-landslide-source', {
        type: 'image',
        url: selectedEarthquakeUsgsLandslide.url,
        coordinates: [
          [selectedEarthquakeUsgsLandslide.extent[0], selectedEarthquakeUsgsLandslide.extent[3]], // Top Left
          [selectedEarthquakeUsgsLandslide.extent[1], selectedEarthquakeUsgsLandslide.extent[3]], // Top Right
          [selectedEarthquakeUsgsLandslide.extent[1], selectedEarthquakeUsgsLandslide.extent[2]], // Bottom Right
          [selectedEarthquakeUsgsLandslide.extent[0], selectedEarthquakeUsgsLandslide.extent[2]]  // Bottom Left
        ]
      });

      const eqLayer = settings.layers.find(l => l.type === 'gdacs_earthquakes');
      const beforeId = (eqLayer && map.getLayer(`dynamic-layer-${eqLayer.id}`)) ? `dynamic-layer-${eqLayer.id}` : 'custom-polygons';

      map.addLayer({
        id: 'selected-usgs-landslide-raster',
        type: 'raster',
        source: 'selected-usgs-landslide-source',
        paint: {
          'raster-opacity': eqLayer?.usgsLandslideOpacity ?? 0.8
        }
      }, beforeId);
    } else if (map.getSource('selected-usgs-landslide-source') && selectedEarthquakeUsgsLandslide) {
      (map.getSource('selected-usgs-landslide-source') as any).updateImage({
        url: selectedEarthquakeUsgsLandslide.url,
        coordinates: [
          [selectedEarthquakeUsgsLandslide.extent[0], selectedEarthquakeUsgsLandslide.extent[3]],
          [selectedEarthquakeUsgsLandslide.extent[1], selectedEarthquakeUsgsLandslide.extent[3]],
          [selectedEarthquakeUsgsLandslide.extent[1], selectedEarthquakeUsgsLandslide.extent[2]],
          [selectedEarthquakeUsgsLandslide.extent[0], selectedEarthquakeUsgsLandslide.extent[2]]
        ]
      });
    }

    const eqLayer = settings.layers.find(l => l.type === 'gdacs_earthquakes');
    const visibility = (eqLayer?.usgsLandslideEnabled && selectedEarthquakeUsgsLandslide) ? 'visible' : 'none';
    if (map.getLayer('selected-usgs-landslide-raster')) {
      map.setLayoutProperty('selected-usgs-landslide-raster', 'visibility', visibility);
      map.setPaintProperty('selected-usgs-landslide-raster', 'raster-opacity', eqLayer?.usgsLandslideOpacity ?? 0.8);
      
      const bMin = eqLayer?.usgsLandslideBrightness !== undefined && eqLayer.usgsLandslideBrightness > 0 ? eqLayer.usgsLandslideBrightness : 0;
      const bMax = eqLayer?.usgsLandslideBrightness !== undefined && eqLayer.usgsLandslideBrightness < 0 ? 1 + eqLayer.usgsLandslideBrightness : 1;
      map.setPaintProperty('selected-usgs-landslide-raster', 'raster-brightness-min', bMin);
      map.setPaintProperty('selected-usgs-landslide-raster', 'raster-brightness-max', bMax);
      map.setPaintProperty('selected-usgs-landslide-raster', 'raster-contrast', eqLayer?.usgsLandslideContrast ?? 0);
      map.setPaintProperty('selected-usgs-landslide-raster', 'raster-saturation', eqLayer?.usgsLandslideSaturation ?? 0);
      map.setPaintProperty('selected-usgs-landslide-raster', 'raster-hue-rotate', eqLayer?.usgsLandslideHue ?? 0);
    }
  }, [selectedEarthquakeUsgsLandslide, mapLoaded, settings.layers]);

  // Render USGS Liquefaction Overlay
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    if (!map.getSource('selected-usgs-liquefaction-source') && selectedEarthquakeUsgsLiquefaction) {
      map.addSource('selected-usgs-liquefaction-source', {
        type: 'image',
        url: selectedEarthquakeUsgsLiquefaction.url,
        coordinates: [
          [selectedEarthquakeUsgsLiquefaction.extent[0], selectedEarthquakeUsgsLiquefaction.extent[3]], // Top Left
          [selectedEarthquakeUsgsLiquefaction.extent[1], selectedEarthquakeUsgsLiquefaction.extent[3]], // Top Right
          [selectedEarthquakeUsgsLiquefaction.extent[1], selectedEarthquakeUsgsLiquefaction.extent[2]], // Bottom Right
          [selectedEarthquakeUsgsLiquefaction.extent[0], selectedEarthquakeUsgsLiquefaction.extent[2]]  // Bottom Left
        ]
      });

      const eqLayer = settings.layers.find(l => l.type === 'gdacs_earthquakes');
      const beforeId = (eqLayer && map.getLayer(`dynamic-layer-${eqLayer.id}`)) ? `dynamic-layer-${eqLayer.id}` : 'custom-polygons';

      map.addLayer({
        id: 'selected-usgs-liquefaction-raster',
        type: 'raster',
        source: 'selected-usgs-liquefaction-source',
        paint: {
          'raster-opacity': eqLayer?.usgsLiquefactionOpacity ?? 0.8
        }
      }, beforeId);
    } else if (map.getSource('selected-usgs-liquefaction-source') && selectedEarthquakeUsgsLiquefaction) {
      (map.getSource('selected-usgs-liquefaction-source') as any).updateImage({
        url: selectedEarthquakeUsgsLiquefaction.url,
        coordinates: [
          [selectedEarthquakeUsgsLiquefaction.extent[0], selectedEarthquakeUsgsLiquefaction.extent[3]],
          [selectedEarthquakeUsgsLiquefaction.extent[1], selectedEarthquakeUsgsLiquefaction.extent[3]],
          [selectedEarthquakeUsgsLiquefaction.extent[1], selectedEarthquakeUsgsLiquefaction.extent[2]],
          [selectedEarthquakeUsgsLiquefaction.extent[0], selectedEarthquakeUsgsLiquefaction.extent[2]]
        ]
      });
    }

    const eqLayer = settings.layers.find(l => l.type === 'gdacs_earthquakes');
    const visibility = (eqLayer?.usgsLiquefactionEnabled && selectedEarthquakeUsgsLiquefaction) ? 'visible' : 'none';
    if (map.getLayer('selected-usgs-liquefaction-raster')) {
      map.setLayoutProperty('selected-usgs-liquefaction-raster', 'visibility', visibility);
      map.setPaintProperty('selected-usgs-liquefaction-raster', 'raster-opacity', eqLayer?.usgsLiquefactionOpacity ?? 0.8);
      
      const bMin = eqLayer?.usgsLiquefactionBrightness !== undefined && eqLayer.usgsLiquefactionBrightness > 0 ? eqLayer.usgsLiquefactionBrightness : 0;
      const bMax = eqLayer?.usgsLiquefactionBrightness !== undefined && eqLayer.usgsLiquefactionBrightness < 0 ? 1 + eqLayer.usgsLiquefactionBrightness : 1;
      map.setPaintProperty('selected-usgs-liquefaction-raster', 'raster-brightness-min', bMin);
      map.setPaintProperty('selected-usgs-liquefaction-raster', 'raster-brightness-max', bMax);
      map.setPaintProperty('selected-usgs-liquefaction-raster', 'raster-contrast', eqLayer?.usgsLiquefactionContrast ?? 0);
      map.setPaintProperty('selected-usgs-liquefaction-raster', 'raster-saturation', eqLayer?.usgsLiquefactionSaturation ?? 0);
      map.setPaintProperty('selected-usgs-liquefaction-raster', 'raster-hue-rotate', eqLayer?.usgsLiquefactionHue ?? 0);
    }
  }, [selectedEarthquakeUsgsLiquefaction, mapLoaded, settings.layers]);
  
  // Fetch corresponding CEMS activation when a GDACS earthquake is selected
  useEffect(() => {
    if (!selectedEarthquake) {
      return;
    }

    // Always clear old CEMS selection when selecting a new earthquake
    if (selectedCemsEarthquakeRef.current) {
      setSelectedCemsEarthquakeState(null);
    }

    let isSubscribed = true;
    (async () => {
      try {
        console.log(`Fetching CEMS for gdacsId: EQ${selectedEarthquake.id}`);
        const res = await fetch(`https://rapidmapping.emergency.copernicus.eu/backend/dashboard-api/public-activations-info/?gdacsId=EQ${selectedEarthquake.id}`);
        let act = null;

        if (res.ok) {
           const data = await res.json();
           if (data && data.results && data.results.length > 0) {
             act = data.results[0];
           }
        }
        
        // Fallback to spatial matching if gdacsId fails
        if (!act) {
           console.log(`gdacsId match failed. Attempting spatial matching for earthquake coordinates:`, selectedEarthquake.coordinates);
           const allRes = await fetch(`https://rapidmapping.emergency.copernicus.eu/backend/dashboard-api/public-activations-info/`);
           if (allRes.ok) {
             const allData = await allRes.json();
             if (allData && allData.results) {
               // Find all earthquake activations
               const earthquakes = allData.results.filter((a: any) => a.category === 'Earthquake' && a.centroid);
               
               let closestAct = null;
               let minDistance = Infinity;

               for (const a of earthquakes) {
                 // Ensure the CEMS event time is within 7 days of the GDACS earthquake time
                 const eqDate = new Date(selectedEarthquake.properties.fromdate);
                 const cemsDate = new Date(a.eventTime || a.activationTime);
                 const timeDiffDays = Math.abs(eqDate.getTime() - cemsDate.getTime()) / (1000 * 3600 * 24);
                 
                 if (isNaN(timeDiffDays) || timeDiffDays > 7) {
                   continue;
                 }

                 const geom = parseWKT(a.centroid);
                 if (geom && geom.geometry && geom.geometry.type === 'Point') {
                   const cemsCoords = geom.geometry.coordinates as [number, number];
                   const dist = haversineDistance(selectedEarthquake.coordinates, cemsCoords);
                   if (dist < minDistance) {
                     minDistance = dist;
                     closestAct = a;
                   }
                 }
               }

               // If the closest CEMS earthquake is within 100km, match it
               if (closestAct && minDistance <= 100) {
                 console.log(`Spatial match found: ${closestAct.code} at distance ${minDistance.toFixed(2)}km`);
                 act = closestAct;
               }
             }
           }
        }

        if (act && isSubscribed) {
           setSelectedCemsEarthquakeState({
             id: act.code,
             code: act.code,
             properties: act,
             coordinates: selectedEarthquake.coordinates
           });
        }
      } catch (err) {
        console.error('Error fetching correlated CEMS activation:', err);
      }
    })();

    return () => {
      isSubscribed = false;
    };
  }, [selectedEarthquake]);

  // Fetch danger zone polygon when selectedVolcano changes
  useEffect(() => {
    if (!selectedVolcano) {
      setSelectedVolcanoPolygon(null);
      return;
    }

    let isSubscribed = true;
    (async () => {
      try {
        const polyRes = await fetch(selectedVolcano.geomUrl.replace('http:', 'https:'));
        if (!polyRes.ok) throw new Error('Failed to fetch volcano polygon');
        const polyData = await polyRes.json();
        if (isSubscribed) {
          setSelectedVolcanoPolygon(polyData);
        }
      } catch (err) {
        console.error('Error fetching danger zone polygon for selected volcano:', err);
        if (isSubscribed) {
          setSelectedVolcanoPolygon(null);
        }
      }
    })();

    return () => { isSubscribed = false; };
  }, [selectedVolcano]);

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

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const onClick = (e: maplibregl.MapMouseEvent) => {
      // Handle GeoJSON Edit Mode first
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
        } catch (err) {
          // Layer might not exist
        }

        if (clickedGeojsonFeatureId) {
          setSelectedGeojsonFeatureId(clickedGeojsonFeatureId);
        } else {
          setActiveGeojsonLayerId(null);
          setSelectedGeojsonFeatureId(null);
        }
        return; // Prevent other interactions
      }

      // Handle flight aircraft selection
      let clickedFlightId: string | null = null;
      try {
        const flightLayers = settings.layers.filter(l => l.type === 'flights').map(l => `dynamic-layer-${l.id}`);
        if (flightLayers.length > 0) {
          const flightFeatures = map.queryRenderedFeatures(e.point, { layers: flightLayers });

          if (flightFeatures.length > 0) {
            clickedFlightId = flightFeatures[0].properties?.icao24 || null;
          }
        }
      } catch (err) {
        // layer might not be rendered
      }

      if (clickedFlightId) {
        if (selectedAircraftId === clickedFlightId) {
          setSelectedAircraftId(null);
        } else {
          setSelectedAircraftId(clickedFlightId);
        }
        return; // Prevent drawing or selecting other stuff
      } else {
        if (selectedAircraftId) {
          setSelectedAircraftId(null);
        }
      }

      // Handle cyclone click
      let clickedCycloneId: { id: string, ep: string } | null = null;
      try {
        const cycloneLayers = settings.layers.filter(l => l.type === 'gdacs_cyclones').map(l => `dynamic-layer-${l.id}`);
        if (cycloneLayers.length > 0) {
          const cycloneFeatures = map.queryRenderedFeatures(e.point, { layers: cycloneLayers });
          if (cycloneFeatures.length > 0) {
            const props = cycloneFeatures[0].properties;
            if (props && props.eventid && props.episodeid) {
              clickedCycloneId = { id: props.eventid.toString(), ep: props.episodeid.toString() };
            }
          }
        }
      } catch (err) {}

      if (clickedCycloneId) {
        if (selectedCycloneIdRef.current?.id === clickedCycloneId.id) {
          setSelectedCycloneIdState(null);
        } else {
          setSelectedCycloneIdState(clickedCycloneId);
        }
        return; // Prevent drawing
      } else {
        if (selectedCycloneIdRef.current) {
          setSelectedCycloneIdState(null);
        }
      }

      // Handle earthquake click
      let clickedEarthquake: { id: string, ep: string, geomUrl: string, coordinates: [number, number], properties: any } | null = null;
      try {
        const earthquakeLayers = settings.layers.filter(l => l.type === 'gdacs_earthquakes').map(l => `dynamic-layer-${l.id}`);
        if (earthquakeLayers.length > 0) {
          const eqFeatures = map.queryRenderedFeatures(e.point, { layers: earthquakeLayers });
          if (eqFeatures.length > 0) {
            const props = eqFeatures[0].properties;
            const geom = eqFeatures[0].geometry as GeoJSON.Point;
            if (props && props.eventid && props.episodeid && props.url && geom && geom.type === 'Point') {
              const urlObj = typeof props.url === 'string' ? JSON.parse(props.url) : props.url;
              if (urlObj && urlObj.geometry) {
                clickedEarthquake = { 
                  id: props.eventid.toString(), 
                  ep: props.episodeid.toString(), 
                  geomUrl: urlObj.geometry,
                  coordinates: geom.coordinates as [number, number],
                  properties: props
                };
              }
            }
          }
        }
      } catch (err) {}

      if (clickedEarthquake) {
        if (selectedEarthquakeRef.current?.id === clickedEarthquake.id) {
          setSelectedEarthquakeState(null);
        } else {
          setSelectedEarthquakeState(clickedEarthquake);
        }
        return; // Prevent drawing
      } else {
        if (selectedEarthquakeRef.current) {
          setSelectedEarthquakeState(null);
        }
      }

      // Handle volcano click
      let clickedVolcano: { id: string, ep: string, geomUrl: string, coordinates: [number, number], properties: any } | null = null;
      try {
        const volcanoLayers = settings.layers.filter(l => l.type === 'gdacs_volcanoes').map(l => `dynamic-layer-${l.id}`);
        if (volcanoLayers.length > 0) {
          const volFeatures = map.queryRenderedFeatures(e.point, { layers: volcanoLayers });
          if (volFeatures.length > 0) {
            const props = volFeatures[0].properties;
            const geom = volFeatures[0].geometry as GeoJSON.Point;
            if (props && props.eventid && props.episodeid && props.url && geom && geom.type === 'Point') {
              const urlObj = typeof props.url === 'string' ? JSON.parse(props.url) : props.url;
              if (urlObj && urlObj.geometry) {
                clickedVolcano = { 
                  id: props.eventid.toString(), 
                  ep: props.episodeid.toString(), 
                  geomUrl: urlObj.geometry,
                  coordinates: geom.coordinates as [number, number],
                  properties: props
                };
              }
            }
          }
        }
      } catch (err) {}

      if (clickedVolcano) {
        if (selectedVolcanoRef.current?.id === clickedVolcano.id) {
          setSelectedVolcanoState(null);
        } else {
          setSelectedVolcanoState(clickedVolcano);
        }
        return; // Prevent drawing
      } else {
        if (selectedVolcanoRef.current) {
          setSelectedVolcanoState(null);
        }
      }

      // Handle CEMS earthquake click
      let clickedCemsEarthquake: { id: string, code: string, properties: any, coordinates: [number, number] } | null = null;
      try {
        const cemsLayers = settings.layers.filter(l => l.type === 'cems_rapid_mapping').map(l => `dynamic-layer-${l.id}`);
        if (cemsLayers.length > 0) {
          const cemsFeatures = map.queryRenderedFeatures(e.point, { layers: cemsLayers });
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
            }
          }
        }
      } catch (err) {}

      if (clickedCemsEarthquake) {
        if (selectedCemsEarthquakeRef.current?.id === clickedCemsEarthquake.id) {
          setSelectedCemsEarthquakeState(null);
        } else {
          setSelectedCemsEarthquakeState(clickedCemsEarthquake);
        }
        return; // Prevent drawing
      } else {
        if (selectedCemsEarthquakeRef.current) {
          setSelectedCemsEarthquakeState(null);
        }
      }

      // Handle vessel click
      let clickedVesselMmsi: string | null = null;
      try {
        const vesselLayers = settings.layers.filter(l => l.type === 'vessels').map(l => `dynamic-layer-${l.id}`);
        if (vesselLayers.length > 0) {
          const vesselFeatures = map.queryRenderedFeatures(e.point, { layers: vesselLayers });
          if (vesselFeatures.length > 0) {
            clickedVesselMmsi = vesselFeatures[0].properties?.mmsi || null;
          }
        }
      } catch (err) {}

      if (clickedVesselMmsi) {
        if (activeVesselMmsiRef.current === clickedVesselMmsi) {
          activeVesselMmsiRef.current = null;
          window.dispatchEvent(new CustomEvent('vesselSelected', { detail: null }));
          if (vesselPopupRef.current) {
            vesselPopupRef.current.remove();
            vesselPopupRef.current = null;
          }
          const trackSource = map.getSource('selected-vessel-track') as maplibregl.GeoJSONSource;
          if (trackSource) trackSource.setData({ type: 'FeatureCollection', features: [] });
        } else {
          activeVesselMmsiRef.current = clickedVesselMmsi;
          window.dispatchEvent(new CustomEvent('vesselSelected', { detail: clickedVesselMmsi }));
          const v = vesselsRef.current.get(clickedVesselMmsi);
          if (v && v.lat != null && v.lon != null) {
            if (!vesselPopupRef.current) {
              vesselPopupRef.current = new maplibregl.Popup({ closeButton: false, closeOnClick: false, className: 'flight-popup' })
                .setLngLat([v.lon, v.lat])
                .addTo(map);
            } else {
              vesselPopupRef.current.setLngLat([v.lon, v.lat]);
            }
            const style = document.getElementById('flight-popup-style') || document.createElement('style');
            style.id = 'flight-popup-style';
            style.innerHTML = '.flight-popup .maplibregl-popup-content { padding: 0; background: transparent; box-shadow: none; } .flight-popup .maplibregl-popup-tip { border-top-color: #09090b; }';
            if (!document.getElementById('flight-popup-style')) document.head.appendChild(style);
            
            const spd = v.sog != null ? Math.round(v.sog) + 'kn' : 'N/A';
            const hdg = v.heading != null ? Math.round(v.heading) + '°' : 'N/A';
            const flag = getMmsiFlagHtml(v.mmsi);
            const popupHtml = `
              <div style="background-color: #09090b; padding: 12px; border-radius: 0; color: white; font-family: ui-sans-serif, system-ui, sans-serif; font-size: 11px; min-width: 180px; text-transform: uppercase;">
                <div style="font-size: 14px; font-weight: 700; margin-bottom: 8px; color: #ffffff; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 4px;">
                  <span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${v.name || 'UNKNOWN'}</span>
                  <span style="font-size: 16px; margin-left: 8px;">${flag}</span>
                </div>
                <div style="display: grid; grid-template-columns: 40px 1fr; gap: 6px; font-weight: 500;">
                  <span style="color: rgba(255,255,255,0.5);">MMSI:</span> <span style="text-align: right; font-family: monospace;">${v.mmsi}</span>
                  <span style="color: rgba(255,255,255,0.5);">CALL:</span> <span style="text-align: right; font-family: monospace;">${v.callSign || 'N/A'}</span>
                  <span style="color: rgba(255,255,255,0.5);">DEST:</span> <span style="text-align: right; font-family: monospace; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${v.destination || 'N/A'}</span>
                  <span style="color: rgba(255,255,255,0.5);">SPD:</span> <span style="text-align: right; font-family: monospace;">${spd}</span>
                  <span style="color: rgba(255,255,255,0.5);">HDG:</span> <span style="text-align: right; font-family: monospace;">${hdg}</span>
                </div>
              </div>
            `;
            vesselPopupRef.current.setHTML(popupHtml);

            const trackSource = map.getSource('selected-vessel-track') as maplibregl.GeoJSONSource;
            if (trackSource && v.track && v.track.length > 1) {
              trackSource.setData({
                type: 'FeatureCollection',
                features: [{ type: 'Feature', geometry: { type: 'LineString', coordinates: v.track }, properties: {} }]
              });
            } else if (trackSource) {
              trackSource.setData({ type: 'FeatureCollection', features: [] });
            }
          }
        }
        return; // Prevent drawing or selecting other stuff
      } else {
        if (activeVesselMmsiRef.current) {
          activeVesselMmsiRef.current = null;
          window.dispatchEvent(new CustomEvent('vesselSelected', { detail: null }));
          if (vesselPopupRef.current) {
            vesselPopupRef.current.remove();
            vesselPopupRef.current = null;
          }
          const trackSource = map.getSource('selected-vessel-track') as maplibregl.GeoJSONSource;
          if (trackSource) trackSource.setData({ type: 'FeatureCollection', features: [] });
        }
      }
      let features: maplibregl.MapGeoJSONFeature[] = [];
      try {
        features = map.queryRenderedFeatures(e.point, { layers: ['custom-polygons', 'custom-lines', 'custom-lines-dashed', 'custom-lines-dotted', 'custom-arrow-heads'] });
      } catch (err) {}
      let clickedAnnotationId: string | null = null;
      
      // Smart Event Delegation: ignore polygon fills ('custom-polygons') 
      // so clicks pass through to allow adding annotations inside countries.
      // Selection will only happen if clicking the border ('custom-lines' etc).
      const targetFeature = features.find(f => f.layer.id !== 'custom-polygons');
      
      if (targetFeature) {
        clickedAnnotationId = targetFeature.properties?.id;
        if (clickedAnnotationId && activeTool !== 'none' && activeTool !== 'highlight') {
          setSelectedAnnotationId(clickedAnnotationId);
          return; // Prevent drawing if we selected an element
        }
      } else {
        if (activeTool !== 'none' && activeTool !== 'highlight') {
          setSelectedAnnotationId(null);
        }
      }

      if (activeTool === 'none') return;

      if (activeTool === 'icon' && selectedIconId) {
        setAnnotations(prev => [...prev, {
          id: `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
          type: 'icon',
          iconId: selectedIconId,
          color: currentColor,
          coordinates: [e.lngLat.lng, e.lngLat.lat]
        }]);
        return;
      }
      
      if (activeTool === 'label') {
        setLabelPrompt({ lngLat: [e.lngLat.lng, e.lngLat.lat] });
        return;
      }

      if (activeTool === 'headline') {
        setHeadlinePrompt?.({});
        return;
      }

      if (activeTool === 'highlight') {
        const selectedId = settings.labelTemplates?.highlightLabelTemplate;
        const variation = settings.labelTemplates?.variations?.find(v => v.id === selectedId);
        const actualTemplate = variation ? variation.baseTemplate : selectedId;
        const actualTheme = settings.labelTemplates?.savedThemes?.[selectedId || ''] || settings.labelTemplates?.theme;
        const evaluateExpression = (expr: any, zoom: number, feature: maplibregl.MapGeoJSONFeature): any => {
          if (typeof expr !== 'object' || expr === null) return expr;
          if (!Array.isArray(expr)) return expr;
          const type = expr[0];
          
          if (type === 'get') {
            return feature.properties?.[expr[1]];
          }
          if (type === 'has') {
            return feature.properties?.[expr[1]] !== undefined;
          }
          if (type === '==') {
            return evaluateExpression(expr[1], zoom, feature) === evaluateExpression(expr[2], zoom, feature);
          }
          if (type === '!=') {
            return evaluateExpression(expr[1], zoom, feature) !== evaluateExpression(expr[2], zoom, feature);
          }
          if (type === 'step') {
            const input = evaluateExpression(expr[1], zoom, feature);
            let val = evaluateExpression(expr[2], zoom, feature);
            for (let i = 3; i < expr.length; i += 2) {
              if (input >= expr[i]) val = evaluateExpression(expr[i + 1], zoom, feature);
              else break;
            }
            return val;
          }
          if (type === 'interpolate') {
            const input = evaluateExpression(expr[2], zoom, feature);
            for (let i = 3; i < expr.length; i += 2) {
              if (input === expr[i]) return evaluateExpression(expr[i + 1], zoom, feature);
              if (input < expr[i]) {
                if (i === 3) return evaluateExpression(expr[i + 1], zoom, feature);
                const z0 = expr[i - 2], v0 = evaluateExpression(expr[i - 1], zoom, feature);
                const z1 = expr[i], v1 = evaluateExpression(expr[i + 1], zoom, feature);
                const t = (input - z0) / (z1 - z0);
                return v0 + t * (v1 - v0);
              }
            }
            return evaluateExpression(expr[expr.length - 1], zoom, feature);
          }
          if (type === 'match') {
            const input = evaluateExpression(expr[1], zoom, feature);
            for (let i = 2; i < expr.length - 1; i += 2) {
              const cases = Array.isArray(expr[i]) ? expr[i] : [expr[i]];
              if (cases.includes(input)) return evaluateExpression(expr[i + 1], zoom, feature);
            }
            return evaluateExpression(expr[expr.length - 1], zoom, feature);
          }
          if (type === 'case') {
            for (let i = 1; i < expr.length - 1; i += 2) {
              if (evaluateExpression(expr[i], zoom, feature)) return evaluateExpression(expr[i + 1], zoom, feature);
            }
            return evaluateExpression(expr[expr.length - 1], zoom, feature);
          }
          if (type === 'zoom') {
            return zoom;
          }
          if (type === 'all') {
            for (let i = 1; i < expr.length; i++) {
              if (!evaluateExpression(expr[i], zoom, feature)) return false;
            }
            return true;
          }
          if (type === 'any') {
            for (let i = 1; i < expr.length; i++) {
              if (evaluateExpression(expr[i], zoom, feature)) return true;
            }
            return false;
          }
          
          return null; // unsupported expression
        };

        const bbox: [maplibregl.PointLike, maplibregl.PointLike] = [
          [e.point.x - 5, e.point.y - 5],
          [e.point.x + 5, e.point.y + 5]
        ];
        const features = map.queryRenderedFeatures(bbox);
        const currentZoom = map.getZoom();
        
        const validSymbolFeatures = features.filter(f => {
          if (f.layer?.type !== 'symbol') return false;
          if (!f.properties?.name && !f.properties?.name_en && !f.properties?.name_de) return false;
          
          try {
            const layerId = f.layer.id;
            const minZoom = map.getLayer(layerId)?.minzoom || 0;
            const maxZoom = map.getLayer(layerId)?.maxzoom || 24;
            if (currentZoom < minZoom || currentZoom > maxZoom) return false;

            const textOpacity = map.getPaintProperty(layerId, 'text-opacity');
            if (textOpacity !== undefined) {
              if (typeof textOpacity === 'number' && textOpacity === 0) return false;
              if (Array.isArray(textOpacity)) {
                const val = evaluateExpression(textOpacity, currentZoom, f);
                if (val === 0) return false;
              }
            }
            
            const textSize = map.getLayoutProperty(layerId, 'text-size');
            if (textSize !== undefined) {
              if (typeof textSize === 'number' && textSize === 0) return false;
              if (Array.isArray(textSize)) {
                const val = evaluateExpression(textSize, currentZoom, f);
                if (val === 0) return false;
              }
            }

            const textField = map.getLayoutProperty(layerId, 'text-field');
            if (textField !== undefined) {
              if (Array.isArray(textField)) {
                const val = evaluateExpression(textField, currentZoom, f);
                if (val === '') return false;
              }
            }

            return true;
          } catch (e) {
            return true; // default to true if we can't determine visibility
          }
        });
        
        // Prioritize place labels over country/state labels
        const symbolFeature = validSymbolFeatures.sort((a, b) => {
          const aId = a.layer?.id.toLowerCase() || '';
          const bId = b.layer?.id.toLowerCase() || '';
          
          const getScore = (id: string) => {
            if (id.includes('poi')) return 4;
            if (id.includes('settlement') || id.includes('place') || id.includes('city') || id.includes('town')) return 3;
            if (id.includes('water') || id.includes('natural')) return 2;
            if (id.includes('state') || id.includes('admin-1') || id.includes('province')) return 1;
            if (id.includes('country') || id.includes('admin-0')) return 0;
            return 2; // default middle score
          };
          
          return getScore(bId) - getScore(aId);
        })[0];
        
        if (symbolFeature) {
          const props = symbolFeature.properties || {};
          // Prioritize the native name (usually Cyrillic for Ukraine/Russia)
          const nameNative = props.name || '';
          const hasCyrillic = /[А-Яа-яЁёІіЇїЄєҐґ]/.test(nameNative);
          
          let name = props.name_de || props.name_en || props.name_int || props.name || '';
          if (hasCyrillic) {
            // Determine if it's Russian by checking if native name matches name_ru, OR if it lacks Ukr-specific letters
            // Mapbox usually provides name_ru and name_uk for major cities in both countries.
            const isRussian = props.name_ru && props.name === props.name_ru && props.name !== props.name_uk;
            name = transliterateToGerman(nameNative, isRussian);
          } else if (!props.name_de && !props.name_en && !props.name_int && nameNative) {
            // If no Latin translation exists, check if the native script contains exotic non-Latin characters (Arabic, Farsi, Chinese, etc.)
            // We only do this if all standard Latin name fields are missing, to avoid destroying valid Latin accents (like 'ü').
            const needsTransliteration = /[^\u0000-\u024F\u1E00-\u1EFF]/.test(nameNative);
            if (needsTransliteration) {
              name = anyAscii(nameNative);
            }
          }
          
          let coords: [number, number] = [e.lngLat.lng, e.lngLat.lat];
          if (symbolFeature.geometry.type === 'Point') {
            coords = symbolFeature.geometry.coordinates as [number, number];
          }
          const newId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
          setAnnotations(prev => [...prev, {
            id: newId,
            type: 'highlight',
            color: currentColor,
            template: actualTemplate,
            theme: actualTheme,
            coordinates: coords,
            text: name,
            animationTriggerId: newId,
            view: {
              center: coords,
              zoom: mapRef.current!.getZoom(),
              pitch: mapRef.current!.getPitch(),
              bearing: mapRef.current!.getBearing(),
            elevation: mapRef.current!.queryTerrainElevation(coords as [number, number]) || 0
          }
          }]);
        } else if (clickedAnnotationId) {
          // If we clicked on an existing country polygon but missed all labels, select it instead of duplicating it
          setSelectedAnnotationId(clickedAnnotationId);
        } else {
          // Fetch country boundary if clicking on empty space
          const fetchCountry = async () => {
            try {
              document.body.style.cursor = 'wait';
              
              let terrestrialGeometry = null;
              if (!terrestrialCountriesRef.current) {
                try {
                  const cRes = await fetch('/countries.geo.json');
                  terrestrialCountriesRef.current = await cRes.json();
                } catch (e) {
                  console.error("Failed to load terrestrial countries", e);
                }
              }
              if (terrestrialCountriesRef.current) {
                const pt = turf.point([e.lngLat.lng, e.lngLat.lat]);
                for (const feature of terrestrialCountriesRef.current.features) {
                  if (feature.geometry && (feature.geometry.type === 'Polygon' || feature.geometry.type === 'MultiPolygon')) {
                    if (turf.booleanPointInPolygon(pt, feature)) {
                      terrestrialGeometry = feature.geometry;
                      break;
                    }
                  }
                }
              }

              const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${e.lngLat.lat}&lon=${e.lngLat.lng}&zoom=3&polygon_geojson=1&polygon_threshold=0.01`);
              const data = await res.json();
              if (data && data.geojson) {
                const nameNative = data.name || data.display_name || '';
                const hasCyrillic = /[А-Яа-яЁёІіЇїЄєҐґ]/.test(nameNative);
                let name = nameNative;
                if (hasCyrillic) {
                  const isRussian = data.address?.country_code === 'ru';
                  name = transliterateToGerman(nameNative, isRussian);
                } else if (nameNative) {
                  const needsTransliteration = /[^\u0000-\u024F\u1E00-\u1EFF]/.test(nameNative);
                  if (needsTransliteration) name = anyAscii(nameNative);
                }
                
                const centerLng = parseFloat(data.lon);
                const centerLat = parseFloat(data.lat);
                
                const newId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
                setAnnotations(prev => [...prev, {
                  id: newId,
                  type: 'highlight',
                  color: currentColor,
                  template: actualTemplate,
                  theme: actualTheme,
                  strokeType: currentStrokeType || 'solid',
                  fillOpacity: currentFillOpacity ?? 0.5,
                  coordinates: [centerLng, centerLat],
                  polygonGeometry: terrestrialGeometry || data.geojson,
                  text: name,
                  animationTriggerId: newId,
                  view: {
                    center: [centerLng, centerLat],
                    zoom: mapRef.current?.getZoom() || 4,
                    pitch: mapRef.current?.getPitch() || 0,
                    bearing: mapRef.current?.getBearing() || 0
                  }
                }]);
              }
            } catch (err) {
              console.error('Failed to fetch country from Nominatim', err);
            } finally {
              document.body.style.cursor = '';
            }
          };
          fetchCountry();
        }
        return;
      }

      if (activeTool === 'polygon') {
        if (!isDrawing.current) {
          isDrawing.current = true;
          currentShapeCoords.current = [[e.lngLat.lng, e.lngLat.lat]];
        } else {
          const lastPoint = currentShapeCoords.current[currentShapeCoords.current.length - 1];
          const p1 = map.project(lastPoint);
          const p2 = e.point;
          const distPx = Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));
          if (distPx < 10) return; // Prevent double-click from adding a micro-segment

          currentShapeCoords.current.push([e.lngLat.lng, e.lngLat.lat]);
          updateActiveDrawing({
            type: 'Feature',
            geometry: { type: 'LineString', coordinates: [...currentShapeCoords.current] },
            properties: { color: currentColor }
          });
        }
      }


      if (activeTool === 'measure') {
        if (!isDrawing.current) {
          isDrawing.current = true;
          currentShapeCoords.current = [[e.lngLat.lng, e.lngLat.lat]];
        } else {
          const lastPoint = currentShapeCoords.current[currentShapeCoords.current.length - 1];
          const p1 = map.project(lastPoint);
          const p2 = e.point;
          const distPx = Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));
          if (distPx < 10) return; // Prevent double-click from adding a micro-segment

          currentShapeCoords.current.push([e.lngLat.lng, e.lngLat.lat]);
          updateActiveDrawing({
            type: 'Feature',
            geometry: { type: 'LineString', coordinates: [...currentShapeCoords.current] },
            properties: { color: currentColor }
          });
        }
        
        // Add static measure marker for this vertex
        const dist = calculateDistance(currentShapeCoords.current);
        const labelEl = document.createElement('div');
        labelEl.className = 'label-marker-measure-draw';
        labelEl.style.width = '0px';
        labelEl.style.height = '0px';
        labelEl.style.position = 'relative';
        labelEl.style.pointerEvents = 'none';
        labelEl.innerHTML = `
          <div style="position: absolute; left: 0; top: 0; transform: translate(-50%, -50%); zoom: var(--export-annotation-scale, 1); transform-origin: center center; display: flex; align-items: center; justify-content: center;">
            <div class="custom-marker-flat" style="background-color: ${currentColor}; color: ${getContrastYIQ(currentColor)};">
              ${dist.toFixed(2)} km
            </div>
          </div>
        `;
        const markerId = `measure-${currentShapeCoords.current.length - 1}`;
        activeDrawMarkersRef.current[markerId] = new maplibregl.Marker({ element: labelEl })
          .setLngLat([e.lngLat.lng, e.lngLat.lat])
          .addTo(map);
      }

      if (activeTool === 'route') {
        const point = [e.lngLat.lng, e.lngLat.lat] as [number, number];
        
        const addRouteMarker = (lngLat: [number, number], legs: { distance: number; duration: number }[], idx: number) => {
          const totalDist = legs.reduce((acc, leg) => acc + leg.distance, 0) / 1000;
          const totalDur = legs.reduce((acc, leg) => acc + leg.duration, 0);
          const hrs = Math.floor(totalDur / 3600);
          const mins = Math.round((totalDur % 3600) / 60);
          const timeStr = hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`;
          
          const labelEl = document.createElement('div');
          labelEl.className = 'label-marker-route-draw';
          labelEl.style.width = '0px';
          labelEl.style.height = '0px';
          labelEl.style.position = 'relative';
          labelEl.style.pointerEvents = 'none';
          labelEl.innerHTML = `
            <div style="position: absolute; left: 0; top: 0; transform: translate(-50%, -50%); zoom: var(--export-annotation-scale, 1); transform-origin: center center; display: flex; align-items: center; justify-content: center;">
              <div class="custom-marker-flat text-center leading-tight" style="background-color: ${currentColor}; color: ${getContrastYIQ(currentColor)};">
                ${totalDist.toFixed(1)} km<br/><span style="font-size:0.75em;opacity:0.9">${timeStr}</span>
              </div>
            </div>
          `;
          
          const markerId = `route-${idx}`;
          activeDrawMarkersRef.current[markerId] = new maplibregl.Marker({ element: labelEl })
            .setLngLat(lngLat)
            .addTo(map);
        };

        if (routeClickTimeoutRef.current) {
          clearTimeout(routeClickTimeoutRef.current);
          routeClickTimeoutRef.current = null;
          return;
        }

        const ePoint = e.point;

        routeClickTimeoutRef.current = setTimeout(() => {
          routeClickTimeoutRef.current = null;

          if (!isDrawing.current) {
            isDrawing.current = true;
          currentDrawSessionRef.current += 1;
          pendingFetchesRef.current = 0;
          currentShapeCoords.current = [point];
          routeGeometryRef.current = { type: 'LineString', coordinates: [point] };
          routeLegsRef.current = [];
          routeSegmentsRef.current = {};
          routeLegsSegmentsRef.current = {};
          
          const labelEl = document.createElement('div');
          labelEl.className = 'label-marker-route-start';
          labelEl.style.width = '0px';
          labelEl.style.height = '0px';
          labelEl.style.position = 'relative';
          labelEl.style.pointerEvents = 'none';
          labelEl.innerHTML = `
            <div style="position: absolute; left: 0; top: 0; transform: translate(-50%, -50%); zoom: var(--export-annotation-scale, 1); transform-origin: center center; display: flex; align-items: center; justify-content: center;">
              <div class="custom-marker-flat text-xs font-bold uppercase tracking-wider" style="background-color: ${currentColor}; color: ${getContrastYIQ(currentColor)};">
                START
              </div>
            </div>
          `;
          activeDrawMarkersRef.current[`route-0`] = new maplibregl.Marker({ element: labelEl })
            .setLngLat(point)
            .addTo(map);
        } else {
          const lastPoint = currentShapeCoords.current[currentShapeCoords.current.length - 1];
          const p1 = map.project(lastPoint);
          const p2 = ePoint || map.project(point);
          const distPx = Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));
          if (distPx < 10) return;

          const currentIdx = currentShapeCoords.current.length;
          currentShapeCoords.current.push(point);
          
          if (routeMode === 'train') {
            const fallbackTrain = (p1: [number, number], p2: [number, number], idx: number) => {
              const distKm = turf.distance(turf.point(p1), turf.point(p2), { units: 'kilometers' });
              const speedKmph = 100;
              const durationSec = (distKm / speedKmph) * 3600;
              
              routeSegmentsRef.current[idx] = [p2];
              routeLegsSegmentsRef.current[idx] = { distance: distKm * 1000, duration: durationSec };
              
              const fullCoords = [currentShapeCoords.current[0]];
              const fullLegs = [];
              for (let i = 1; i <= currentShapeCoords.current.length; i++) {
                if (routeSegmentsRef.current[i]) {
                  fullCoords.push(...routeSegmentsRef.current[i]);
                  fullLegs.push(routeLegsSegmentsRef.current[i]);
                }
              }
              routeGeometryRef.current.coordinates = fullCoords;
              routeLegsRef.current = fullLegs;
              
              updateActiveDrawing({
                type: 'Feature',
                geometry: routeGeometryRef.current,
                properties: { color: currentColor }
              });
              addRouteMarker(p2, fullLegs, idx);
            };

            if (settings.googleMapsToken) {
              const sessionId = currentDrawSessionRef.current;
              pendingFetchesRef.current += 1;
              fetch(`./api.php?action=google_directions&origin=${lastPoint[1]},${lastPoint[0]}&destination=${point[1]},${point[0]}&key=${settings.googleMapsToken}`)
                .then(res => res.json())
                .then(data => {
                  pendingFetchesRef.current -= 1;
                  if (sessionId !== currentDrawSessionRef.current) return;
                  if (data.routes && data.routes[0]) {
                    const route = data.routes[0];
                    const leg = route.legs[0];
                    let points: [number, number][] = [];
                    if (leg.steps && leg.steps.length > 0) {
                      const transitSteps = leg.steps.filter((s: any) => s.travel_mode === 'TRANSIT');
                      if (transitSteps.length > 0) {
                        transitSteps.forEach((step: any) => {
                          points.push(...decodePolyline(step.polyline.points));
                        });
                      } else {
                        points = decodePolyline(route.overview_polyline.points);
                      }
                    } else {
                      points = decodePolyline(route.overview_polyline.points);
                    }
                    
                    routeSegmentsRef.current[currentIdx] = points;
                    routeLegsSegmentsRef.current[currentIdx] = { distance: leg.distance.value, duration: leg.duration.value };
                    
                    const fullCoords = [currentShapeCoords.current[0]];
                    const fullLegs = [];
                    for (let i = 1; i <= currentShapeCoords.current.length; i++) {
                      if (routeSegmentsRef.current[i]) {
                        fullCoords.push(...routeSegmentsRef.current[i]);
                        fullLegs.push(routeLegsSegmentsRef.current[i]);
                      }
                    }
                    routeGeometryRef.current.coordinates = fullCoords;
                    routeLegsRef.current = fullLegs;
                    
                    updateActiveDrawing({
                      type: 'Feature',
                      geometry: routeGeometryRef.current,
                      properties: { color: currentColor }
                    });
                    addRouteMarker(point, fullLegs, currentIdx);
                  } else {
                    fallbackTrain(lastPoint, point, currentIdx);
                  }
                })
                .catch(err => {
                  pendingFetchesRef.current -= 1;
                  if (sessionId !== currentDrawSessionRef.current) return;
                  console.error('Google Transit API error:', err);
                  fallbackTrain(lastPoint, point, currentIdx);
                });
            } else {
              fallbackTrain(lastPoint, point, currentIdx);
            }
          } else {
            const endpoint = routeMode === 'walking' 
              ? 'https://routing.openstreetmap.de/routed-foot/route/v1/driving' 
              : 'https://router.project-osrm.org/route/v1/driving';
            const sessionId = currentDrawSessionRef.current;
            pendingFetchesRef.current += 1;
            fetch(`${endpoint}/${lastPoint[0]},${lastPoint[1]};${point[0]},${point[1]}?overview=full&geometries=geojson`)
              .then(res => res.json())
              .then(data => {
                pendingFetchesRef.current -= 1;
                if (sessionId !== currentDrawSessionRef.current) return;
                if (data.routes && data.routes[0]) {
                  const route = data.routes[0];
                  const newCoords = route.geometry.coordinates.slice(1);
                  
                  routeSegmentsRef.current[currentIdx] = newCoords;
                  routeLegsSegmentsRef.current[currentIdx] = { distance: route.distance, duration: route.duration };
                  
                  const fullCoords = [currentShapeCoords.current[0]];
                  const fullLegs = [];
                  for (let i = 1; i <= currentShapeCoords.current.length; i++) {
                    if (routeSegmentsRef.current[i]) {
                      fullCoords.push(...routeSegmentsRef.current[i]);
                      fullLegs.push(routeLegsSegmentsRef.current[i]);
                    }
                  }
                  routeGeometryRef.current.coordinates = fullCoords;
                  routeLegsRef.current = fullLegs;
                  
                  updateActiveDrawing({
                    type: 'Feature',
                    geometry: routeGeometryRef.current,
                    properties: { color: currentColor }
                  });
                  addRouteMarker(point, fullLegs, currentIdx);
                }
              }).catch(err => {
                pendingFetchesRef.current -= 1;
                console.error('Routing error:', err);
              });
          }
        }
        }, 250);
      }
    };

    const onMouseDown = (e: maplibregl.MapMouseEvent) => {
      if (activeTool === 'none') return;
      if ((e.originalEvent?.target as HTMLElement)?.closest('.maplibregl-marker')) return;

      // Check if we clicked on an existing annotation feature FIRST
      let features: maplibregl.MapGeoJSONFeature[] = [];
      try {
        features = map.queryRenderedFeatures(e.point, { layers: ['custom-polygons', 'custom-lines', 'custom-lines-dashed', 'custom-lines-dotted', 'custom-arrow-heads'] });
      } catch (e) {
        // layer might not be ready
      }
      
      // Smart Event Delegation: ignore polygon fills so drawing tools can start inside them.
      const targetFeature = features.find(f => f.layer.id !== 'custom-polygons');
      
      if (targetFeature) {
        const clickedId = targetFeature.properties?.id;
        if (clickedId) {
          setSelectedAnnotationId(clickedId);
          return; // Prevent drawing if we selected an element
        }
      } else {
        setSelectedAnnotationId(null);
      }

      if (activeTool === 'paint') {
        isDrawing.current = true;
        currentShapeCoords.current = [[e.lngLat.lng, e.lngLat.lat]];
        map.dragPan.disable(); // Prevent map panning while drawing
      }

      if (activeTool === 'circle') {
        isDrawing.current = true;
        circleCenter.current = [e.lngLat.lng, e.lngLat.lat];
        map.dragPan.disable();
        
        // Add live center dot
        const centerEl = document.createElement('div');
        centerEl.className = 'label-marker-circle-center-draw';
        centerEl.style.width = '0px';
        centerEl.style.height = '0px';
        centerEl.style.position = 'relative';
        centerEl.style.pointerEvents = 'none';
        centerEl.innerHTML = `
          <div style="position: absolute; left: 0; top: 0; transform: translate(-50%, -50%); zoom: var(--export-annotation-scale, 1); transform-origin: center center;">
            <div class="custom-marker-dot" style="background-color: ${currentColor};"></div>
          </div>
        `;
        activeDrawMarkersRef.current['circle-center'] = new maplibregl.Marker({ element: centerEl })
          .setLngLat(circleCenter.current)
          .addTo(map);
      }

      if (activeTool === 'arrow') {
        if (!isDrawing.current) {
          isDrawing.current = true;
          arrowStart.current = [e.lngLat.lng, e.lngLat.lat];
          map.dragPan.disable();
        }
      }
    };

    const onMouseMove = (e: maplibregl.MapMouseEvent) => {
      if (activeTool === 'highlight') {
        const features = map.queryRenderedFeatures(e.point);
        const hasSymbol = features.some(f => f.layer?.type === 'symbol' && (f.properties?.name || f.properties?.name_en));
        map.getCanvas().style.cursor = hasSymbol ? 'pointer' : 'crosshair';
        return;
      }

      if (!isDrawing.current || activeTool === 'none') return;

      if (activeTool === 'paint') {
        currentShapeCoords.current.push([e.lngLat.lng, e.lngLat.lat]);
        updateActiveDrawing({
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: [...currentShapeCoords.current] },
          properties: { color: currentColor }
        });
      }

      if (activeTool === 'circle' && circleCenter.current) {
        const currentPos: [number, number] = [e.lngLat.lng, e.lngLat.lat];
        const radius = turf.distance(circleCenter.current, currentPos, { units: 'kilometers' });
        if (radius > 0) {
          const circlePoly = createCirclePolygon(circleCenter.current, radius);
          if (circlePoly) {
            updateActiveDrawing({
              ...circlePoly,
              properties: { color: currentColor }
            });
            
            // Update live radius marker
            if (!activeDrawMarkersRef.current['circle-radius']) {
              const labelEl = document.createElement('div');
              labelEl.className = 'label-marker-circle-radius';
              labelEl.style.width = '0px';
              labelEl.style.height = '0px';
              labelEl.style.position = 'relative';
              labelEl.style.pointerEvents = 'none';
              labelEl.innerHTML = `
                <div style="position: absolute; left: 0; top: 0; transform: translate(-50%, -50%); zoom: var(--export-annotation-scale, 1); transform-origin: center center; display: flex; align-items: center; justify-content: center;">
                  <div class="custom-marker-flat" style="background-color: ${currentColor}; color: ${getContrastYIQ(currentColor)};">
                    ${radius.toFixed(2)} km
                  </div>
                </div>
              `;
              activeDrawMarkersRef.current['circle-radius'] = new maplibregl.Marker({ element: labelEl })
                .setLngLat(currentPos)
                .addTo(map);
            } else {
              activeDrawMarkersRef.current['circle-radius'].setLngLat(currentPos);
              activeDrawMarkersRef.current['circle-radius'].getElement().innerHTML = `
                <div style="position: absolute; left: 0; top: 0; transform: translate(-50%, -50%); zoom: var(--export-annotation-scale, 1); transform-origin: center center; display: flex; align-items: center; justify-content: center;">
                  <div class="custom-marker-flat" style="background-color: ${currentColor}; color: ${getContrastYIQ(currentColor)};">
                    ${radius.toFixed(2)} km
                  </div>
                </div>
              `;
            }
          }
        }
      }

      if (activeTool === 'arrow' && arrowStart.current) {
        const currentPos: [number, number] = [e.lngLat.lng, e.lngLat.lat];
        const feats = createArrowFeatures(arrowStart.current, currentPos, currentColor);
        if (feats) {
          updateActiveDrawing({
            type: 'FeatureCollection',
            features: [feats.shaft, feats.head]
          });
        }
      }

      if (activeTool === 'polygon' || activeTool === 'measure' || activeTool === 'route') {
        // Draw temporary line to cursor
        let tempLineCoords = [];
        if (activeTool === 'route') {
          tempLineCoords = [...(routeGeometryRef.current?.coordinates || []), [e.lngLat.lng, e.lngLat.lat]];
        } else {
          tempLineCoords = [...currentShapeCoords.current, [e.lngLat.lng, e.lngLat.lat]];
        }
        
        updateActiveDrawing({
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: tempLineCoords },
          properties: { color: currentColor }
        });
        
        if (activeTool === 'measure' || activeTool === 'route') {
          // Update floating cursor marker
          let dist = 0;
          if (activeTool === 'route') {
            const legsDist = routeLegsRef.current.reduce((acc, leg) => acc + leg.distance, 0) / 1000;
            const lastPt = routeGeometryRef.current?.coordinates[routeGeometryRef.current.coordinates.length - 1];
            dist = legsDist + (lastPt ? turf.distance(turf.point(lastPt), turf.point([e.lngLat.lng, e.lngLat.lat]), { units: 'kilometers' }) : 0);
          } else {
            dist = calculateDistance(currentShapeCoords.current);
            dist += turf.distance(currentShapeCoords.current[currentShapeCoords.current.length - 1], [e.lngLat.lng, e.lngLat.lat], { units: 'kilometers' });
          }
          
          if (!activeDrawMarkersRef.current['measure-floating']) {
            const labelEl = document.createElement('div');
            labelEl.className = 'label-marker-measure-floating';
            labelEl.style.width = '0px';
            labelEl.style.height = '0px';
            labelEl.style.position = 'relative';
            labelEl.style.pointerEvents = 'none';
            labelEl.innerHTML = `
              <div style="position: absolute; left: 0; top: 0; transform: translate(-50%, -50%); zoom: var(--export-annotation-scale, 1); transform-origin: center center; display: flex; align-items: center; justify-content: center;">
                <div class="custom-marker-flat" style="background-color: ${currentColor}; color: ${getContrastYIQ(currentColor)};">
                  ${dist.toFixed(2)} km
                </div>
              </div>
            `;
            activeDrawMarkersRef.current['measure-floating'] = new maplibregl.Marker({ element: labelEl })
              .setLngLat([e.lngLat.lng, e.lngLat.lat])
              .addTo(map);
          } else {
            activeDrawMarkersRef.current['measure-floating'].setLngLat([e.lngLat.lng, e.lngLat.lat]);
            activeDrawMarkersRef.current['measure-floating'].getElement().innerHTML = `
              <div style="position: absolute; left: 0; top: 0; transform: translate(-50%, -50%); zoom: var(--export-annotation-scale, 1); transform-origin: center center; display: flex; align-items: center; justify-content: center;">
                <div class="custom-marker-flat" style="background-color: ${currentColor}; color: ${getContrastYIQ(currentColor)};">
                  ${dist.toFixed(2)} km
                </div>
              </div>
            `;
          }
        }
      }
    };

    const onMouseUp = (e: maplibregl.MapMouseEvent) => {
      if (!isDrawing.current) return;

      if (activeTool === 'paint') {
        isDrawing.current = false;
        map.dragPan.enable();
        if (currentShapeCoords.current.length > 2) {
          const simplified = simplifyLine(currentShapeCoords.current);
          setAnnotations(prev => [...prev, {
            id: `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
            type: 'paint',
            color: currentColor,
            strokeType: currentStrokeType,
            coordinates: simplified
          }]);
        }
        updateActiveDrawing({ type: 'FeatureCollection', features: [] });
        clearActiveDrawMarkers();
      }

      if (activeTool === 'circle' && circleCenter.current) {
        isDrawing.current = false;
        map.dragPan.enable();
        const currentPos: [number, number] = [e.lngLat.lng, e.lngLat.lat];
        const radius = turf.distance(circleCenter.current, currentPos, { units: 'kilometers' });
        if (radius > 0) {
          const circlePoly = createCirclePolygon(circleCenter.current, radius);
          if (circlePoly) {
            setAnnotations(prev => [...prev, {
              id: `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
              type: 'circle',
              color: currentColor,
              strokeType: currentStrokeType,
              fillOpacity: currentFillOpacity ?? 0.5,
              coordinates: circlePoly.geometry.coordinates,
              radius
            }]);
          }
        }
        updateActiveDrawing({ type: 'FeatureCollection', features: [] });
        clearActiveDrawMarkers();
        setActiveDistance(null);
        circleCenter.current = null;
      }

      if (activeTool === 'arrow' && arrowStart.current) {
        const p1 = map.project(arrowStart.current);
        const p2 = e.point || map.project(e.lngLat);
        const distPx = Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));
        
        // Finalize if dragged more than 5 pixels, OR if this is the second click (which would be far from the first click's position)
        if (distPx > 5) {
          isDrawing.current = false;
          map.dragPan.enable();
          const currentPos: [number, number] = [e.lngLat.lng, e.lngLat.lat];
          const startPos: [number, number] = [arrowStart.current[0], arrowStart.current[1]];
          
          setAnnotations(prev => [...prev, {
            id: `arrow-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            type: 'arrow',
            color: currentColor,
            strokeType: currentStrokeType,
            coordinates: [startPos, currentPos]
          }]);
          updateActiveDrawing({ type: 'FeatureCollection', features: [] });
          arrowStart.current = null;
        }
      }
    };

    const onDblClick = (e: maplibregl.MapMouseEvent) => {
      if (activeTool === 'polygon' && isDrawing.current) {
        e.preventDefault(); // stop zoom
        isDrawing.current = false;
        
        // Kill the point added by the first click of the double-click sequence
        currentShapeCoords.current.pop();
        
        // Close polygon
        currentShapeCoords.current.push([...currentShapeCoords.current[0]]);
        
        if (currentShapeCoords.current.length >= 4) {
          setAnnotations(prev => [...prev, {
            id: `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
            type: 'polygon',
            color: currentColor,
            strokeType: currentStrokeType,
            fillOpacity: currentFillOpacity ?? 0.5,
            coordinates: [[...currentShapeCoords.current]]
          }]);
        }
        updateActiveDrawing({ type: 'FeatureCollection', features: [] });
        clearActiveDrawMarkers();
      }

      if (activeTool === 'measure' && isDrawing.current) {
        e.preventDefault();
        isDrawing.current = false;
        
        // Kill the point added by the first click of the double-click sequence
        const poppedIdx = currentShapeCoords.current.length - 1;
        currentShapeCoords.current.pop();
        if (activeDrawMarkersRef.current[`measure-${poppedIdx}`]) {
          activeDrawMarkersRef.current[`measure-${poppedIdx}`].remove();
          delete activeDrawMarkersRef.current[`measure-${poppedIdx}`];
        }
        
        if (currentShapeCoords.current.length >= 2) {
          setAnnotations(prev => [...prev, {
            id: `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
            type: 'measure',
            color: currentColor,
            strokeType: currentStrokeType,
            coordinates: [...currentShapeCoords.current]
          }]);
        }
        updateActiveDrawing({ type: 'FeatureCollection', features: [] });
        clearActiveDrawMarkers();
        setActiveDistance(null);
      }

      if (activeTool === 'route' && isDrawing.current) {
        e.preventDefault();
        
        const finishRoute = () => {
          isDrawing.current = false;
          if (currentShapeCoords.current.length >= 2) {
            setAnnotations(prev => [...prev, {
              id: `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
              type: 'route',
              color: currentColor,
              strokeType: currentStrokeType,
              coordinates: [...currentShapeCoords.current],
              routeGeometry: { ...routeGeometryRef.current, coordinates: [...routeGeometryRef.current.coordinates] },
              routeMode: routeMode,
              routeLegs: [...routeLegsRef.current]
            }]);
          }
          updateActiveDrawing({ type: 'FeatureCollection', features: [] });
          clearActiveDrawMarkers();
          currentDrawSessionRef.current += 1;
        };

        if (pendingFetchesRef.current > 0) {
          const checkInterval = setInterval(() => {
            if (pendingFetchesRef.current === 0) {
              clearInterval(checkInterval);
              finishRoute();
            }
          }, 50);
        } else {
          finishRoute();
        }
      }
    };

    // Disable double click zoom when using polygon or measure or route tool to prevent interference
    if (activeTool === 'polygon' || activeTool === 'measure' || activeTool === 'route') {
      map.doubleClickZoom.disable();
    } else {
      map.doubleClickZoom.enable();
    }

    const onTouchStart = (e: maplibregl.MapTouchEvent) => {
      if (e.points.length > 1) return;
      if (activeTool === 'paint' || activeTool === 'circle' || activeTool === 'arrow') {
        e.preventDefault();
        onMouseDown(e as unknown as maplibregl.MapMouseEvent);
      }
    };

    const onTouchMove = (e: maplibregl.MapTouchEvent) => {
      if (e.points.length > 1) return;
      if (isDrawing.current && (activeTool === 'paint' || activeTool === 'circle' || activeTool === 'arrow')) {
        e.preventDefault();
        onMouseMove(e as unknown as maplibregl.MapMouseEvent);
      }
    };

    const onTouchEnd = (e: maplibregl.MapTouchEvent) => {
      if (isDrawing.current && (activeTool === 'paint' || activeTool === 'circle' || activeTool === 'arrow')) {
        // In some cases touchend might lack a reliable lngLat, but Mapbox usually provides it based on changedTouches.
        // We ensure it falls back if needed.
        const fakeEvent = e as unknown as maplibregl.MapMouseEvent;
        if (!fakeEvent.lngLat && currentShapeCoords.current.length > 0) {
           const last = currentShapeCoords.current[currentShapeCoords.current.length - 1];
           fakeEvent.lngLat = new maplibregl.LngLat(last[0], last[1]);
        } else if (!fakeEvent.lngLat && activeTool === 'circle' && circleCenter.current) {
           // fallback for circle
           fakeEvent.lngLat = new maplibregl.LngLat(circleCenter.current[0], circleCenter.current[1]);
        } else if (!fakeEvent.lngLat && activeTool === 'arrow' && arrowStart.current) {
           // fallback for arrow (draws a dot basically)
           fakeEvent.lngLat = new maplibregl.LngLat(arrowStart.current[0], arrowStart.current[1]);
        }
        onMouseUp(fakeEvent);
      }
    };

    map.on('click', onClick);
    map.on('mousedown', onMouseDown);
    map.on('mousemove', onMouseMove);
    map.on('mouseup', onMouseUp);
    map.on('dblclick', onDblClick);
    map.on('touchstart', onTouchStart);
    map.on('touchmove', onTouchMove);
    map.on('touchend', onTouchEnd);

    return () => {
      map.off('click', onClick);
      map.off('mousedown', onMouseDown);
      map.off('mousemove', onMouseMove);
      map.off('mouseup', onMouseUp);
      map.off('dblclick', onDblClick);
      map.off('touchstart', onTouchStart);
      map.off('touchmove', onTouchMove);
      map.off('touchend', onTouchEnd);
    };
  }, [mapLoaded, activeTool, currentColor, currentStrokeType, currentFillOpacity, annotations, setAnnotations, activeGeojsonLayerId, setActiveGeojsonLayerId, setSelectedGeojsonFeatureId, selectedAircraftId, settings.layers, selectedIconId, routeMode, settings.googleMapsToken]);

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

      <AnimatePresence>
        {isDraggingHeadlineId && (
          <motion.div
            initial={{ y: -64, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -64, opacity: 0 }}
            id="headline-dropzone"
            className="fixed top-0 left-0 w-full h-20 p-3 z-[100] bg-black/20 backdrop-blur-md transition-colors duration-200 pointer-events-none"
          >
            <div id="headline-dropzone-inner" className="w-full h-full flex items-center justify-center border-2 border-dashed border-white/30 rounded-xl transition-colors duration-200">
              <span className="text-white/80 font-bold tracking-widest uppercase text-sm">{t("Drop here to center horizontally")}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {annotations.filter(a => a.type === 'headline').map((ann) => {
        const overrideVisible = activeTool !== 'none';
        const isHidden = !overrideVisible && (hiddenTriggers.has(ann.id) || (ann.hideAnimationTriggerId && hiddenTriggers.has(ann.hideAnimationTriggerId)));
        const isRevealed = overrideVisible || (!ann.animationTriggerId || revealedTriggers.has(ann.animationTriggerId));
        const opacity = isRevealed && !isHidden ? 1 : 0;
        const isSelected = selectedAnnotationId === ann.id;
        
        return (
          <motion.div
            key={`${ann.id}-${ann.screenPosition?.x}-${ann.screenPosition?.y}`}
            data-id={ann.id}
            drag={activeTool === 'headline' || isSelected}
            dragMomentum={false}
            onDragStart={() => {
              if (activeTool === 'headline' || isSelected) {
                setIsDraggingHeadlineId(ann.id);
              }
            }}
            onDrag={(_e, info) => {
              if (activeTool !== 'headline' && !isSelected) return;
              const isHovering = info.point.y < 80;
              const dzInner = document.getElementById('headline-dropzone-inner');
              if (dzInner) {
                if (isHovering) {
                  dzInner.classList.add('bg-white/20', 'border-white');
                  dzInner.classList.remove('border-white/30');
                } else {
                  dzInner.classList.remove('bg-white/20', 'border-white');
                  dzInner.classList.add('border-white/30');
                }
              }
            }}
            onDragEnd={(_e, info) => {
              setIsDraggingHeadlineId(null);
              if (activeTool !== 'headline' && !isSelected) return;
              
              const isDropZone = info.point.y < 80;
              
              setAnnotations(prev => prev.map(a => {
                if (a.id === ann.id) {
                  const el = document.querySelector(`.headline-overlay-element[data-id="${ann.id}"]`) as HTMLElement;
                  let currentX = a.screenPosition?.x || 0;
                  if (a.isCentered && el) {
                    currentX = window.innerWidth / 2 - el.offsetWidth / 2;
                  }
                  let newX = currentX + info.offset.x;
                  let newY = (a.screenPosition?.y || 0) + info.offset.y;
                  let isCentered = false;
                  
                  if (isDropZone) {
                    isCentered = true;
                    newX = 0;
                    newY = 12; // Centered vertically in the drop zone
                  }
                  return { ...a, screenPosition: { x: newX, y: newY }, isCentered };
                }
                return a;
              }));
            }}
            initial={false}
            animate={{ opacity }}
            transition={{ duration: 0.3 }}
            onPointerDown={(e) => {
              if ((activeTool !== 'none' && activeTool !== 'highlight') || isSelected) {
                e.stopPropagation();
                setSelectedAnnotationId(ann.id);
              }
            }}
            onDoubleClick={(e) => {
              if (activeTool === 'headline' || isSelected) {
                e.stopPropagation();
                setHeadlinePrompt?.({ id: ann.id, initialPrimary: ann.text, initialSecondary: ann.secondaryText });
              }
            }}
            className={`headline-overlay-element absolute z-[45] flex items-center gap-3 ${activeTool === 'headline' || isSelected ? 'cursor-grab active:cursor-grabbing' : (activeTool !== 'none' && activeTool !== 'highlight' ? 'cursor-pointer' : 'pointer-events-none')} ${isSelected ? 'ring-2 ring-white ring-offset-2 ring-offset-black' : ''}`}
            style={{
              left: ann.isCentered ? '50vw' : (ann.screenPosition?.x || 0),
              top: ann.screenPosition?.y || 0,
              x: ann.isCentered ? '-50%' : 0,
            }}
          >
            {ann.text && (
              <div className="font-['Gotham_Condensed'] text-[3em] font-black text-black" style={{ lineHeight: 1 }}>
                {ann.text}
              </div>
            )}
            {ann.secondaryText && (
              <div className="bg-[#FF0000] font-['Gotham_Condensed'] text-[3em] font-black text-white px-2 h-[1.1em] flex items-center justify-center" style={{ lineHeight: 1 }}>
                {ann.secondaryText}
              </div>
            )}
          </motion.div>
        );
      })}

      {(selectedCycloneId && isCycloneLayerVisible) && (
        <div 
          className="absolute bottom-[5rem] h-12 z-40 flex justify-center items-center transition-all duration-300 ease-in-out pointer-events-none"
          style={{
            left: `calc(104px + ${isSidebarOpen ? '320px' : '0px'} + ${isToolbarOpen ? '640px' : '48px'})`,
            right: '160px',
          }}
        >
          <div className="w-[75%] h-full bg-black rounded-full px-6 shadow-lg flex items-center justify-between pointer-events-auto relative">
            <span className="text-white/50 font-mono text-[10px] font-bold z-10 w-10 select-none">START</span>
            
            <div className="flex-1 relative h-6 flex items-center mx-4 group">
              <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-1 bg-white/30 rounded-lg pointer-events-none z-0" />
              
              <div 
                className="absolute top-1/2 -translate-y-1/2 bg-white rounded-full flex items-center justify-center pointer-events-none z-10 font-bold text-black shadow-md transition-transform group-hover:scale-105 select-none"
                style={{
                  left: `calc(${cycloneTimelinePercent}% + (${0.5 - (cycloneTimelinePercent / 100)} * 48px))`,
                  width: '48px',
                  height: '20px',
                  fontFamily: 'Roboto, sans-serif',
                  fontSize: '11px',
                }}
              >
                {Math.round(cycloneTimelinePercent)}%
              </div>

              <input
                type="range"
                min="0"
                max="100"
                step="1"
                value={cycloneTimelinePercent}
                onChange={(e) => setCycloneTimelinePercent(Number(e.target.value))}
                onTouchStart={(e) => {
                  e.stopPropagation();
                  const rect = e.currentTarget.getBoundingClientRect();
                  const update = (clientX: number) => {
                    const x = clientX - rect.left;
                    const pct = Math.max(0, Math.min(100, (x / rect.width) * 100));
                    setCycloneTimelinePercent(pct);
                  };
                  update(e.touches[0].clientX);
                }}
                onTouchMove={(e) => {
                  e.stopPropagation();
                  const rect = e.currentTarget.getBoundingClientRect();
                  const x = e.touches[0].clientX - rect.left;
                  const pct = Math.max(0, Math.min(100, (x / rect.width) * 100));
                  setCycloneTimelinePercent(pct);
                }}
                onTouchEnd={(e) => e.stopPropagation()}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20 m-0 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-[48px] [&::-webkit-slider-thumb]:h-[20px]"
              />
            </div>
            
            <span className="text-white/50 font-mono text-[10px] font-bold z-10 w-10 text-right select-none">END</span>
          </div>
        </div>
      )}

      {isNighttimeLayerVisible && (
        <div 
          className={`absolute h-12 z-40 flex justify-center items-center transition-all duration-300 ease-in-out pointer-events-none ${(selectedCycloneId && isCycloneLayerVisible) ? 'bottom-[8.5rem]' : (hasDateLayers ? 'bottom-[5rem]' : 'bottom-6')}`}
          style={{
            left: `calc(104px + ${isSidebarOpen ? '320px' : '0px'} + ${isToolbarOpen ? '640px' : '48px'})`,
            right: '160px',
          }}
        >
          <div className="w-[75%] h-full bg-black rounded-full px-6 shadow-lg flex items-center justify-between pointer-events-auto relative">
            <span className="text-white/50 font-mono text-[10px] font-bold z-10 w-8 select-none">00:00</span>
            
            <div className="flex-1 relative h-6 flex items-center mx-4 group">
              <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-1 bg-white/30 rounded-lg pointer-events-none z-0" />
              
              <div 
                className="absolute top-1/2 -translate-y-1/2 bg-white rounded-full flex items-center justify-center pointer-events-none z-10 font-bold text-black shadow-md transition-transform group-hover:scale-105 select-none"
                style={{
                  left: `calc(${(nighttimeHour / 24) * 100}% + (${0.5 - (nighttimeHour / 24)} * 48px))`,
                  width: '48px',
                  height: '20px',
                  fontFamily: 'Roboto, sans-serif',
                  fontSize: '11px',
                }}
              >
                {Math.floor(nighttimeHour).toString().padStart(2, '0')}:{Math.floor((nighttimeHour % 1) * 60).toString().padStart(2, '0')}
              </div>

              <input
                type="range"
                min="0"
                max="24"
                step="0.1"
                value={nighttimeHour}
                onChange={(e) => {
                  if (setSettings && activeNighttimeLayer) {
                    setSettings(prev => ({
                      ...prev,
                      layers: prev.layers.map(l => l.id === activeNighttimeLayer.id ? { ...l, nighttimeHour: Number(e.target.value) } : l)
                    }));
                  }
                }}
                onTouchStart={(e) => {
                  e.stopPropagation();
                  const rect = e.currentTarget.getBoundingClientRect();
                  const update = (clientX: number) => {
                    const x = clientX - rect.left;
                    const val = Math.max(0, Math.min(24, (x / rect.width) * 24));
                    if (setSettings && activeNighttimeLayer) {
                      setSettings(prev => ({
                        ...prev,
                        layers: prev.layers.map(l => l.id === activeNighttimeLayer.id ? { ...l, nighttimeHour: val } : l)
                      }));
                    }
                  };
                  update(e.touches[0].clientX);
                }}
                onTouchMove={(e) => {
                  e.stopPropagation();
                  const rect = e.currentTarget.getBoundingClientRect();
                  const x = e.touches[0].clientX - rect.left;
                  const val = Math.max(0, Math.min(24, (x / rect.width) * 24));
                  if (setSettings && activeNighttimeLayer) {
                    setSettings(prev => ({
                      ...prev,
                      layers: prev.layers.map(l => l.id === activeNighttimeLayer.id ? { ...l, nighttimeHour: val } : l)
                    }));
                  }
                }}
                onTouchEnd={(e) => e.stopPropagation()}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20 m-0 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-[48px] [&::-webkit-slider-thumb]:h-[20px]"
              />
            </div>
            
            <span className="text-white/50 font-mono text-[10px] font-bold z-10 w-8 text-right select-none">24:00</span>
          </div>
        </div>
      )}
    </div>
  );
};

export const MapContainer: React.FC<MapContainerProps> = (props) => {
  const { t, language } = useTranslation();
  const [map1, setMap1] = useState<maplibregl.Map | null>(null);
  const [map2, setMap2] = useState<maplibregl.Map | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const map1MarkersRef = useRef<{ [id: string]: maplibregl.Marker }>({});
  
  const splitLayer = props.settings.layers.find(l => l.type === 'split' && l.visible);
  const [splitPos, setSplitPos] = useState(splitLayer?.splitPosition ? splitLayer.splitPosition * 100 : 50);
  const [splitVertical, setSplitVertical] = useState(splitLayer?.splitDirection !== 'horizontal');

  // --- VIDEO EXPORT STATE ---
  const [videoExportState, setVideoExportState] = useState<{
    active: boolean;
    formats: ('landscape' | 'portrait' | 'square')[];
    currentFormat: 'landscape' | 'portrait' | 'square';
    progress: number;
    total: number;
    message: string;
    duration: number;
    scaleTransform: string;
    width: number;
    height: number;
    imageExportScale?: number;
  } | null>(null);



  const generateAEJSX = (viewsToVisit: any[], duration: number) => {
    let script = `(function() {
  app.beginUndoGroup("Import OBERMAP Animation");

  var comp = app.project.activeItem;
  if (!comp || !(comp instanceof CompItem)) {
    alert("Please select the containing comp or Map Comp in the Project panel/Timeline before running this script.");
    return;
  }

  var layer = comp.selectedLayers.length > 0 ? comp.selectedLayers[0] : null;
  if (!layer) {
    for (var i = 1; i <= comp.numLayers; i++) {
      if (comp.layer(i).property("Effects").property("Latitude") != null) {
        layer = comp.layer(i);
        break;
      }
    }
  }

  if (!layer || layer.property("Effects").property("Latitude") == null) {
    alert("Could not find a layer with Geolayers effects (Latitude, Longitude, Zoom). Please select the Map Comp layer and try again.");
    return;
  }

  function getParam(effectName) {
    var eff = layer.property("Effects").property(effectName);
    if (!eff) return null;
    return eff.property(1); // Get slider/angle value
  }

  var latProp = getParam("Latitude");
  var lonProp = getParam("Longitude");
  var zoomProp = getParam("Zoom");
  var bearingProp = getParam("Bearing");
  var pitchProp = getParam("Pitch");
  
  if (!latProp || !lonProp || !zoomProp) {
      alert("Geolayers properties missing on layer.");
      return;
  }

  // Clear existing keyframes
  while (latProp.numKeys > 0) latProp.removeKey(1);
  while (lonProp.numKeys > 0) lonProp.removeKey(1);
  while (zoomProp.numKeys > 0) zoomProp.removeKey(1);
  if (bearingProp) while (bearingProp.numKeys > 0) bearingProp.removeKey(1);
  if (pitchProp) while (pitchProp.numKeys > 0) pitchProp.removeKey(1);

  var easeIn = new KeyframeEase(0, 33);
  var easeOut = new KeyframeEase(0, 33);

  function addKey(prop, time, value) {
      if (!prop) return;
      var k = prop.addKey(time);
      prop.setValueAtKey(k, value);
      prop.setTemporalEaseAtKey(k, [easeIn], [easeOut]);
  }
`;

    let currentTime = 0;

    for (let i = 0; i < viewsToVisit.length; i++) {
      const v = viewsToVisit[i].view;
      
      if (i > 0) {
        currentTime += duration;
      }
      
      script += `
  addKey(latProp, ${currentTime}, ${v.center[1]});
  addKey(lonProp, ${currentTime}, ${v.center[0]});
  addKey(zoomProp, ${currentTime}, ${v.zoom});
  addKey(bearingProp, ${currentTime}, ${v.bearing || 0});
  addKey(pitchProp, ${currentTime}, ${v.pitch || 0});
`;
      
      // Add hold frame
      if (i === 0) {
        currentTime += 2; // Pause 2s at the start
      } else {
        currentTime += 1; // Pause 1s at each stop
      }
      
      script += `
  addKey(latProp, ${currentTime}, ${v.center[1]});
  addKey(lonProp, ${currentTime}, ${v.center[0]});
  addKey(zoomProp, ${currentTime}, ${v.zoom});
  addKey(bearingProp, ${currentTime}, ${v.bearing || 0});
  addKey(pitchProp, ${currentTime}, ${v.pitch || 0});
`;
    }

    script += `
  app.endUndoGroup();
})();`;

    return script;
  };

  const startExportSequence = async (formats: ('landscape' | 'portrait' | 'square')[], fileTypes: ('mp4' | 'jsx')[], duration: number, dynamicLabels: boolean = true, bitrate: number = 15, showName?: string | null) => {
    if (!map1 || formats.length === 0 || fileTypes.length === 0) return;
    
    if (fileTypes.includes('mp4') && typeof window.VideoEncoder === 'undefined') {
      await customAlert(t('Video export requires a modern browser and a secure context (HTTPS). WebCodecs API is not available on this server.'));
      return;
    }
    
    // Disable user interactions
    document.body.classList.add('is-recording');

    const shakemapDots = document.querySelectorAll('.shakemap-marker-dot');
    shakemapDots.forEach((el: any) => el.style.display = 'none');

    // Reset all animation triggers
    // We will reset animation triggers inside the format loop

    // Hide labels and highlights initially if dynamicLabels is enabled
    if (dynamicLabels) {
      props.annotations.forEach(ann => {
        if (ann.type === 'label' || ann.type === 'highlight') {
          map1!.setFeatureState({ source: 'custom-annotations', id: ann.id }, { visible: false });
        }
      });
    }
    
    const formatsToRender = formats;
    
    // Calculate total views: defaultView + label views
    const labelAnnotations = props.annotations.filter(a => (a.type === 'label' || a.type === 'highlight') && a.text && a.view);
    const viewsToVisit = [
      { view: props.settings.defaultView, annotationId: 'overview', animationTriggerId: undefined, hideAnimationTriggerId: undefined },
      ...labelAnnotations.map(a => ({ view: a.view!, annotationId: a.id, animationTriggerId: a.animationTriggerId, hideAnimationTriggerId: a.hideAnimationTriggerId }))
    ];
    const totalViews = viewsToVisit.length;

    // Generate JSX if requested
    if (fileTypes.includes('jsx')) {
      const jsxContent = generateAEJSX(viewsToVisit, duration);
      const blob = new Blob([jsxContent], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const safeShowName = (showName || 'obermap_tour').replace(/\s+/g, '_');
      a.download = `${safeShowName}.jsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      if (!fileTypes.includes('mp4')) {
        // Exit early since we don't need the MP4
        setVideoExportState(null);
        document.body.classList.remove('is-recording');
        window.dispatchEvent(new CustomEvent('resetAnimationTriggers'));
        
        // Restore earthquake filters
        window.dispatchEvent(new CustomEvent('restoreEarthquakeDotsForExport'));
        
        // Restore dynamic labels
        if (dynamicLabels) {
          props.annotations.forEach(ann => {
            if (ann.type === 'label' || ann.type === 'highlight') {
              map1!.setFeatureState({ source: 'custom-annotations', id: ann.id }, { visible: true });
            }
          });
        }
        return;
      }
    }

    try {
      const originalContainerWidth = containerRef.current?.clientWidth || window.innerWidth;
      const originalContainerHeight = containerRef.current?.clientHeight || window.innerHeight;

      // Create a helper to apply crop transformation to a view
      const applyCropToView = (view: { center: [number, number], zoom: number, pitch?: number, bearing?: number, elevation?: number }, cropSetting: { scale: number, offsetX: number, offsetY: number } | undefined, targetWidth: number, format: 'landscape'|'portrait'|'square') => {
        const aspect = format === 'landscape' ? 16/9 : format === 'portrait' ? 9/16 : 1;
        let maxW = originalContainerWidth;
        let maxH = originalContainerWidth / aspect;
        if (maxH > originalContainerHeight) {
          maxH = originalContainerHeight;
          maxW = originalContainerHeight * aspect;
        }

        if (!cropSetting) {
          // Even without a crop setting, we need to adjust zoom for the container resize
          // so that the maximum box fills the target dimensions.
          const newZoom = view.zoom + Math.log2(targetWidth / maxW);
          return { ...view, zoom: newZoom };
        }
        
        const { scale, offsetX, offsetY } = cropSetting;

        // targetWidth / (maxW * scale) is the exact scaling factor from the crop box to the target video/image
        const newZoom = view.zoom + Math.log2(targetWidth / (maxW * scale));
        
        const lngToX = (lng: number) => (lng + 180) / 360;
        const latToY = (lat: number) => {
          const sinLat = Math.sin(lat * Math.PI / 180);
          return 0.5 - 0.25 * Math.log((1 + sinLat) / (1 - sinLat)) / Math.PI;
        };
        const xToLng = (x: number) => x * 360 - 180;
        const yToLat = (y: number) => {
          const n = Math.PI - 2 * Math.PI * y;
          return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
        };

        const worldSize = 512 * Math.pow(2, view.zoom);
        const centerX = lngToX(view.center[0]);
        const centerY = latToY(view.center[1]);
        
        const mercatorDx = offsetX / worldSize;
        const mercatorDy = offsetY / worldSize;
        
        const newLng = xToLng(centerX + mercatorDx);
        const newLat = yToLat(centerY + mercatorDy);

        return {
          ...view,
          center: [newLng, newLat] as [number, number],
          zoom: newZoom
        };
      };

      for (let fIdx = 0; fIdx < formatsToRender.length; fIdx++) {
        const currentFmt = formatsToRender[fIdx];
        const cropSetting = props.settings.exportCropSettings?.[currentFmt];
        const targetWidth = currentFmt === 'landscape' ? 1920 : currentFmt === 'portrait' ? 1080 : 1920;
        const targetHeight = currentFmt === 'landscape' ? 1080 : currentFmt === 'portrait' ? 1920 : 1920;
        
        // Map original views to cropped views for this format
        const currentViewsToVisit = viewsToVisit.map(v => ({
          ...v,
          view: applyCropToView(v.view, cropSetting, targetWidth, currentFmt)
        }));

        if (currentViewsToVisit.length > 0 && fIdx === 0) {
          map1!.jumpTo({
            center: currentViewsToVisit[0].view.center,
            zoom: currentViewsToVisit[0].view.zoom,
            pitch: currentViewsToVisit[0].view.pitch,
            bearing: currentViewsToVisit[0].view.bearing,
            ...(currentViewsToVisit[0].view.elevation !== undefined ? { elevation: currentViewsToVisit[0].view.elevation } : {})
          });
          // Let the map move to the starting position BEFORE starting the video export sequence
          await new Promise(r => setTimeout(r, 1000));
        }

        // Reset all animation triggers at the start of each format to prevent double-firing
        window.dispatchEvent(new CustomEvent('resetAnimationTriggers'));



      
      // Hide earthquake dots if shakemap is visible
      window.dispatchEvent(new CustomEvent('hideEarthquakeDotsForExport'));
      
      // Calculate scale so it fits on screen
      const screenW = window.innerWidth;
      const screenH = window.innerHeight;
      const scale = Math.min(screenW / targetWidth, screenH / targetHeight) * 0.8;
      
      setVideoExportState({
        active: true,
        formats,
        currentFormat: currentFmt,
        progress: 0,
        total: totalViews,
        message: formatsToRender.length > 1 ? `${t("Rendering")} ${currentFmt.toUpperCase()} (${t("Video")} ${fIdx + 1} ${t("of")} ${formatsToRender.length})...` : t("Rendering Video..."),
        duration,
        scaleTransform: `scale(${scale})`,
        width: targetWidth,
        height: targetHeight
      });

      // Wait a bit for React to render the massive container
      await new Promise(r => setTimeout(r, 500));
      map1.resize();
      await new Promise(r => setTimeout(r, 1000)); // allow tiles to load at new res

      // PRELOAD SVGS FOR COMPOSITOR
      const preloadedIcons = new Map<string, HTMLImageElement>();
      for (const ann of props.annotations) {
        if (ann.type === 'icon' && ann.iconId) {
          const iconObj = props.settings.icons?.flatMap(c => c.icons).find(i => i.id === ann.iconId);
          if (iconObj) {
            const colorHex = ann.color || '#ffffff';
            const contrast = getContrastYIQ(colorHex);
            
            const parser = new DOMParser();
            const doc = parser.parseFromString(iconObj.svg, 'image/svg+xml');
            const svgEl = doc.querySelector('svg');
            if (svgEl) {
              svgEl.setAttribute('width', '48');
              svgEl.setAttribute('height', '48');
              if (svgEl.getAttribute('fill') === 'currentColor') svgEl.setAttribute('fill', contrast);
              if (svgEl.getAttribute('stroke') === 'currentColor') svgEl.setAttribute('stroke', contrast);
              
              const elements = svgEl.querySelectorAll('*');
              for (let j = 0; j < elements.length; j++) {
                const p = elements[j];
                if (p.getAttribute('fill') === 'currentColor') p.setAttribute('fill', contrast);
                if (p.getAttribute('stroke') === 'currentColor') p.setAttribute('stroke', contrast);
                const htmlEl = p as HTMLElement;
                if (htmlEl.style?.fill === 'currentColor') htmlEl.style.fill = contrast;
                if (htmlEl.style?.stroke === 'currentColor') htmlEl.style.stroke = contrast;
              }
              const finalSvgStr = new XMLSerializer().serializeToString(doc);
              
              const img = new Image();
              await new Promise((resolve) => {
                img.onload = resolve;
                img.onerror = (e) => {
                  console.error("Failed to load SVG icon:", e, finalSvgStr);
                  resolve(null);
                };
                img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(finalSvgStr)));
              });
              preloadedIcons.set(ann.id, img);
            }
          }
        }
      }

      const preloadedLabels = new Map<string, HTMLImageElement>();
      for (const ann of props.annotations) {
        if (ann.type === 'label' || ann.type === 'highlight') {
          const el = document.querySelector(`.label-marker-${ann.id}`);
          if (el && el.classList.contains('label-marker')) {
            try {
              const img = await globalLabelManager.getRasterizedImage(ann.id, props.settings.exportAnnotationScale ?? 1.0);
              if (img) preloadedLabels.set(ann.id, img);
            } catch (e) {
              console.error('Failed to rasterize label for video export', e);
            }
          }
        }
      }

      const preloadedWeatherIcons = new Map<string, HTMLImageElement>();
      const weatherMarkers = document.querySelectorAll('.custom-city-weather-marker');
      for (let i = 0; i < weatherMarkers.length; i++) {
        const el = weatherMarkers[i];
        const svgEl = el.querySelector('svg');
        const nameSpan = el.querySelector('span');
        if (svgEl && nameSpan) {
          const doc = new DOMParser().parseFromString(svgEl.outerHTML, 'image/svg+xml');
          const finalSvgStr = new XMLSerializer().serializeToString(doc);
          const img = new Image();
          await new Promise((resolve) => {
            img.onload = resolve;
            img.onerror = resolve;
            img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(finalSvgStr)));
          });
          preloadedWeatherIcons.set(nameSpan.innerText, img);
        }
      }


      // INIT MUXER
      const muxer = new Mp4Muxer.Muxer({
        target: new Mp4Muxer.ArrayBufferTarget(),
        video: { codec: 'avc', width: targetWidth, height: targetHeight },
        fastStart: 'in-memory'
      });
      
      const videoEncoder = new VideoEncoder({
        output: (chunk, meta) => muxer.addVideoChunk(chunk, meta as any),
        error: (e) => console.error(e)
      });
      
      videoEncoder.configure({
        codec: 'avc1.640034',
        width: targetWidth,
        height: targetHeight,
        bitrate: bitrate * 1_000_000,
        framerate: 60
      });

      // COMPOSITOR CANVAS
      const compositorCanvas = document.createElement('canvas');
      compositorCanvas.width = targetWidth;
      compositorCanvas.height = targetHeight;
      const ctx = compositorCanvas.getContext('2d', { willReadFrequently: true })!;

      // CAPTURE MAPBOX SYNCHRONOUSLY TO AVOID BUFFER CLEARING
      let isRecording = true;
      const mapCanvas = map1.getCanvas();
      
      const offscreenMapCanvas = document.createElement('canvas');
      offscreenMapCanvas.width = mapCanvas.width;
      offscreenMapCanvas.height = mapCanvas.height;
      const offscreenMapCtx = offscreenMapCanvas.getContext('2d', { willReadFrequently: true })!;
      
      const renderHandler = () => {
        if (!isRecording) return;
        if (offscreenMapCanvas.width !== mapCanvas.width) offscreenMapCanvas.width = mapCanvas.width;
        if (offscreenMapCanvas.height !== mapCanvas.height) offscreenMapCanvas.height = mapCanvas.height;
        offscreenMapCtx.clearRect(0, 0, offscreenMapCanvas.width, offscreenMapCanvas.height);
        offscreenMapCtx.drawImage(mapCanvas, 0, 0);
      };
      
      map1.on('render', renderHandler);
      map1.triggerRepaint(); // Force initial capture

      // RENDER LOOP
      let frameCount = 0;
      
      const captureFrame = () => {
        if (!isRecording) return;
        
        ctx.clearRect(0, 0, targetWidth, targetHeight);
        ctx.drawImage(offscreenMapCanvas, 0, 0, targetWidth, targetHeight);
        
        
        Object.entries(map1MarkersRef.current).forEach(([id, markerInfo]) => {
          const ann = props.annotations.find(a => a.id === id);

          const el = markerInfo.getElement();
          if (!el || el.style.opacity === '0' || el.style.visibility === 'hidden' || el.style.display === 'none') return;
          
          const lngLat = markerInfo.getLngLat();
          if (!lngLat) return;
          
          const point = map1!.project(lngLat);
          ctx.save();
          ctx.translate(point.x, point.y);
          
          const annScale = props.settings.exportAnnotationScale ?? 1.0;
          ctx.scale(annScale, annScale);
          
          let innerEl = el;
          if (el.className.includes('label-marker-')) {
            innerEl = el.querySelector('.custom-marker-flat') as HTMLElement 
              || el.querySelector('.custom-marker-dot') as HTMLElement
              || el.querySelector('.icon-marker') as HTMLElement
              || el.querySelector('.custom-highlight-marker') as HTMLElement
              || el.querySelector('.custom-country-marker') as HTMLElement
              || el;
          }
          
          let opacity = parseFloat(window.getComputedStyle(innerEl).opacity || window.getComputedStyle(el).opacity || '1');
          if (isNaN(opacity)) opacity = 1;
          ctx.globalAlpha = opacity;

          if (innerEl.classList.contains('custom-marker')) {
            const plate = innerEl.querySelector('.custom-marker-plate') as HTMLElement;
            const textEl = innerEl.querySelector('.custom-marker-text') as HTMLElement;
            if (plate && textEl) {
              const spans = textEl.querySelectorAll('span');
              const lines = spans.length > 0 ? Array.from(spans).map(s => s.textContent || '') : [textEl.textContent?.trim() || ''];
              
              ctx.font = '600 12px Roboto, sans-serif';
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              
              const textW = Math.max(...lines.map(l => ctx.measureText(l.toUpperCase()).width));
              const boxW = textW + 16;
              const boxH = lines.length > 1 ? 32 : 20;
              const pointerH = 6;
              
              const startX = -boxW / 2;
              const startY = -(boxH + pointerH);
              
              const clipStr = window.getComputedStyle(plate).clipPath || '';
              let clipTop = 0;
              if (clipStr.includes('inset')) {
                const match = clipStr.match(/inset\(([-\d.]+)%?/);
                if (match) clipTop = parseFloat(match[1]) || 0;
              }
              const clipPx = (clipTop / 100) * boxH;
              
              let transY = 0;
              const transStr = window.getComputedStyle(textEl).transform || '';
              if (transStr.includes('translateY')) {
                const match = transStr.match(/translateY\(([-\d.]+)%\)/);
                if (match) transY = parseFloat(match[1]) || 0;
              }
              const textOffY = (transY / 100) * boxH;

              ctx.beginPath();
              ctx.moveTo(-6, startY + boxH);
              ctx.lineTo(6, startY + boxH);
              ctx.lineTo(0, startY + boxH + pointerH);
              ctx.fillStyle = window.getComputedStyle(plate).borderColor || '#000';
              ctx.fill();

              ctx.save();
              ctx.beginPath();
              ctx.rect(startX, startY + clipPx, boxW, boxH - clipPx);
              ctx.clip();
              ctx.fillStyle = (ann && ann.color) ? ann.color : (window.getComputedStyle(plate).backgroundColor || '#000');
              ctx.fillRect(startX, startY, boxW, boxH);
              
              ctx.fillStyle = window.getComputedStyle(textEl).color || '#fff';
              if (lines.length > 1) {
                ctx.font = '600 14px Roboto, sans-serif';
                ctx.fillText(lines[0].toUpperCase(), 0, startY + boxH / 2 + textOffY - 6);
                ctx.font = '400 10px Roboto, sans-serif';
                ctx.fillText(lines[1].toUpperCase(), 0, startY + boxH / 2 + textOffY + 8);
              } else {
                ctx.fillText(lines[0].toUpperCase(), 0, startY + boxH / 2 + textOffY);
              }
              ctx.restore();
            }
          } 
          else if (innerEl.classList.contains('custom-highlight-marker')) {
            const plate = innerEl.querySelector('.custom-highlight-plate') as HTMLElement;
            const textEl = innerEl.querySelector('.custom-highlight-text') as HTMLElement;
            
            ctx.beginPath();
            ctx.arc(0, 0, 7, 0, Math.PI * 2);
            ctx.fillStyle = (ann && ann.color) ? ann.color : (window.getComputedStyle(innerEl).backgroundColor || '#000');
            ctx.fill();

            if (plate && textEl) {
              const text = (textEl.textContent?.trim() || '').toUpperCase();
              ctx.font = '700 14px Roboto, sans-serif';
              ctx.textAlign = 'left';
              ctx.textBaseline = 'middle';
              
              const boxW = ctx.measureText(text).width + 16;
              const boxH = 22;
              const startX = 15; 
              const startY = -boxH / 2;
              
              let clipLeft = 0;
              const clipStr = window.getComputedStyle(plate).clipPath || '';
              if (clipStr.includes('inset')) {
                const parts = clipStr.replace('inset(', '').replace(')', '').split(' ');
                if (parts.length > 1) clipLeft = parseFloat(parts[1]) || 0;
              }
              const clipPx = (clipLeft / 100) * boxW;
              
              let transY = 0;
              const transStr = window.getComputedStyle(textEl).transform || '';
              if (transStr.includes('translateY')) {
                const match = transStr.match(/translateY\(([-\d.]+)%\)/);
                if (match) transY = parseFloat(match[1]) || 0;
              }
              const textOffY = (transY / 100) * boxH;
              
              ctx.save();
              ctx.beginPath();
              ctx.rect(startX, startY, boxW - clipPx, boxH);
              ctx.clip();
              ctx.fillStyle = (ann && ann.color) ? ann.color : (window.getComputedStyle(plate).backgroundColor || '#000');
              ctx.fillRect(startX, startY, boxW, boxH);
              ctx.fillStyle = window.getComputedStyle(textEl).color || '#fff';
              ctx.fillText(text, startX + 8, textOffY + 1.5);
              ctx.restore();
            }
          }
          else if (innerEl.classList.contains('custom-country-marker')) {
            ctx.globalAlpha = 1.0; // Force full opacity for country markers
            const plate = innerEl.querySelector('.custom-country-plate') as HTMLElement;
            const textEl = innerEl.querySelector('.custom-country-text') as HTMLElement;
            if (plate && textEl) {
              const text = (textEl.textContent?.trim() || '').toUpperCase();
              ctx.font = '700 14px Roboto, sans-serif';
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              
              const boxW = ctx.measureText(text).width + 16;
              const boxH = 22;
              const startX = -boxW / 2;
              const startY = -boxH / 2;
              
              let clipRight = 0;
              const clipStr = window.getComputedStyle(plate).clipPath || '';
              if (clipStr.includes('inset')) {
                const parts = clipStr.replace('inset(', '').replace(')', '').split(' ');
                if (parts.length > 1) clipRight = parseFloat(parts[1]) || 0;
              }
              const clipPx = (clipRight / 100) * boxW;
              
              let transY = 0;
              const transStr = window.getComputedStyle(textEl).transform || '';
              if (transStr.includes('translateY')) {
                const match = transStr.match(/translateY\(([-\d.]+)%\)/);
                if (match) transY = parseFloat(match[1]) || 0;
              }
              const textOffY = (transY / 100) * boxH;
              
              ctx.save();
              ctx.beginPath();
              ctx.rect(startX, startY, boxW - clipPx, boxH);
              ctx.clip();
              ctx.fillStyle = (ann && ann.color) ? ann.color : (window.getComputedStyle(plate).backgroundColor || '#000');
              ctx.fillRect(startX, startY, boxW, boxH);
              ctx.fillStyle = window.getComputedStyle(textEl).color || '#fff';
              ctx.fillText(text, 0, textOffY);
              ctx.restore();
            }
          }
          else if (innerEl.classList.contains('icon-marker')) {
            const img = preloadedIcons.get(id);
            if (img && img.complete && img.naturalWidth > 0) {
              const bgStr = window.getComputedStyle(innerEl).backgroundColor || '#ffffff';
              ctx.beginPath();
              ctx.rect(-32, -32, 64, 64);
              ctx.fillStyle = bgStr;
              ctx.fill();
              ctx.drawImage(img, -24, -24, 48, 48);
            }
          }
          else if (innerEl.classList.contains('label-marker')) {
            const img = preloadedLabels.get(id);
            if (img && img.complete && img.naturalWidth > 0) {
               const offset = globalLabelManager.getAnchorOffset(id);
               const currentScale = props.settings.exportAnnotationScale ?? 1.0;
               if (offset) {
                 ctx.drawImage(img, -offset.x, -offset.y, img.naturalWidth / currentScale, img.naturalHeight / currentScale);
               }
            }
          }
          else if (innerEl.classList.contains('custom-marker-flat')) {
            const lines = el.innerHTML.split(/<br\s*\/?>/i).map((s: string) => s.replace(/<[^>]+>/g, '').trim());
            ctx.font = innerEl.classList.contains('text-xs') ? '700 12px ui-sans-serif, system-ui' : '600 12px ui-sans-serif, system-ui';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            
            const textW = Math.max(...lines.map((l: string) => ctx.measureText(l).width));
            const boxW = textW + 12;
            const boxH = lines.length === 2 ? 30 : 20;
            const startX = -boxW / 2;
            const startY = -boxH / 2;
            
            ctx.fillStyle = (ann && ann.color) ? ann.color : (window.getComputedStyle(innerEl).backgroundColor || '#000');
            ctx.fillRect(startX, startY, boxW, boxH);
            ctx.fillStyle = window.getComputedStyle(innerEl).color || '#fff';
            
            if (lines.length === 1) {
              ctx.fillText(lines[0], 0, 0);
            } else {
              ctx.fillText(lines[0], 0, -6);
              ctx.font = '600 9px ui-sans-serif, system-ui';
              ctx.globalAlpha = opacity * 0.9;
              ctx.fillText(lines[1], 0, 8);
            }
          }
          else if (innerEl.classList.contains('custom-marker-dot') || innerEl.classList.contains('custom-route-dot')) {
            ctx.beginPath();
            ctx.arc(0, 0, 12, 0, Math.PI * 2);
            ctx.fillStyle = (ann && ann.color) ? ann.color : (window.getComputedStyle(innerEl).backgroundColor || '#000');
            ctx.fill();
          }
          else if (innerEl.classList.contains('custom-city-weather-marker')) {
            const spans = innerEl.querySelectorAll('span');
            const svgDiv = innerEl.querySelector('div');
            
            ctx.font = '700 11px system-ui, -apple-system, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            
            let text = '';
            if (spans.length > 0) {
              text = Array.from(spans).map(s => s.innerText).join(' ');
            }
            
            const hasIcon = !!svgDiv;
            const textW = text ? ctx.measureText(text).width : 0;
            const iconW = hasIcon ? 14 : 0;
            const gap = (text && hasIcon) ? 6 : 0; 
            
            const totalW = textW + gap + iconW;
            const px = 6; 
            const py = 2; 
            const boxW = totalW + (px * 2);
            const boxH = 16 + (py * 2);
            
            const startX = -boxW / 2;
            const startY = (-boxH / 2) - 16; 
            
            ctx.fillStyle = '#000000';
            ctx.beginPath();
            ctx.rect(startX, startY, boxW, boxH);
            ctx.fill();
            
            ctx.fillStyle = '#ffffff';
            let currentX = startX + px;
            
            if (text) {
              ctx.fillText(text, currentX + textW/2, startY + boxH/2);
              currentX += textW + gap;
            }
            
            if (hasIcon) {
               const img = preloadedWeatherIcons.get(text);
               if (img) {
                  ctx.drawImage(img, currentX, startY + (boxH - 14) / 2, 14, 14);
               }
            }
          }
          
          ctx.restore();
        });

        props.annotations.filter(a => a.type === 'headline').forEach(ann => {
          const el = document.querySelector(`.headline-overlay-element[data-id="${ann.id}"]`) as HTMLElement;
          if (!el || parseFloat(window.getComputedStyle(el).opacity || '1') === 0) return;

          const x = ann.screenPosition?.x || 0;
          const y = ann.screenPosition?.y || 0;
          
          ctx.save();
          ctx.translate(x, y);
          ctx.textBaseline = 'middle';
          ctx.textAlign = 'left';
          
          let currentX = 0;
          const fontSize = 48; // 3em = 48px
          const bgHeight = fontSize * 1.1;
          const centerY = bgHeight / 2;
          
          if (ann.text) {
            ctx.font = `900 ${fontSize}px "Gotham Condensed"`;
            ctx.fillStyle = '#000000';
            const textStr = ann.text;
            ctx.fillText(textStr, currentX, centerY + 3);
            currentX += ctx.measureText(textStr).width;
          }
          if (ann.secondaryText) {
            if (currentX > 0) currentX += 12; // gap-3 = 12px
            ctx.font = `900 ${fontSize}px "Gotham Condensed"`;
            const secStr = ann.secondaryText;
            const secW = ctx.measureText(secStr).width;
            
            ctx.fillStyle = '#FF0000';
            ctx.fillRect(currentX - 8, 0, secW + 16, bgHeight);
            
            ctx.fillStyle = '#FFFFFF';
            ctx.fillText(secStr, currentX, centerY + 3);
          }
          
          ctx.restore();
        });

        const frame = new VideoFrame(compositorCanvas, { timestamp: frameCount * 1e6 / 60 });
        videoEncoder.encode(frame, { keyFrame: frameCount % 60 === 0 });
        frame.close();
        frameCount++;
        requestAnimationFrame(captureFrame);
      };
      
      // PRELOAD TILES BY JUMPING TO ALL VIEWS
      for (let i = 0; i < currentViewsToVisit.length; i++) {
        setVideoExportState(prev => prev ? { ...prev, message: `Preloading map tiles... (${i + 1}/${currentViewsToVisit.length})` } : null);
        const { view } = currentViewsToVisit[i];
        await new Promise<void>((resolve) => {
          map1!.jumpTo({
            center: view.center,
            zoom: view.zoom,
            pitch: view.pitch,
            bearing: view.bearing,
            ...(view.elevation !== undefined ? { elevation: view.elevation } : {})
          });
          
          let hasResolved = false;
          const onIdle = () => {
            if (!hasResolved) {
              hasResolved = true;
              map1!.off('idle', onIdle);
              // Brief delay for vector tiles
              setTimeout(resolve, 500);
            }
          };
          map1!.on('idle', onIdle);
          
          // Fallback
          setTimeout(() => {
             if (!hasResolved) {
                hasResolved = true;
                map1!.off('idle', onIdle);
                resolve();
             }
          }, 3000);
        });
      }

      // Jump back to the start
      const firstView = currentViewsToVisit[0].view;
      await new Promise<void>((resolve) => {
        map1!.jumpTo({
          center: firstView.center,
          zoom: firstView.zoom,
          pitch: firstView.pitch,
          bearing: firstView.bearing,
          ...(firstView.elevation !== undefined ? { elevation: firstView.elevation } : {})
        });
        setTimeout(resolve, 1000);
      });

      setVideoExportState(prev => prev ? { ...prev, message: formatsToRender.length > 1 ? `${t("Rendering")} ${currentFmt.toUpperCase()} (${t("Video")} ${fIdx + 1} ${t("of")} ${formatsToRender.length})...` : t("Rendering Video...") } : null);

      requestAnimationFrame(captureFrame);

      // FLY TO VIEWS
      for (let i = 0; i < currentViewsToVisit.length; i++) {
        const { view } = currentViewsToVisit[i];
        
        setVideoExportState(prev => prev ? { ...prev, progress: i + 1, total: currentViewsToVisit.length } : null);
        
        if (dynamicLabels) {
          const currId = currentViewsToVisit[i].animationTriggerId || currentViewsToVisit[i].annotationId;
          
          if (currId && currId !== 'overview') {
            window.dispatchEvent(new CustomEvent('activateExportTrigger', { detail: { triggerId: currId } }));
          }
        }

        await new Promise<void>((resolve) => {
          if (i === 0) {
            map1!.jumpTo({
              center: view.center,
              zoom: view.zoom,
              pitch: view.pitch,
              bearing: view.bearing,
              ...(view.elevation !== undefined ? { elevation: view.elevation } : {})
            });
            // Allow tiles to load and give a brief pause at the start of the video
            setTimeout(resolve, 2000);
          } else {
                        map1!.flyTo({
              center: view.center,
              zoom: view.zoom,
              pitch: view.pitch,
              bearing: view.bearing,
              duration: duration * 1000,
              essential: true
            });
                        if (view.elevation !== undefined) {
              map1!.once('moveend', () => {
                const currentCenter = map1!.getCenter();
                if (currentCenter) {
                  const dist = Math.sqrt(Math.pow(currentCenter.lng - view.center[0], 2) + Math.pow(currentCenter.lat - view.center[1], 2));
                  if (dist < 0.1) {
                    map1!.jumpTo({
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
            map1!.once('moveend', () => {
              // Wait 1 second extra to let tiles settle and to pause on the view
              setTimeout(resolve, 1000);
            });
          }
        });
      }

      // STOP AND EXPORT
      isRecording = false;
      map1!.off('render', renderHandler);
      await videoEncoder.flush();
      videoEncoder.close();
      muxer.finalize();
      
      const buffer = muxer.target.buffer;
      const blob = new Blob([buffer], { type: 'video/mp4' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const safeShowName = (showName || 'obermap_tour').replace(/\s+/g, '_');
      const fmtSuffix = language === 'de' ? (currentFmt === 'landscape' ? 'quer' : currentFmt === 'portrait' ? 'hochkant' : 'quadratisch') : currentFmt;
      a.download = `${safeShowName}_${fmtSuffix}.mp4`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
    } catch (err: any) {
      console.error('Video Export Error:', err);
      await customAlert(t('An error occurred during video export: \n{{err}}', { err: err.message || String(err) }));
    } finally {
      // RESTORE
      document.body.classList.remove('is-recording');
      const shakemapDots = document.querySelectorAll('.shakemap-marker-dot');
      shakemapDots.forEach((el: any) => el.style.display = '');

      // Restore earthquake filters
      window.dispatchEvent(new CustomEvent('restoreEarthquakeDotsForExport'));

      setVideoExportState(null);
      if (dynamicLabels) {
        props.annotations.forEach(ann => {
          if (ann.type === 'label' || ann.type === 'highlight') {
            map1!.setFeatureState({ source: 'custom-annotations', id: ann.id }, { visible: true });
          }
        });
      }
      // Resize map back to 100%
      setTimeout(() => map1?.resize(), 500);
    }
  };

  const startImageExportSequence = async (formats: ('landscape' | 'portrait' | 'square')[], filenamePrefix: string = 'obermap') => {
    if (!map1 || formats.length === 0) return;
    
    // Disable user interactions
    document.body.classList.add('is-recording');
    
    const shakemapDots = document.querySelectorAll('.shakemap-marker-dot');
    shakemapDots.forEach((el: any) => el.style.display = 'none');

    const originalZoom = map1.getZoom();
    const originalCenter = map1.getCenter();
    const originalContainerHeight = containerRef.current?.clientHeight || window.innerHeight;

    try {
      const applyCropToView = (view: { center: [number, number], zoom: number }, cropSetting: { scale: number, offsetX: number, offsetY: number } | undefined) => {
        if (!cropSetting) return { ...view };
        
        const { scale, offsetX, offsetY } = cropSetting;
        if (scale === 1 && offsetX === 0 && offsetY === 0) {
          return { ...view };
        }

        const newZoom = view.zoom - Math.log2(scale);
        
        const lngToX = (lng: number) => (lng + 180) / 360;
        const latToY = (lat: number) => {
          const sinLat = Math.sin(lat * Math.PI / 180);
          return 0.5 - 0.25 * Math.log((1 + sinLat) / (1 - sinLat)) / Math.PI;
        };
        const xToLng = (x: number) => x * 360 - 180;
        const yToLat = (y: number) => {
          const n = Math.PI - 2 * Math.PI * y;
          return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
        };

        const worldSize = 512 * Math.pow(2, view.zoom);
        const centerX = lngToX(view.center[0]);
        const centerY = latToY(view.center[1]);
        
        const mercatorDx = offsetX / worldSize;
        const mercatorDy = offsetY / worldSize;
        
        const newLng = xToLng(centerX + mercatorDx);
        const newLat = yToLat(centerY + mercatorDy);

        return {
          ...view,
          center: [newLng, newLat] as [number, number],
          zoom: newZoom
        };
      };

      for (let fIdx = 0; fIdx < formats.length; fIdx++) {
        const currentFmt = formats[fIdx];
        
        // Output image should have a height of 3840 physical pixels
        const outHeight = 3840;
        const aspect = currentFmt === 'landscape' ? 16/9 : currentFmt === 'portrait' ? 9/16 : 1;
        const outWidth = Math.round(outHeight * aspect);
        
        // Hide earthquake dots if shakemap is visible
        window.dispatchEvent(new CustomEvent('hideEarthquakeDotsForExport'));
        
        const cropSetting = props.settings.exportCropSettings?.[currentFmt];
        const croppedView = applyCropToView({ center: [originalCenter.lng, originalCenter.lat] as [number, number], zoom: originalZoom }, cropSetting);

        const dpr = window.devicePixelRatio || 1;
        const targetWidth = outWidth / dpr;
        const targetHeight = outHeight / dpr;
        
        const scaleFactor = targetHeight / originalContainerHeight;
        const newZoom = croppedView.zoom + Math.log2(scaleFactor);
        
        const screenW = window.innerWidth;
        const screenH = window.innerHeight;
        const scale = Math.min(screenW / targetWidth, screenH / targetHeight) * 0.8;
        
        setVideoExportState({
          active: true,
          formats,
          currentFormat: currentFmt,
          progress: 1,
          total: 1,
          message: formats.length > 1 ? `${t("Exporting")} ${currentFmt.toUpperCase()}...` : t("Exporting Image..."),
          duration: 0,
          scaleTransform: `scale(${scale})`,
          width: targetWidth,
          height: targetHeight,
          imageExportScale: scaleFactor
        });

        // Wait for React to apply CSS to map container
        await new Promise(r => setTimeout(r, 500));
        map1.resize();
        map1.jumpTo({ center: croppedView.center, zoom: newZoom });
        
        // Wait for map tiles to load at the new resolution
        await new Promise(r => setTimeout(r, 2000));
        
        // PRELOAD SVGS FOR COMPOSITOR
        const preloadedIcons = new Map<string, HTMLImageElement>();
        for (const ann of props.annotations) {
          if (ann.type === 'icon' && ann.iconId) {
            const iconObj = props.settings.icons?.flatMap(c => c.icons).find(i => i.id === ann.iconId);
            if (iconObj) {
              const colorHex = ann.color || '#ffffff';
              const contrast = getContrastYIQ(colorHex);
              
              const parser = new DOMParser();
              const doc = parser.parseFromString(iconObj.svg, 'image/svg+xml');
              const svgEl = doc.querySelector('svg');
              if (svgEl) {
                svgEl.setAttribute('width', '48');
                svgEl.setAttribute('height', '48');
                if (svgEl.getAttribute('fill') === 'currentColor') svgEl.setAttribute('fill', contrast);
                if (svgEl.getAttribute('stroke') === 'currentColor') svgEl.setAttribute('stroke', contrast);
                
                const elements = svgEl.querySelectorAll('*');
                for (let j = 0; j < elements.length; j++) {
                  const p = elements[j];
                  if (p.getAttribute('fill') === 'currentColor') p.setAttribute('fill', contrast);
                  if (p.getAttribute('stroke') === 'currentColor') p.setAttribute('stroke', contrast);
                  const htmlEl = p as HTMLElement;
                  if (htmlEl.style?.fill === 'currentColor') htmlEl.style.fill = contrast;
                  if (htmlEl.style?.stroke === 'currentColor') htmlEl.style.stroke = contrast;
                }
                const finalSvgStr = new XMLSerializer().serializeToString(doc);
                
                const img = new Image();
                await new Promise((resolve) => {
                  img.onload = resolve;
                  img.onerror = resolve;
                  img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(finalSvgStr)));
                });
                preloadedIcons.set(ann.id, img);
              }
            }
          }
        }

        // Pre-rasterize SVG labels
        const preloadedLabels = new Map<string, HTMLImageElement>();
        for (const ann of props.annotations) {
          if (ann.type === 'label' || ann.type === 'highlight') {
            const el = document.querySelector(`.label-marker-${ann.id}`);
            if (el && el.classList.contains('label-marker')) {
              try {
                const exportScale = outHeight / originalContainerHeight;
                const annScale = props.settings.exportAnnotationScale ?? 1.0;
                const img = await globalLabelManager.getRasterizedImage(ann.id, exportScale * annScale);
                if (img) preloadedLabels.set(ann.id, img);
              } catch (e) {
                console.error("Failed to preload label SVG", e);
              }
            }
          }
        }

        const preloadedWeatherIcons = new Map<string, HTMLImageElement>();
        const weatherMarkers = document.querySelectorAll('.custom-city-weather-marker');
        for (let i = 0; i < weatherMarkers.length; i++) {
          const el = weatherMarkers[i];
          const svgEl = el.querySelector('svg');
          const nameSpan = el.querySelector('span');
          if (svgEl && nameSpan) {
            const doc = new DOMParser().parseFromString(svgEl.outerHTML, 'image/svg+xml');
            const svgDocEl = doc.querySelector('svg');
            if (svgDocEl) {
              const finalSvgStr = new XMLSerializer().serializeToString(doc);
              const img = new Image();
              await new Promise((resolve) => {
                img.onload = resolve;
                img.onerror = resolve;
                img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(finalSvgStr)));
              });
              preloadedWeatherIcons.set(nameSpan.innerText, img);
            }
          }
        }

        // Capture map
        const mapCanvas = map1.getCanvas();
        const compositorCanvas = document.createElement('canvas');
        compositorCanvas.width = outWidth;
        compositorCanvas.height = outHeight;
        const ctx = compositorCanvas.getContext('2d', { alpha: false });
        if (!ctx) throw new Error("Canvas 2D context not supported");

        ctx.fillStyle = '#18181b';
        ctx.fillRect(0, 0, outWidth, outHeight);
        ctx.drawImage(mapCanvas, 0, 0, outWidth, outHeight);

        // Draw DOM markers
        
        Object.entries(map1MarkersRef.current).forEach(([id, markerInfo]) => {
          const ann = props.annotations.find(a => a.id === id);

          const el = markerInfo.getElement();
          if (!el || el.style.opacity === '0' || el.style.visibility === 'hidden' || el.style.display === 'none') return;
          
          // Skip shakemap red dots from export
          if (el.classList.contains('shakemap-marker-dot')) return;
          
          const lngLat = markerInfo.getLngLat();
          if (!lngLat) return;
          
          const point = map1!.project(lngLat);
          ctx.save();
          ctx.translate(point.x * dpr, point.y * dpr);
          
          const exportScale = outHeight / originalContainerHeight;
          const annScale = props.settings.exportAnnotationScale ?? 1.0;
          ctx.scale(exportScale * annScale, exportScale * annScale);
          
          let innerEl = el;
          if (el.className.includes('label-marker-')) {
            innerEl = el.querySelector('.custom-marker-flat') as HTMLElement 
              || el.querySelector('.custom-marker-dot') as HTMLElement
              || el.querySelector('.icon-marker') as HTMLElement
              || el.querySelector('.custom-highlight-marker') as HTMLElement
              || el.querySelector('.custom-country-marker') as HTMLElement
              || el;
          }
          
          let opacity = parseFloat(window.getComputedStyle(innerEl).opacity || window.getComputedStyle(el).opacity || '1');
          if (isNaN(opacity)) opacity = 1;
          ctx.globalAlpha = opacity;
          
          if (innerEl.classList.contains('custom-marker')) {
            const plate = innerEl.querySelector('.custom-marker-plate') as HTMLElement;
            const textEl = innerEl.querySelector('.custom-marker-text') as HTMLElement;
            if (plate && textEl) {
              const spans = textEl.querySelectorAll('span');
              const lines = spans.length > 0 ? Array.from(spans).map(s => s.textContent || '') : [textEl.textContent?.trim() || ''];
              
              ctx.font = '600 12px Roboto, sans-serif';
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              
              const textW = Math.max(...lines.map(l => ctx.measureText(l.toUpperCase()).width));
              const boxW = textW + 16;
              const boxH = lines.length > 1 ? 32 : 20;
              const pointerH = 6;
              
              const startX = -boxW / 2;
              const startY = -(boxH + pointerH);
              
              const clipStr = window.getComputedStyle(plate).clipPath || '';
              let clipTop = 0;
              if (clipStr.includes('inset')) {
                const match = clipStr.match(/inset\(([-\d.]+)%?/);
                if (match) clipTop = parseFloat(match[1]) || 0;
              }
              const clipPx = (clipTop / 100) * boxH;
              
              let transY = 0;
              const transStr = window.getComputedStyle(textEl).transform || '';
              if (transStr.includes('translateY')) {
                const match = transStr.match(/translateY\(([-\d.]+)%\)/);
                if (match) transY = parseFloat(match[1]) || 0;
              }
              const textOffY = (transY / 100) * boxH;

              ctx.beginPath();
              ctx.moveTo(-6, startY + boxH);
              ctx.lineTo(6, startY + boxH);
              ctx.lineTo(0, startY + boxH + pointerH);
              ctx.fillStyle = window.getComputedStyle(plate).borderColor || '#000';
              ctx.fill();

              ctx.save();
              ctx.beginPath();
              ctx.rect(startX, startY + clipPx, boxW, boxH - clipPx);
              ctx.clip();
              ctx.fillStyle = (ann && ann.color) ? ann.color : (window.getComputedStyle(plate).backgroundColor || '#000');
              ctx.fillRect(startX, startY, boxW, boxH);
              
              ctx.fillStyle = window.getComputedStyle(textEl).color || '#fff';
              if (lines.length > 1) {
                ctx.font = '600 14px Roboto, sans-serif';
                ctx.fillText(lines[0].toUpperCase(), 0, startY + boxH / 2 + textOffY - 6);
                ctx.font = '400 10px Roboto, sans-serif';
                ctx.fillText(lines[1].toUpperCase(), 0, startY + boxH / 2 + textOffY + 8);
              } else {
                ctx.fillText(lines[0].toUpperCase(), 0, startY + boxH / 2 + textOffY);
              }
              ctx.restore();
            }
          } 
          else if (innerEl.classList.contains('custom-highlight-marker')) {
            const plate = innerEl.querySelector('.custom-highlight-plate') as HTMLElement;
            const textEl = innerEl.querySelector('.custom-highlight-text') as HTMLElement;
            
            ctx.beginPath();
            ctx.arc(0, 0, 7, 0, Math.PI * 2);
            ctx.fillStyle = (ann && ann.color) ? ann.color : (window.getComputedStyle(innerEl).backgroundColor || '#000');
            ctx.fill();

            if (plate && textEl) {
              const text = (textEl.textContent?.trim() || '').toUpperCase();
              ctx.font = '700 14px Roboto, sans-serif';
              ctx.textAlign = 'left';
              ctx.textBaseline = 'middle';
              
              const boxW = ctx.measureText(text).width + 16;
              const boxH = 22;
              const startX = 15; 
              const startY = -boxH / 2;
              
              let clipLeft = 0;
              const clipStr = window.getComputedStyle(plate).clipPath || '';
              if (clipStr.includes('inset')) {
                const parts = clipStr.replace('inset(', '').replace(')', '').split(' ');
                if (parts.length > 1) clipLeft = parseFloat(parts[1]) || 0;
              }
              const clipPx = (clipLeft / 100) * boxW;
              
              let transY = 0;
              const transStr = window.getComputedStyle(textEl).transform || '';
              if (transStr.includes('translateY')) {
                const match = transStr.match(/translateY\(([-\d.]+)%\)/);
                if (match) transY = parseFloat(match[1]) || 0;
              }
              const textOffY = (transY / 100) * boxH;
              
              ctx.save();
              ctx.beginPath();
              ctx.rect(startX, startY, boxW - clipPx, boxH);
              ctx.clip();
              ctx.fillStyle = (ann && ann.color) ? ann.color : (window.getComputedStyle(plate).backgroundColor || '#000');
              ctx.fillRect(startX, startY, boxW, boxH);
              ctx.fillStyle = window.getComputedStyle(textEl).color || '#fff';
              ctx.fillText(text, startX + 8, textOffY + 1.5);
              ctx.restore();
            }
          }
          else if (innerEl.classList.contains('custom-country-marker')) {
            ctx.globalAlpha = 1.0; // Force full opacity for country markers
            const plate = innerEl.querySelector('.custom-country-plate') as HTMLElement;
            const textEl = innerEl.querySelector('.custom-country-text') as HTMLElement;
            if (plate && textEl) {
              const text = (textEl.textContent?.trim() || '').toUpperCase();
              ctx.font = '700 14px Roboto, sans-serif';
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              
              const boxW = ctx.measureText(text).width + 16;
              const boxH = 22;
              const startX = -boxW / 2;
              const startY = -boxH / 2;
              
              let clipRight = 0;
              const clipStr = window.getComputedStyle(plate).clipPath || '';
              if (clipStr.includes('inset')) {
                const parts = clipStr.replace('inset(', '').replace(')', '').split(' ');
                if (parts.length > 1) clipRight = parseFloat(parts[1]) || 0;
              }
              const clipPx = (clipRight / 100) * boxW;
              
              let transY = 0;
              const transStr = window.getComputedStyle(textEl).transform || '';
              if (transStr.includes('translateY')) {
                const match = transStr.match(/translateY\(([-\d.]+)%\)/);
                if (match) transY = parseFloat(match[1]) || 0;
              }
              const textOffY = (transY / 100) * boxH;
              
              ctx.save();
              ctx.beginPath();
              ctx.rect(startX, startY, boxW - clipPx, boxH);
              ctx.clip();
              ctx.fillStyle = (ann && ann.color) ? ann.color : (window.getComputedStyle(plate).backgroundColor || '#000');
              ctx.fillRect(startX, startY, boxW, boxH);
              ctx.fillStyle = window.getComputedStyle(textEl).color || '#fff';
              ctx.fillText(text, 0, textOffY);
              ctx.restore();
            }
          }
          else if (innerEl.classList.contains('icon-marker')) {
            const img = preloadedIcons.get(id);
            if (img && img.complete && img.naturalWidth > 0) {
              const bgStr = window.getComputedStyle(innerEl).backgroundColor || '#ffffff';
              ctx.beginPath();
              ctx.rect(-32, -32, 64, 64);
              ctx.fillStyle = bgStr;
              ctx.fill();
              ctx.drawImage(img, -24, -24, 48, 48);
            }
          }
          else if (innerEl.classList.contains('label-marker')) {
            const img = preloadedLabels.get(id);
            if (img && img.complete && img.naturalWidth > 0) {
               const offset = globalLabelManager.getAnchorOffset(id);
               const currentScale = exportScale * annScale;
               if (offset) {
                 ctx.drawImage(img, -offset.x, -offset.y, img.naturalWidth / currentScale, img.naturalHeight / currentScale);
               }
            }
          }
          else if (innerEl.classList.contains('custom-marker-flat')) {
            const lines = el.innerHTML.split(/<br\s*\/?>/i).map((s: string) => s.replace(/<[^>]+>/g, '').trim());
            ctx.font = innerEl.classList.contains('text-xs') ? '700 12px ui-sans-serif, system-ui' : '600 12px ui-sans-serif, system-ui';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            
            const textW = Math.max(...lines.map((l: string) => ctx.measureText(l).width));
            const boxW = textW + 12;
            const boxH = lines.length === 2 ? 30 : 20;
            const startX = -boxW / 2;
            const startY = -boxH / 2;
            
            ctx.fillStyle = (ann && ann.color) ? ann.color : (window.getComputedStyle(innerEl).backgroundColor || '#000');
            ctx.fillRect(startX, startY, boxW, boxH);
            ctx.fillStyle = window.getComputedStyle(innerEl).color || '#fff';
            
            if (lines.length === 1) {
              ctx.fillText(lines[0], 0, 0);
            } else {
              ctx.fillText(lines[0], 0, -6);
              ctx.font = '600 9px ui-sans-serif, system-ui';
              ctx.globalAlpha = opacity * 0.9;
              ctx.fillText(lines[1], 0, 8);
            }
          }
          else if (innerEl.classList.contains('custom-marker-dot') || innerEl.classList.contains('custom-route-dot')) {
            ctx.beginPath();
            ctx.arc(0, 0, 12, 0, Math.PI * 2);
            ctx.fillStyle = (ann && ann.color) ? ann.color : (window.getComputedStyle(innerEl).backgroundColor || '#000');
            ctx.fill();
          }
          else if (innerEl.classList.contains('custom-city-weather-marker')) {
            const spans = innerEl.querySelectorAll('span');
            const svgDiv = innerEl.querySelector('div');
            
            ctx.font = '700 11px system-ui, -apple-system, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            
            let text = '';
            if (spans.length > 0) {
              text = Array.from(spans).map(s => s.innerText).join(' ');
            }
            
            const hasIcon = !!svgDiv;
            const textW = text ? ctx.measureText(text).width : 0;
            const iconW = hasIcon ? 14 : 0;
            const gap = (text && hasIcon) ? 6 : 0; 
            
            const totalW = textW + gap + iconW;
            const px = 6; 
            const py = 2; 
            const boxW = totalW + (px * 2);
            const boxH = 16 + (py * 2);
            
            const startX = -boxW / 2;
            const startY = (-boxH / 2) - 16; 
            
            ctx.fillStyle = '#000000';
            ctx.beginPath();
            ctx.rect(startX, startY, boxW, boxH);
            ctx.fill();
            
            ctx.fillStyle = '#ffffff';
            let currentX = startX + px;
            
            if (text) {
              ctx.fillText(text, currentX + textW/2, startY + boxH/2);
              currentX += textW + gap;
            }
            
            if (hasIcon) {
               const img = preloadedWeatherIcons.get(text);
               if (img) {
                  ctx.drawImage(img, currentX, startY + (boxH - 14) / 2, 14, 14);
               }
            }
          }
          
          ctx.restore();
        });

        const dataUrl = compositorCanvas.toDataURL('image/png');
        
        // Download
        const a = document.createElement('a');
        a.href = dataUrl;
        
        // Sanitize filename prefix
        const safePrefix = (filenamePrefix || 'obermap').replace(/[^a-z0-9]/gi, '_').toLowerCase();
        const fmtSuffix = language === 'de' ? (currentFmt === 'landscape' ? 'quer' : currentFmt === 'portrait' ? 'hochkant' : 'quadratisch') : currentFmt;
        a.download = `${safePrefix}_${fmtSuffix}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
    } catch (err: any) {
      console.error('Image Export Error:', err);
      await customAlert(t('An error occurred during image export: \n{{err}}', { err: err.message || String(err) }));
    } finally {
      // Restore everything
      const shakemapDots = document.querySelectorAll('.shakemap-marker-dot');
      shakemapDots.forEach((el: any) => el.style.display = '');

      // Restore earthquake filters
      window.dispatchEvent(new CustomEvent('restoreEarthquakeDotsForExport'));

      setVideoExportState(null);
      document.body.classList.remove('is-recording');
      setTimeout(() => {
        if (map1) {
          map1.resize();
          map1.jumpTo({ center: originalCenter, zoom: originalZoom });
        }
      }, 500);
    }
  };
  // --- END VIDEO EXPORT ---

  useEffect(() => {
    const handleStartVideoExport = (e: any) => {
      const { formats, fileTypes, duration, dynamicLabels, bitrate, showName } = e.detail;
      startExportSequence(formats, fileTypes, duration, dynamicLabels, bitrate, showName);
    };

    const handleStartImageExport = (e: any) => {
      const { formats, filenamePrefix } = e.detail;
      startImageExportSequence(formats, filenamePrefix);
    };

    window.addEventListener('startVideoExport', handleStartVideoExport);
    window.addEventListener('startImageExport', handleStartImageExport);
    return () => {
      window.removeEventListener('startVideoExport', handleStartVideoExport);
      window.removeEventListener('startImageExport', handleStartImageExport);
    };
  }, [startExportSequence, startImageExportSequence]);

  useEffect(() => {
    if (!map1 || !map2) return;
    let isSyncing = false;
    const sync1to2 = () => {
      if (isSyncing) return;
      isSyncing = true;
      map2.jumpTo({ center: map1.getCenter(), zoom: map1.getZoom(), pitch: map1.getPitch(), bearing: map1.getBearing(), ...(map1.queryTerrainElevation(map1.getCenter()) !== null ? { elevation: map1.queryTerrainElevation(map1.getCenter()) || 0 } : {}) });
      isSyncing = false;
    };
    const sync2to1 = () => {
      if (isSyncing) return;
      isSyncing = true;
      map1.jumpTo({ center: map2.getCenter(), zoom: map2.getZoom(), pitch: map2.getPitch(), bearing: map2.getBearing(), ...(map2.queryTerrainElevation(map2.getCenter()) !== null ? { elevation: map2.queryTerrainElevation(map2.getCenter()) || 0 } : {}) });
      isSyncing = false;
    };
    map1.on('move', sync1to2);
    map2.on('move', sync2to1);
    return () => {
      map1.off('move', sync1to2);
      map2.off('move', sync2to1);
    };
  }, [map1, map2]);

  const handleDrag = (e: React.MouseEvent | React.TouchEvent | MouseEvent | TouchEvent) => {
    if (!isDragging || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    let clientX, clientY;
    if ('touches' in e) {
      clientX = (e as TouchEvent).touches[0].clientX;
      clientY = (e as TouchEvent).touches[0].clientY;
    } else {
      clientX = (e as MouseEvent).clientX;
      clientY = (e as MouseEvent).clientY;
    }
    
    if (splitVertical) {
      const pos = ((clientX - rect.left) / rect.width) * 100;
      setSplitPos(Math.max(0, Math.min(100, pos)));
    } else {
      const pos = ((clientY - rect.top) / rect.height) * 100;
      setSplitPos(Math.max(0, Math.min(100, pos)));
    }
  };



  useEffect(() => {
    if (isDragging) {
      const onMove = (e: MouseEvent | TouchEvent) => handleDrag(e);
      const onUp = () => setIsDragging(false);
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
      window.addEventListener('touchmove', onMove, { passive: false });
      window.addEventListener('touchend', onUp);
      return () => {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
        window.removeEventListener('touchmove', onMove);
        window.removeEventListener('touchend', onUp);
      };
    }
  }, [isDragging, splitVertical]);



  let settings1 = props.settings;
  let settings2 = props.settings;
  let layer1Name = '';
  let layer2Name = '';

  let isSplitActive = false;

  if (splitLayer && splitLayer.splitLayers && splitLayer.splitLayers.length > 0) {
    const l1 = splitLayer.splitLayers[0];
    
    settings1 = {
      ...props.settings,
      layers: props.settings.layers.flatMap(l => l.id === splitLayer.id ? [l1] : [l])
    };
    
    if (splitLayer.splitLayers.length > 1) {
      const l2 = splitLayer.splitLayers[1];
      settings2 = {
        ...props.settings,
        layers: props.settings.layers.flatMap(l => l.id === splitLayer.id ? [l2] : [l])
      };
      layer1Name = l1.name;
      layer2Name = l2.name;
      isSplitActive = true;
    } else {
      settings2 = {
        ...props.settings,
        layers: props.settings.layers.filter(l => l.id !== splitLayer.id)
      };
      layer1Name = l1.name;
      layer2Name = 'Empty';
      isSplitActive = true;
    }
  } else if (splitLayer) {
    settings1 = {
      ...props.settings,
      layers: props.settings.layers.filter(l => l.id !== splitLayer.id)
    };
  }

  const clipPath = splitVertical ? `inset(0 0 0 ${splitPos}%)` : `inset(${splitPos}% 0 0 0)`;

  return (
    <div className="w-full h-full relative overflow-hidden z-0" ref={containerRef} style={videoExportState ? { width: `${videoExportState.width}px`, height: `${videoExportState.height}px`, transform: videoExportState.scaleTransform, transformOrigin: 'top left', position: 'absolute', top: 0, left: 0 } : undefined}>
      <MapboxMap
          {...props}
          markersRef={map1MarkersRef}
          settings={settings1}
          onMapInit={setMap1}
          isExporting={!!videoExportState} imageExportScale={videoExportState?.imageExportScale}
        />
      {isSplitActive && (
        <>
          <MapboxMap {...props} settings={settings2} onMapInit={setMap2} isSecondary clipPath={clipPath} isExporting={!!videoExportState} imageExportScale={videoExportState?.imageExportScale} />
          <div 
             onDoubleClick={(e) => {
               const rect = containerRef.current?.getBoundingClientRect();
               if (rect) {
                 if (splitVertical) {
                   const pos = ((e.clientY - rect.top) / rect.height) * 100;
                   setSplitPos(Math.max(0, Math.min(100, pos)));
                 } else {
                   const pos = ((e.clientX - rect.left) / rect.width) * 100;
                   setSplitPos(Math.max(0, Math.min(100, pos)));
                 }
               }
               setSplitVertical(!splitVertical);
             }}
             onMouseDown={(e) => { e.preventDefault(); setIsDragging(true); }}
             onTouchStart={() => { setIsDragging(true); }}
             className={`absolute flex items-center justify-center z-20 touch-none ${splitVertical ? 'w-8 h-full cursor-col-resize -ml-4' : 'h-8 w-full cursor-row-resize -mt-4'}`}
             style={splitVertical ? { left: `${splitPos}%`, top: 0 } : { top: `${splitPos}%`, left: 0 }}
          >
             <div className={`bg-white shadow-[0_0_10px_rgba(0,0,0,0.5)] pointer-events-none transition-colors ${splitVertical ? 'w-[2px] h-full' : 'h-[2px] w-full'}`} />
          </div>
          {splitVertical ? (
            <>
              <div 
                className="absolute top-[24px] whitespace-nowrap bg-white text-black px-2 py-1 text-xs font-bold pointer-events-none z-30"
                style={{ right: `calc(100% - ${splitPos}% + 6px)` }}
              >
                {layer1Name}
              </div>
              <div 
                className="absolute top-[24px] whitespace-nowrap bg-white text-black px-2 py-1 text-xs font-bold pointer-events-none z-30"
                style={{ left: `calc(${splitPos}% + 6px)` }}
              >
                {layer2Name}
              </div>
            </>
          ) : (
            <>
              <div 
                className="absolute right-[24px] whitespace-nowrap bg-white text-black px-2 py-1 text-xs font-bold pointer-events-none z-30"
                style={{ bottom: `calc(100% - ${splitPos}% + 6px)` }}
              >
                {layer1Name}
              </div>
              <div 
                className="absolute right-[24px] whitespace-nowrap bg-white text-black px-2 py-1 text-xs font-bold pointer-events-none z-30"
                style={{ top: `calc(${splitPos}% + 6px)` }}
              >
                {layer2Name}
              </div>
            </>
          )}
        </>
      )}
      
      {props.activeCropOverlay && !videoExportState && (
        <CropOverlay
          format={props.activeCropOverlay}
          cropSetting={
            props.settings.exportCropSettings?.[props.activeCropOverlay] || 
            { scale: 1, offsetX: 0, offsetY: 0 }
          }
          onChange={(newSetting) => {
            if (props.setSettings) {
              props.setSettings(prev => ({
                ...prev,
                exportCropSettings: {
                  ...prev.exportCropSettings,
                  landscape: prev.exportCropSettings?.landscape || { scale: 1, offsetX: 0, offsetY: 0 },
                  portrait: prev.exportCropSettings?.portrait || { scale: 1, offsetX: 0, offsetY: 0 },
                  square: prev.exportCropSettings?.square || { scale: 1, offsetX: 0, offsetY: 0 },
                  [props.activeCropOverlay!]: newSetting
                }
              }));
            }
          }}
        />
      )}
      
      {videoExportState && createPortal(
        <div className="absolute inset-0 z-[9999] bg-black flex flex-col items-center justify-center text-white p-8" style={{ width: '100vw', height: '100vh', position: 'fixed', top: 0, left: 0 }}>
          <div className="flex flex-col items-center max-w-md w-full gap-6">
            <h2 className="text-xl font-bold tracking-widest uppercase">{videoExportState.message}</h2>
            <div className="w-full bg-white/10 h-2">
              <div 
                className="bg-white h-full transition-all duration-300"
                style={{ width: `${(videoExportState.progress / videoExportState.total) * 100}%` }}
              />
            </div>
            <p className="text-sm font-mono text-white/50">
              {t("View")} {videoExportState.progress} {t("of")} {videoExportState.total}
            </p>
            <p className="text-xs text-[#ff0000] font-bold tracking-wider mt-4 animate-pulse">{t("DO NOT INTERACT WITH THE BROWSER")}</p>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};
