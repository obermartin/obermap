import React, { useEffect, useRef, useState, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import type { Annotation, ToolType, AppSettings, StrokeType, RouteMode } from '../types';
import * as turf from '@turf/turf';
import { createCirclePolygon, calculateDistance, simplifyLine, transliterateToGerman, createArrowFeatures, decodePolyline } from '../utils/mapUtils';
import anyAscii from 'any-ascii';
import { customAlert } from '../utils/dialogService';

let globalDeepstateHistory: { id: number; createdAt: string }[] | null = null;
let globalDeepstateHistoryPromise: Promise<void> | null = null;

interface MapContainerProps {
  activeTool: ToolType;
  currentColor: string;
  currentStrokeType?: StrokeType;
  currentFillOpacity?: number;
  routeMode?: RouteMode;
  annotations: Annotation[];
  setAnnotations: React.Dispatch<React.SetStateAction<Annotation[]>>;
  labelPrompt: { lngLat: [number, number] } | null;
  setLabelPrompt: React.Dispatch<React.SetStateAction<{ lngLat: [number, number] } | null>>;
  setActiveDistance: React.Dispatch<React.SetStateAction<number | null>>;
  selectedAnnotationId: string | null;
  setSelectedAnnotationId: React.Dispatch<React.SetStateAction<string | null>>;
  settings: AppSettings;
  activeGeojsonLayerId: string | null;
  setActiveGeojsonLayerId: React.Dispatch<React.SetStateAction<string | null>>;
  selectedGeojsonFeatureId: string | number | null;
  setSelectedGeojsonFeatureId: React.Dispatch<React.SetStateAction<string | number | null>>;
  selectedIconId?: string | null;
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

export const MapboxMap: React.FC<MapContainerProps & { isSecondary?: boolean, clipPath?: string, onMapInit?: (map: mapboxgl.Map) => void }> = ({
  activeTool,
  currentColor,
  currentStrokeType,
  currentFillOpacity,
  routeMode,
  annotations,
  setAnnotations,
  labelPrompt,
  setLabelPrompt,
  setActiveDistance,
  selectedAnnotationId,
  setSelectedAnnotationId,
  settings,
  activeGeojsonLayerId,
  setActiveGeojsonLayerId,
  selectedGeojsonFeatureId,
  setSelectedGeojsonFeatureId,
  selectedIconId,
  isSecondary,
  clipPath,
  onMapInit
}) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [selectedAircraftId, setSelectedAircraftIdState] = useState<string | null>(null);
  const [selectedVesselMmsi, setSelectedVesselMmsi] = useState<string | null>(null);
  
  const setSelectedAircraftId = useCallback((id: string | null) => {
    setSelectedAircraftIdState(id);
    window.dispatchEvent(new CustomEvent('aircraftSelected', { detail: id }));
  }, []);

  useEffect(() => {
    const vesselHandler = (e: CustomEvent<string | null>) => setSelectedVesselMmsi(e.detail);
    window.addEventListener('vesselSelected', vesselHandler as EventListener);
    return () => window.removeEventListener('vesselSelected', vesselHandler as EventListener);
  }, []);

  const selectedAircraftIdRef = useRef<string | null>(null);
  const selectedFlightTrackRef = useRef<number[][]>([]);

  useEffect(() => {
    selectedAircraftIdRef.current = selectedAircraftId;
  }, [selectedAircraftId]);

  const originalFiltersRef = useRef<{ [layerId: string]: any }>({});
  const markersRef = useRef<{ [id: string]: mapboxgl.Marker }>({});
  const deepstateDatesRef = useRef<{ [layerId: string]: string | undefined }>({});
  const activeDrawMarkersRef = useRef<{ [id: string]: mapboxgl.Marker }>({});
  const openSkyTokenRef = useRef<{ token: string, expires: number } | null>(null);
  const aircraftPopupRef = useRef<mapboxgl.Popup | null>(null);
  const selectedAircraftMetaRef = useRef<any>(null);
  const vesselsRef = useRef<Map<string, any>>(new Map());
  const wsRef = useRef<WebSocket | null>(null);
  const vesselPopupRef = useRef<mapboxgl.Popup | null>(null);
  const activeVesselMmsiRef = useRef<string | null>(null);
  const routeClickTimeoutRef = useRef<NodeJS.Timeout | null>(null);

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

  useEffect(() => {
    if (!mapContainer.current) return;

    setMapLoaded(false);

    mapboxgl.accessToken = settings.mapboxToken;
    const map = new mapboxgl.Map({
      container: mapContainer.current,
      style: settings.mapboxStyle,
      center: settings.defaultView.center,
      zoom: settings.defaultView.zoom,
      pitch: settings.defaultView.pitch,
      bearing: settings.defaultView.bearing,
      preserveDrawingBuffer: true,
      attributionControl: false
    });
    
    mapRef.current = map;
    onMapInit?.(map);

    // Add Orbital controls (NavigationControl)
    map.addControl(new mapboxgl.NavigationControl({ visualizePitch: true, showZoom: false }), 'top-right');
    
    // Add Scale control
    map.addControl(new mapboxgl.ScaleControl({ maxWidth: 150, unit: 'metric' }), 'top-right');

    map.on('load', () => {
      if (mapRef.current !== map) return;


      // Find first symbol layer to render deepstate below labels
      const styleLayers = map.getStyle().layers || [];
      let firstSymbolId;
      let initFirstAdminId;
      for (let i = 0; i < styleLayers.length; i++) {
        const id = styleLayers[i].id;
        if (!initFirstAdminId && (id.includes('admin') || id.includes('border') || id.includes('boundar') || id.includes('coutry'))) {
          initFirstAdminId = id;
        }
        if (styleLayers[i].type === 'symbol') {
          if (!firstSymbolId) firstSymbolId = id;
          if (!id.startsWith('custom-')) {
            originalFiltersRef.current[id] = styleLayers[i].filter || null;
          }
        }
      }

      // Add custom annotations source
      map.addSource('custom-annotations', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
      });

      // Polygons & Circles (Filled)
      map.addLayer({
        id: 'custom-polygons',
        type: 'fill',
        source: 'custom-annotations',
        filter: ['==', '$type', 'Polygon'],
        paint: {
          'fill-opacity': ['coalesce', ['get', 'fillOpacity'], 0.5],
          'fill-color': ['coalesce', ['get', 'color'], '#ffffff']
        }
      }, firstSymbolId);



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

      // Add clip layer for hiding mapbox symbols under highlights
      map.addSource('highlight-clip-source', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
      });

      map.addLayer({
        id: 'highlight-clip-layer',
        type: 'clip',
        source: 'highlight-clip-source',
        layout: {
          'clip-layer-types': ['symbol']
        }
      });

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
          'line-color': ['coalesce', ['get', 'color'], '#ffffff']
        }
      }, firstSymbolId);

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
          'line-dasharray': [2, 2]
        }
      }, firstSymbolId);

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
          'line-dasharray': [0.01, 2.5]
        }
      }, firstSymbolId);

      // Setup complete
      setMapLoaded(true);
      
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
      }, firstSymbolId);

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
      }, firstSymbolId);

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
      }, firstSymbolId);
      map.addLayer({
        id: 'geojson-selected-line',
        type: 'line',
        source: 'selected-geojson-feature',
        paint: {
          'line-width': 8,
          'line-color': '#ffffff',
          'line-dasharray': [2, 2]
        }
      }, firstSymbolId);
    });

    // Add flyTo listener
    const handleFlyTo = ((e: CustomEvent<Annotation['view']>) => {
      const view = e.detail;
      if (view && mapRef.current) {
        mapRef.current.flyTo({
          center: view.center,
          zoom: view.zoom,
          pitch: view.pitch,
          bearing: view.bearing,
          duration: 2000,
          essential: true
        });
      }
    }) as EventListener;
    window.addEventListener('flyToView', handleFlyTo);

    mapRef.current = map;

    return () => {
      window.removeEventListener('flyToView', handleFlyTo);
      map.remove();
      mapRef.current = null;
    };
  }, [settings.mapboxToken, settings.mapboxStyle]);

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
        bearing: map.getBearing()
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
        bearing: map.getBearing()
      };
      const event = new CustomEvent('viewCapturedForPosition', { detail: view });
      window.dispatchEvent(event);
    };
    
    window.addEventListener('requestViewCapture', handleRequestViewCapture);
    window.addEventListener('requestViewCaptureForPosition', handleRequestViewCaptureForPosition);
    return () => {
      window.removeEventListener('requestViewCapture', handleRequestViewCapture);
      window.removeEventListener('requestViewCaptureForPosition', handleRequestViewCaptureForPosition);
    };
  }, []);

  useEffect(() => {
    if (isSecondary) return;
    const handleSaveLabel = ((e: CustomEvent<string>) => {
      const text = e.detail;
      const map = mapRef.current;
      if (text && labelPrompt && map) {
        const newLabel: Annotation = {
          id: Date.now().toString(),
          type: 'label',
          color: currentColor,
          text,
          coordinates: labelPrompt.lngLat,
          view: {
            center: [map.getCenter().lng, map.getCenter().lat],
            zoom: map.getZoom(),
            pitch: map.getPitch(),
            bearing: map.getBearing()
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
    const handleDropIcon = ((e: CustomEvent<{ clientX: number, clientY: number, iconId: string, color: string }>) => {
      if (!mapRef.current) return;
      const lngLat = mapRef.current.unproject([e.detail.clientX, e.detail.clientY]);
      setAnnotations(prev => [...prev, {
        id: Date.now().toString(),
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
    const source = mapRef.current.getSource('custom-annotations') as mapboxgl.GeoJSONSource;
    if (!source) return;

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
      return acc;
    }, []);

    source.setData({ type: 'FeatureCollection', features });

    // Handle DOM markers for labels, measures, and circles
    const expectedMarkers = new Map<string, { lngLat: [number, number], el: HTMLElement }>();

    annotations.forEach(ann => {
      if (ann.type === 'label' && ann.coordinates) {
        const el = document.createElement('div');
        el.className = 'custom-marker';
        const contrastColor = getContrastYIQ(ann.color || '#ffffff');
        el.innerHTML = `
          <div class="custom-marker-content" style="background-color: ${ann.color}; color: ${contrastColor}">${ann.text}</div>
          <div class="custom-marker-pointer" style="border-top-color: ${ann.color}"></div>
        `;
        el.style.cursor = 'pointer';
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          if (activeTool !== 'none') {
            setSelectedAnnotationId(ann.id);
          }
          window.dispatchEvent(new CustomEvent('flyToLabel', { detail: ann.id }));
        });
        el.addEventListener('mousedown', (e) => e.stopPropagation());
        if (ann.id === selectedAnnotationId) {
          el.style.filter = 'drop-shadow(0 0 6px rgba(255,255,255,1)) drop-shadow(0 0 12px rgba(255,255,255,0.8))';
          el.style.zIndex = '1000';
          const content = el.querySelector('.custom-marker-content') as HTMLElement;
          if (content) {
            content.style.outline = '2px dashed #ffffff';
            content.style.outlineOffset = '2px';
          }
        }
        expectedMarkers.set(ann.id, { lngLat: ann.coordinates, el });
      } else if (ann.type === 'highlight') {
        const el = document.createElement('div');
        const contrastColor = getContrastYIQ(ann.color || '#000000');
        
        if (ann.polygonGeometry) {
          el.className = 'custom-country-marker';
          el.innerHTML = `
            <div class="custom-country-text" style="background-color: ${ann.color}; color: ${contrastColor}">
              ${ann.text || ''}
            </div>
          `;
        } else {
          el.className = 'custom-highlight-marker';
          el.style.backgroundColor = ann.color;
          el.innerHTML = `
            <div class="custom-highlight-text" style="background-color: ${ann.color}; color: ${contrastColor}">
              ${ann.text || ''}
            </div>
          `;
        }
        
        el.style.cursor = 'pointer';
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          if (activeTool !== 'none') {
            setSelectedAnnotationId(ann.id);
          } else {
            window.dispatchEvent(new CustomEvent('flyToLabel', { detail: ann.id }));
          }
        });
        el.addEventListener('mousedown', (e) => e.stopPropagation());
        if (ann.id === selectedAnnotationId) {
          el.style.filter = 'drop-shadow(0 0 6px rgba(255,255,255,1)) drop-shadow(0 0 12px rgba(255,255,255,0.8))';
          el.style.zIndex = '1000';
          el.style.outline = '2px dashed #ffffff';
          el.style.outlineOffset = '2px';
        }
        expectedMarkers.set(ann.id, { lngLat: ann.coordinates, el });
      } else if (ann.type === 'measure' && ann.coordinates) {
        let totalDistance = 0;
        const contrastColor = getContrastYIQ(ann.color || '#ffffff');
        ann.coordinates.forEach((coord: [number, number], i: number) => {
          if (i > 0) {
            totalDistance += turf.distance(ann.coordinates[i-1], coord, { units: 'kilometers' });
          }
          const el = document.createElement('div');
          el.className = 'custom-marker-flat';
          el.style.backgroundColor = ann.color;
          el.style.color = contrastColor;
          el.innerHTML = `${totalDistance.toFixed(2)} km`;
          el.style.cursor = 'pointer';
          el.addEventListener('click', (e) => {
            e.stopPropagation();
            if (activeTool !== 'none') {
              setSelectedAnnotationId(ann.id);
            }
          });
          el.addEventListener('mousedown', (e) => e.stopPropagation());
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
          
          if (i === 0) {
            el.className = 'custom-marker-flat text-xs font-bold uppercase tracking-wider';
            el.innerHTML = 'START';
          } else {
            const leg = ann.routeLegs![i - 1];
            if (leg) {
              accumulatedDistance += leg.distance / 1000;
              accumulatedDuration += leg.duration;
            }
            const hrs = Math.floor(accumulatedDuration / 3600);
            const mins = Math.round((accumulatedDuration % 3600) / 60);
            const timeStr = hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`;
            
            el.className = 'custom-marker-flat text-center leading-tight';
            el.innerHTML = `${accumulatedDistance.toFixed(1)} km<br/><span style="font-size:0.75em;opacity:0.9">${timeStr}</span>`;
          }
          
          el.style.backgroundColor = ann.color;
          el.style.color = contrastColor;
          el.style.cursor = 'pointer';
          el.addEventListener('click', (e) => {
            e.stopPropagation();
            if (activeTool !== 'none') {
              setSelectedAnnotationId(ann.id);
            }
          });
          el.addEventListener('mousedown', (e) => e.stopPropagation());
          if (ann.id === selectedAnnotationId) {
            el.style.filter = 'drop-shadow(0 0 6px rgba(255,255,255,1)) drop-shadow(0 0 12px rgba(255,255,255,0.8))';
            el.style.zIndex = '1000';
            el.style.outline = '2px dashed #ffffff';
            el.style.outlineOffset = '2px';
          }
          expectedMarkers.set(`${ann.id}-route-${i}`, { lngLat: coord, el });
        });
      } else if (ann.type === 'circle' && ann.coordinates?.[0]?.length > 0) {
        try {
          const contrastColor = getContrastYIQ(ann.color || '#ffffff');
          const center = turf.center(turf.polygon(ann.coordinates)).geometry.coordinates as [number, number];
          const centerEl = document.createElement('div');
          centerEl.className = 'custom-marker-dot';
          centerEl.style.backgroundColor = ann.color;
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
          labelEl.className = 'custom-marker-flat';
          labelEl.style.backgroundColor = ann.color;
          labelEl.style.color = contrastColor;
          labelEl.innerHTML = `${ann.radius?.toFixed(2)} km`;
          labelEl.style.cursor = 'pointer';
          labelEl.addEventListener('click', (e) => {
            e.stopPropagation();
            if (activeTool !== 'none') {
              setSelectedAnnotationId(ann.id);
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
          el.className = 'w-16 h-16 flex items-center justify-center p-2 icon-svg-wrapper';
          el.style.backgroundColor = ann.color || '#ffffff';
          el.style.color = getContrastYIQ(ann.color || '#ffffff');
          el.innerHTML = iconObj.svg;
          el.style.cursor = 'pointer';
          
          el.addEventListener('click', (e) => {
            e.stopPropagation();
            if (activeTool !== 'none') {
              setSelectedAnnotationId(ann.id);
            }
          });
          el.addEventListener('mousedown', (e) => e.stopPropagation());
          
          if (ann.id === selectedAnnotationId) {
            el.style.filter = 'drop-shadow(0 0 6px rgba(255,255,255,1)) drop-shadow(0 0 12px rgba(255,255,255,0.8))';
            el.style.zIndex = '1000';
            el.style.outline = '2px dashed #ffffff';
            el.style.outlineOffset = '2px';
          }
          expectedMarkers.set(ann.id, { lngLat: ann.coordinates, el });
        }
      }
    });

    // Always replace markers to ensure fresh event listeners and closures
    Object.keys(markersRef.current).forEach(id => {
      markersRef.current[id].remove();
      delete markersRef.current[id];
    });

    expectedMarkers.forEach((data, id) => {
      markersRef.current[id] = new mapboxgl.Marker({ element: data.el })
        .setLngLat(data.lngLat)
        .addTo(mapRef.current!);
    });
  }, [annotations, activeTool, mapLoaded, selectedAnnotationId, settings.icons]);

  // Synchronize selected geojson feature
  useEffect(() => {
    if (!mapRef.current || !mapLoaded) return;
    const source = mapRef.current.getSource('selected-geojson-feature') as mapboxgl.GeoJSONSource;
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
          } else if (id.includes('place') || sourceLayer.includes('place')) {
            if (density < 100) {
              let maxRank = 1;
              if (density > 0 && density <= 20) {
                maxRank = 2 + Math.floor(((density - 1) / 19) * 8);
              } else if (density > 20) {
                maxRank = 11 + Math.floor(((density - 21) / 79) * 9);
              }

              const rankCondition = ['<=', ['coalesce', ['get', 'symbolrank'], ['get', 'scalerank'], 99], maxRank];
              
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
          } else if (id.includes('poi') || id.includes('transit') || sourceLayer.includes('poi')) {
            if (density < 15) {
              extraCondition = ['==', 1, 2]; // Hide
            } else if (density < 100) {
              const maxScaleRank = Math.max(1, Math.ceil(Math.sqrt((density - 15) / 85) * 5));
              extraCondition = ['<=', ['coalesce', ['get', 'scalerank'], 1], maxScaleRank];
            }
          } else if (id.includes('road') || id.includes('water') || id.includes('natural')) {
            if (density < 5) {
              extraCondition = ['==', 1, 2]; // Hide
            }
          }

          try {
            if (extraCondition) {
              mapRef.current!.setFilter(layer.id, origFilter ? ['all', origFilter, extraCondition] : extraCondition);
            } else {
              mapRef.current!.setFilter(layer.id, origFilter || null);
            }
          } catch (e) {
            // ignore filter errors
          }
        }
      });
    }
  }, [settings.labelDensity, mapLoaded]);

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
    
    let style;
    try {
      style = map.getStyle();
    } catch(e) {
      return; // Style not loaded yet
    }
    
    const layers = settings.layers || [];
    const firstSymbolId = style?.layers?.find(l => l.type === 'symbol')?.id;
    const firstAdminId = style?.layers?.find(l => 
      l.id.includes('admin') || 
      l.id.includes('border') || 
      l.id.includes('boundar') || 
      l.id.includes('coutry')
    )?.id || firstSymbolId;



    // Identify current custom dynamic layers
    const dynamicLayerIds = (style?.layers || [])
      .filter(l => l.id.startsWith('dynamic-layer-'))
      .map(l => l.id.replace('dynamic-layer-', ''));

    // Remove deleted layers
    dynamicLayerIds.forEach(id => {
      if (!layers.find(l => l.id === id)) {
        if (map.getLayer(`dynamic-layer-${id}`)) map.removeLayer(`dynamic-layer-${id}`);
        if (map.getLayer(`dynamic-line-${id}`)) map.removeLayer(`dynamic-line-${id}`);
        if (map.getSource(`dynamic-source-${id}`)) {
          map.removeSource(`dynamic-source-${id}`);
          if (deepstateDatesRef.current[id]) {
            delete deepstateDatesRef.current[id];
          }
        }
      }
    });


    // Add / Update layers
    layers.forEach((layer) => {
      const sourceId = `dynamic-source-${layer.id}`;
      const layerId = `dynamic-layer-${layer.id}`;
      const lineId = `dynamic-line-${layer.id}`;

      // Re-initialize raster sources if they are dirty (e.g. date changed)
      if (map.getSource(sourceId) && layer.type === 'raster' && layer._isDirty) {
        if (map.getLayer(layerId)) map.removeLayer(layerId);
        if (map.getLayer(lineId)) map.removeLayer(lineId);
        map.removeSource(sourceId);
      }

      if (!map.getSource(sourceId)) {
        if (layer.type === 'geojson' && layer.data) {
          map.addSource(sourceId, { type: 'geojson', data: layer.data });
        } else if (layer.type === 'deepstate') {
          map.addSource(sourceId, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
        } else if (layer.type === 'raster' && layer.url) {
          let processedUrl = layer.url;
          
          const today = new Date();
          const todayStr = today.toISOString().split('T')[0];
          const past7d = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
          const past7dStr = past7d.toISOString().split('T')[0];
          
          const startVal = layer.startDate || past7dStr;
          const endVal = layer.endDate || todayStr;
          
          processedUrl = processedUrl.replace(/%7Bdate-today%7D/g, '{date-end}').replace(/%7Bdate-7d%7D/g, '{date-start}');
          processedUrl = processedUrl.replace(/{date-today}/g, '{date-end}').replace(/{date-7d}/g, '{date-start}');
          processedUrl = processedUrl.replace(/{date-start}/g, startVal).replace(/{date-end}/g, endVal);
          
          map.addSource(sourceId, { type: 'raster', tiles: [processedUrl], tileSize: 256 });
        } else if (layer.type === 'satellite') {
          map.addSource(sourceId, { type: 'raster', url: 'mapbox://mapbox.satellite', tileSize: 256 });
        } else if (layer.type === 'flights' || layer.type === 'vessels') {
          map.addSource(sourceId, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
        }
      } else {
        if (layer.type === 'geojson' && layer.data) {
          (map.getSource(sourceId) as mapboxgl.GeoJSONSource).setData(layer.data);
        }
      }

      if (!map.getLayer(layerId) && map.getSource(sourceId)) {
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
                ? [
                    'match', 
                    ['to-string', ['get', 'icao24']], 
                    ...Object.entries(layer.aircraftColors).flat(),
                    layer.globalAircraftColor || '#ffffff'
                  ] 
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
              'text-font': ['Gotham Bold', 'Arial Unicode MS Regular'],
              'text-size': 10,
              'text-offset': [0, 1.5],
              'text-anchor': 'top',
              'text-ignore-placement': true,
              'text-allow-overlap': true
            },
            paint: {
              'text-color': '#ffffff',
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
        if (layer.type === 'raster' || layer.type === 'satellite') {
          const bMin = layer.brightness !== undefined && layer.brightness > 0 ? layer.brightness : 0;
          const bMax = layer.brightness !== undefined && layer.brightness < 0 ? 1 + layer.brightness : 1;
          map.setPaintProperty(layerId, 'raster-opacity', layer.opacity ?? 1.0);
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
            
          map.setPaintProperty(layerId, 'icon-opacity', selectedAircraftId 
            ? ['case', ['==', ['to-string', ['get', 'icao24']], selectedAircraftId], 1.0, 0.5]
            : 1.0);
          map.setPaintProperty(layerId, 'icon-color', colorExp as any);
          
          if (map.getLayer(`${layerId}-labels`)) {
            map.setLayoutProperty(`${layerId}-labels`, 'visibility', layer.visible && layer.showCallsigns ? 'visible' : 'none');
            map.setPaintProperty(`${layerId}-labels`, 'text-opacity', selectedAircraftId 
              ? ['case', ['==', ['to-string', ['get', 'icao24']], selectedAircraftId], 1.0, 0.5]
              : 1.0);
          } else if (layer.showCallsigns) {
            const firstSymbolId = map.getStyle().layers?.find(l => l.type === 'symbol')?.id;
            map.addLayer({
              id: `${layerId}-labels`,
              type: 'symbol',
              source: `dynamic-source-${layer.id}`,
              layout: {
                visibility: layer.visible ? 'visible' : 'none',
                'text-field': ['case', ['==', ['get', 'callsign'], ''], ['get', 'icao24'], ['get', 'callsign']],
                'text-font': ['Gotham Bold', 'Arial Unicode MS Regular'],
                'text-size': 10,
                'text-offset': [0, 1.5],
                'text-anchor': 'top',
                'text-ignore-placement': true,
                'text-allow-overlap': true
              },
              paint: {
                'text-color': '#ffffff',
                'text-opacity': selectedAircraftId 
                  ? ['case', ['==', ['to-string', ['get', 'icao24']], selectedAircraftId], 1.0, 0.5]
                  : 1.0
              }
            }, firstSymbolId);
          }
        } else if (layer.type === 'deepstate') {
          map.setPaintProperty(layerId, 'fill-opacity', layer.opacity ?? 0.5);
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
            
          map.setPaintProperty(layerId, 'icon-opacity', selectedVesselMmsi 
            ? ['case', ['==', ['to-string', ['get', 'mmsi']], selectedVesselMmsi], 1.0, 0.5]
            : 1.0);
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
        } else if (map.getLayer(lineId)) {
          map.setLayoutProperty(lineId, 'visibility', layer.visible ? 'visible' : 'none');
        }
      }

      // Fetch data for deepstate if needed
      if (layer.type === 'deepstate') {
        const todayDateStr = new Date().toISOString().split('T')[0];
        const targetDate = layer.startDate || todayDateStr;
        
        const cacheKey = `${targetDate}-${!!layer.isLive}`;
        if (deepstateDatesRef.current[layer.id] !== cacheKey) {
          deepstateDatesRef.current[layer.id] = cacheKey;
          
          (async () => {
            try {
              let url = '';
              if (layer.isLive) {
                url = 'https://deepstatemap.live/api/history/last';
              } else {
                let history = globalDeepstateHistory;
                if (!history) {
                  if (!globalDeepstateHistoryPromise) {
                    globalDeepstateHistoryPromise = fetch('https://deepstatemap.live/api/history/public')
                      .then(res => res.json())
                      .then(data => { globalDeepstateHistory = data; })
                      .catch(err => {
                        console.error('Failed to fetch deepstate history:', err);
                        globalDeepstateHistoryPromise = null;
                      });
                  }
                  await globalDeepstateHistoryPromise;
                  history = globalDeepstateHistory;
                }
                
                if (!history) throw new Error('No history available');

                const entriesForDate = history.filter(entry => entry.createdAt.startsWith(targetDate));
                let targetId: number;
                if (entriesForDate.length > 0) {
                  targetId = entriesForDate[entriesForDate.length - 1].id;
                } else {
                  const pastEntries = history.filter(entry => entry.createdAt < targetDate);
                  if (pastEntries.length > 0) {
                    targetId = pastEntries[pastEntries.length - 1].id;
                  } else {
                    throw new Error('No data found for this date');
                  }
                }

                url = `https://deepstatemap.live/api/history/${targetId}/geojson`;
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
                  'geoJSON.territories.karelia',
                  'geoJSON.territories.prussia',
                  'geoJSON.territories.salla',
                  'geoJSON.territories.petsamo',
                  'geoJSON.territories.abkhazia',
                  'geoJSON.territories.tskhinvali-district',
                  'geoJSON.territories.ichkeria',
                  'geoJSON.territories.kuril'
                ];

                const filteredFeatures = geojsonData.features.filter((f: any) => {
                  const isPolygon = f.geometry?.type === 'Polygon' || f.geometry?.type === 'MultiPolygon';
                  if (!isPolygon) return false;
                  
                  const name = f.properties?.name || '';
                  if (typeof name === 'string' && ignoredTerms.some(term => name.includes(term))) {
                    return false;
                  }
                  return true;
                });

                const polygonsOnly = {
                  ...geojsonData,
                  features: filteredFeatures
                };
                const source = map.getSource(sourceId) as mapboxgl.GeoJSONSource;
                if (source) source.setData(polygonsOnly);
              }
            } catch (err) {
              console.error(`Error fetching deepstate for date ${targetDate}:`, err);
              const source = map.getSource(sourceId) as mapboxgl.GeoJSONSource;
              if (source) source.setData({ type: 'FeatureCollection', features: [] });
            }
          })();
        }
      }

    });

    // Reorder layers dynamically. Iterate backwards to place the bottom-most layer right before firstAdminId.
    for (let i = layers.length - 1; i >= 0; i--) {
      const layer = layers[i];
      const idsToMove = [];
      
      idsToMove.push(`dynamic-layer-${layer.id}`);
      if (map.getLayer(`dynamic-line-${layer.id}`)) {
        idsToMove.push(`dynamic-line-${layer.id}`);
      }
      
      idsToMove.forEach(id => {
        if (map.getLayer(id)) {
          try {
            map.moveLayer(id, firstAdminId);
          } catch (e) {}
        }
      });
    }

    return () => {
      // Cleanup dynamically created raster layers that were removed from settings
      // We don't remove copernicus or deepstate sources to avoid reload flashes
    };
  }, [settings.layers, mapLoaded, selectedAircraftId, selectedVesselMmsi]);

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
          console.log("First state vector length:", data.states[0].length, "Category index 17:", data.states[0][17]);
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
              const trackSource = map.getSource('selected-flight-track') as mapboxgl.GeoJSONSource;
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
                    selectedAircraftMetaRef.current.route = 'Unknown Route';
                  }
                })
                .catch(() => {});
            }

            if (!aircraftPopupRef.current) {
              aircraftPopupRef.current = new mapboxgl.Popup({ closeButton: false, closeOnClick: false, className: 'flight-popup' })
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
            style.innerHTML = '.flight-popup .mapboxgl-popup-content { padding: 0; background: transparent; box-shadow: none; } .flight-popup .mapboxgl-popup-tip { border-top-color: #09090b; }';
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
        const source = map.getSource(sourceId) as mapboxgl.GeoJSONSource;
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
      style.innerHTML = '.flight-popup .mapboxgl-popup-content { padding: 0; background: transparent; box-shadow: none; } .flight-popup .mapboxgl-popup-tip { border-top-color: #09090b; }';
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
        const source = map.getSource(sourceId) as mapboxgl.GeoJSONSource;
        if (source) source.setData({ type: 'FeatureCollection', features });

        // Update selected vessel track
        const trackSource = map.getSource('selected-vessel-track') as mapboxgl.GeoJSONSource;
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
    
    const source = map.getSource('selected-flight-track') as mapboxgl.GeoJSONSource;
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

  // Dynamically update clip polygons to match screen-space of highlight DOM labels
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    const highlights = annotations.filter(a => a.type === 'highlight' && a.text && a.coordinates);

    const updateClipMasks = () => {
      const source = map.getSource('highlight-clip-source') as mapboxgl.GeoJSONSource;
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
      } else {
        await customAlert('Aircraft not found in currently visible airspace.');
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
    const source = mapRef.current.getSource('active-drawing') as mapboxgl.GeoJSONSource;
    if (source) source.setData({ type: 'FeatureCollection', features: [] });
  }, [activeTool, mapLoaded]);

  const updateActiveDrawing = (geojson: any) => {
    if (!mapRef.current) return;
    const source = mapRef.current.getSource('active-drawing') as mapboxgl.GeoJSONSource;
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
      aircraftPopupRef.current = new mapboxgl.Popup({ closeButton: false, closeOnClick: false, className: 'flight-popup' })
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
    style.innerHTML = '.flight-popup .mapboxgl-popup-content { padding: 0; background: transparent; box-shadow: none; } .flight-popup .mapboxgl-popup-tip { border-top-color: #09090b; }';
    if (!document.getElementById('flight-popup-style')) document.head.appendChild(style);
    
    aircraftPopupRef.current.setHTML(popupHtml);
  }, [selectedAircraftId, settings.layers]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const onClick = (e: mapboxgl.MapMouseEvent) => {
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
          console.log("Flight click test:", { e_point: e.point, flightLayers, flightFeatures_length: flightFeatures.length, first_prop: flightFeatures[0]?.properties });
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
          const trackSource = map.getSource('selected-vessel-track') as mapboxgl.GeoJSONSource;
          if (trackSource) trackSource.setData({ type: 'FeatureCollection', features: [] });
        } else {
          activeVesselMmsiRef.current = clickedVesselMmsi;
          window.dispatchEvent(new CustomEvent('vesselSelected', { detail: clickedVesselMmsi }));
          const v = vesselsRef.current.get(clickedVesselMmsi);
          if (v && v.lat != null && v.lon != null) {
            if (!vesselPopupRef.current) {
              vesselPopupRef.current = new mapboxgl.Popup({ closeButton: false, closeOnClick: false, className: 'flight-popup' })
                .setLngLat([v.lon, v.lat])
                .addTo(map);
            } else {
              vesselPopupRef.current.setLngLat([v.lon, v.lat]);
            }
            const style = document.getElementById('flight-popup-style') || document.createElement('style');
            style.id = 'flight-popup-style';
            style.innerHTML = '.flight-popup .mapboxgl-popup-content { padding: 0; background: transparent; box-shadow: none; } .flight-popup .mapboxgl-popup-tip { border-top-color: #09090b; }';
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

            const trackSource = map.getSource('selected-vessel-track') as mapboxgl.GeoJSONSource;
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
          const trackSource = map.getSource('selected-vessel-track') as mapboxgl.GeoJSONSource;
          if (trackSource) trackSource.setData({ type: 'FeatureCollection', features: [] });
        }
      }
      let features: mapboxgl.MapboxGeoJSONFeature[] = [];
      try {
        features = map.queryRenderedFeatures(e.point, { layers: ['custom-polygons', 'custom-lines', 'custom-lines-dashed', 'custom-lines-dotted'] });
      } catch (err) {}
      if (features.length > 0) {
        const clickedId = features[0].properties?.id;
        if (clickedId && activeTool !== 'none') {
          setSelectedAnnotationId(clickedId);
          return; // Prevent drawing if we selected an element
        }
      } else {
        if (activeTool !== 'none') {
          setSelectedAnnotationId(null);
        }
      }

      if (activeTool === 'none') return;

      if (activeTool === 'icon' && selectedIconId) {
        setAnnotations(prev => [...prev, {
          id: Date.now().toString(),
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

      if (activeTool === 'highlight') {
        const evaluateExpression = (expr: any, zoom: number, feature: mapboxgl.MapboxGeoJSONFeature): any => {
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

        const features = map.queryRenderedFeatures(e.point);
        const currentZoom = map.getZoom();
        
        const symbolFeature = features.find(f => {
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
                if (!val || val === '') return false;
              }
            }

            return true;
          } catch (e) {
            return true; // default to true if we can't determine visibility
          }
        });
        
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
          setAnnotations(prev => [...prev, {
            id: Date.now().toString(),
            type: 'highlight',
            color: currentColor,
            coordinates: coords,
            text: name,
            view: {
              center: coords,
              zoom: mapRef.current!.getZoom(),
              pitch: mapRef.current!.getPitch(),
              bearing: mapRef.current!.getBearing()
            }
          }]);
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
                
                setAnnotations(prev => [...prev, {
                  id: Date.now().toString(),
                  type: 'highlight',
                  color: currentColor,
                  strokeType: currentStrokeType || 'solid',
                  fillOpacity: currentFillOpacity ?? 0.5,
                  coordinates: [centerLng, centerLat],
                  polygonGeometry: terrestrialGeometry || data.geojson,
                  text: name,
                  view: {
                    center: [centerLng, centerLat],
                    zoom: mapRef.current!.getZoom(),
                    pitch: mapRef.current!.getPitch(),
                    bearing: mapRef.current!.getBearing()
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
        labelEl.className = 'custom-marker-flat';
        labelEl.style.backgroundColor = currentColor;
        labelEl.style.color = getContrastYIQ(currentColor);
        labelEl.style.pointerEvents = 'none';
        labelEl.innerHTML = `${dist.toFixed(2)} km`;
        const markerId = `measure-${currentShapeCoords.current.length - 1}`;
        activeDrawMarkersRef.current[markerId] = new mapboxgl.Marker({ element: labelEl })
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
          labelEl.className = 'custom-marker-flat text-center leading-tight';
          labelEl.style.backgroundColor = currentColor;
          labelEl.style.color = getContrastYIQ(currentColor);
          labelEl.style.pointerEvents = 'none';
          labelEl.innerHTML = `${totalDist.toFixed(1)} km<br/><span style="font-size:0.75em;opacity:0.9">${timeStr}</span>`;
          
          const markerId = `route-${idx}`;
          activeDrawMarkersRef.current[markerId] = new mapboxgl.Marker({ element: labelEl })
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
          labelEl.className = 'custom-marker-flat text-xs font-bold uppercase tracking-wider';
          labelEl.style.backgroundColor = currentColor;
          labelEl.style.color = getContrastYIQ(currentColor);
          labelEl.style.pointerEvents = 'none';
          labelEl.innerHTML = 'START';
          activeDrawMarkersRef.current[`route-0`] = new mapboxgl.Marker({ element: labelEl })
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
            const profile = routeMode === 'walking' ? 'walking' : 'driving';
            const sessionId = currentDrawSessionRef.current;
            pendingFetchesRef.current += 1;
            fetch(`https://api.mapbox.com/directions/v5/mapbox/${profile}/${lastPoint[0]},${lastPoint[1]};${point[0]},${point[1]}?geometries=geojson&access_token=${settings.mapboxToken}`)
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

    const onMouseDown = (e: mapboxgl.MapMouseEvent) => {
      if (activeTool === 'none') return;

      // Check if we clicked on an existing annotation feature FIRST
      let features: mapboxgl.MapboxGeoJSONFeature[] = [];
      try {
        features = map.queryRenderedFeatures(e.point, { layers: ['custom-polygons', 'custom-lines', 'custom-lines-dashed', 'custom-lines-dotted'] });
      } catch (e) {
        // layer might not be ready
      }
      
      if (features.length > 0) {
        const clickedId = features[0].properties?.id;
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
        centerEl.className = 'custom-marker-dot';
        centerEl.style.backgroundColor = currentColor;
        centerEl.style.pointerEvents = 'none';
        activeDrawMarkersRef.current['circle-center'] = new mapboxgl.Marker({ element: centerEl })
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

    const onMouseMove = (e: mapboxgl.MapMouseEvent) => {
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
              labelEl.className = 'custom-marker-flat';
              labelEl.style.backgroundColor = currentColor;
              labelEl.style.color = getContrastYIQ(currentColor);
              labelEl.style.pointerEvents = 'none';
              activeDrawMarkersRef.current['circle-radius'] = new mapboxgl.Marker({ element: labelEl })
                .setLngLat(currentPos)
                .addTo(map);
            } else {
              activeDrawMarkersRef.current['circle-radius'].setLngLat(currentPos);
              activeDrawMarkersRef.current['circle-radius'].getElement().innerHTML = `${radius.toFixed(2)} km`;
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
            labelEl.className = 'custom-marker-flat';
            labelEl.style.backgroundColor = currentColor;
            labelEl.style.color = getContrastYIQ(currentColor);
            labelEl.style.pointerEvents = 'none';
            activeDrawMarkersRef.current['measure-floating'] = new mapboxgl.Marker({ element: labelEl })
              .setLngLat([e.lngLat.lng, e.lngLat.lat])
              .addTo(map);
          } else {
            activeDrawMarkersRef.current['measure-floating'].setLngLat([e.lngLat.lng, e.lngLat.lat]);
            activeDrawMarkersRef.current['measure-floating'].getElement().innerHTML = `${dist.toFixed(2)} km`;
          }
        }
      }
    };

    const onMouseUp = (e: mapboxgl.MapMouseEvent) => {
      if (!isDrawing.current) return;

      if (activeTool === 'paint') {
        isDrawing.current = false;
        map.dragPan.enable();
        if (currentShapeCoords.current.length > 2) {
          const simplified = simplifyLine(currentShapeCoords.current);
          setAnnotations(prev => [...prev, {
            id: Date.now().toString(),
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
              id: Date.now().toString(),
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

    const onDblClick = (e: mapboxgl.MapMouseEvent) => {
      if (activeTool === 'polygon' && isDrawing.current) {
        e.preventDefault(); // stop zoom
        isDrawing.current = false;
        
        // Add final point if it's not a duplicate of the last click
        const lastPt = currentShapeCoords.current[currentShapeCoords.current.length - 1];
        if (lastPt[0] !== e.lngLat.lng || lastPt[1] !== e.lngLat.lat) {
          currentShapeCoords.current.push([e.lngLat.lng, e.lngLat.lat]);
        }
        
        // Close polygon
        currentShapeCoords.current.push([...currentShapeCoords.current[0]]);
        
        if (currentShapeCoords.current.length >= 4) {
          setAnnotations(prev => [...prev, {
            id: Date.now().toString(),
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
        
        // Add final point if it's not a duplicate
        const lastPt = currentShapeCoords.current[currentShapeCoords.current.length - 1];
        if (lastPt[0] !== e.lngLat.lng || lastPt[1] !== e.lngLat.lat) {
          currentShapeCoords.current.push([e.lngLat.lng, e.lngLat.lat]);
        }
        
        if (currentShapeCoords.current.length >= 2) {
          setAnnotations(prev => [...prev, {
            id: Date.now().toString(),
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
              id: Date.now().toString(),
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

    const onTouchStart = (e: mapboxgl.MapTouchEvent) => {
      if (e.points.length > 1) return;
      if (activeTool === 'paint' || activeTool === 'circle' || activeTool === 'arrow') {
        e.preventDefault();
        onMouseDown(e as unknown as mapboxgl.MapMouseEvent);
      }
    };

    const onTouchMove = (e: mapboxgl.MapTouchEvent) => {
      if (e.points.length > 1) return;
      if (isDrawing.current && (activeTool === 'paint' || activeTool === 'circle' || activeTool === 'arrow')) {
        e.preventDefault();
        onMouseMove(e as unknown as mapboxgl.MapMouseEvent);
      }
    };

    const onTouchEnd = (e: mapboxgl.MapTouchEvent) => {
      if (isDrawing.current && (activeTool === 'paint' || activeTool === 'circle' || activeTool === 'arrow')) {
        // In some cases touchend might lack a reliable lngLat, but Mapbox usually provides it based on changedTouches.
        // We ensure it falls back if needed.
        const fakeEvent = e as unknown as mapboxgl.MapMouseEvent;
        if (!fakeEvent.lngLat && currentShapeCoords.current.length > 0) {
           const last = currentShapeCoords.current[currentShapeCoords.current.length - 1];
           fakeEvent.lngLat = new mapboxgl.LngLat(last[0], last[1]);
        } else if (!fakeEvent.lngLat && activeTool === 'circle' && circleCenter.current) {
           // fallback for circle
           fakeEvent.lngLat = new mapboxgl.LngLat(circleCenter.current[0], circleCenter.current[1]);
        } else if (!fakeEvent.lngLat && activeTool === 'arrow' && arrowStart.current) {
           // fallback for arrow (draws a dot basically)
           fakeEvent.lngLat = new mapboxgl.LngLat(arrowStart.current[0], arrowStart.current[1]);
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
  }, [activeTool, currentColor, currentStrokeType, currentFillOpacity, annotations, setAnnotations, activeGeojsonLayerId, setActiveGeojsonLayerId, setSelectedGeojsonFeatureId, selectedAircraftId, settings.layers, selectedIconId, routeMode, settings.googleMapsToken, settings.mapboxToken]);

  return (
    <div className={`absolute inset-0 w-full h-full ${isSecondary ? 'pointer-events-none' : ''}`} style={{ clipPath, WebkitClipPath: clipPath, zIndex: isSecondary ? 10 : 0 }}>
      <div ref={mapContainer} className="w-full h-full" />
    </div>
  );
};

export const MapContainer: React.FC<MapContainerProps> = (props) => {
  const [map1, setMap1] = useState<mapboxgl.Map | null>(null);
  const [map2, setMap2] = useState<mapboxgl.Map | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const splitLayer = props.settings.layers.find(l => l.type === 'split' && l.visible);
  const [splitPos, setSplitPos] = useState(splitLayer?.splitPosition ? splitLayer.splitPosition * 100 : 50);
  const [splitVertical, setSplitVertical] = useState(splitLayer?.splitDirection !== 'horizontal');

  useEffect(() => {
    if (!map1 || !map2) return;
    let isSyncing = false;
    const sync1to2 = () => {
      if (isSyncing) return;
      isSyncing = true;
      map2.jumpTo({ center: map1.getCenter(), zoom: map1.getZoom(), pitch: map1.getPitch(), bearing: map1.getBearing() });
      isSyncing = false;
    };
    const sync2to1 = () => {
      if (isSyncing) return;
      isSyncing = true;
      map1.jumpTo({ center: map2.getCenter(), zoom: map2.getZoom(), pitch: map2.getPitch(), bearing: map2.getBearing() });
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
    <div className="w-full h-full relative overflow-hidden z-0" ref={containerRef}>
      <MapboxMap {...props} settings={settings1} onMapInit={setMap1} />
      {isSplitActive && (
        <>
          <MapboxMap {...props} settings={settings2} onMapInit={setMap2} isSecondary clipPath={clipPath} />
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
             className={`absolute bg-white shadow-[0_0_10px_rgba(0,0,0,0.5)] z-20 transition-colors hover:bg-white ${splitVertical ? 'w-1 h-full cursor-col-resize -ml-[2px]' : 'h-1 w-full cursor-row-resize -mt-[2px]'}`}
             style={splitVertical ? { left: `${splitPos}%`, top: 0 } : { top: `${splitPos}%`, left: 0 }}
          />
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
    </div>
  );
};
