import React, { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import type { Annotation, ToolType, AppSettings } from '../types';
import * as turf from '@turf/turf';
import { createCirclePolygon, calculateDistance, simplifyLine, transliterateToGerman } from '../utils/mapUtils';
import anyAscii from 'any-ascii';

interface MapContainerProps {
  activeTool: ToolType;
  currentColor: string;
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
  isSecondary,
  clipPath,
  onMapInit
}) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const originalFiltersRef = useRef<{ [layerId: string]: any }>({});
  const markersRef = useRef<{ [id: string]: mapboxgl.Marker }>({});
  const activeDrawMarkersRef = useRef<{ [id: string]: mapboxgl.Marker }>({});

  const clearActiveDrawMarkers = () => {
    Object.values(activeDrawMarkersRef.current).forEach(m => m.remove());
    activeDrawMarkersRef.current = {};
  };

  // Drawing state
  const isDrawing = useRef(false);
  const currentShapeCoords = useRef<[number, number][]>([]);

  const circleCenter = useRef<[number, number] | null>(null);

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
      const targetInitId = initFirstAdminId || firstSymbolId;

      // Add DeepState geojson source
      map.addSource('deepstate', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
      });

      // Fetch the actual data directly to mapbox to avoid React state bloat
      fetch('https://deepstatemap.live/api/history/last')
        .then(res => res.json())
        .then(data => {
          if (data && data.map && data.map.features) {
            const polygonsOnly = {
              ...data.map,
              features: data.map.features.filter((f: any) => 
                f.geometry?.type === 'Polygon' || f.geometry?.type === 'MultiPolygon'
              )
            };
            const deepstateSource = map.getSource('deepstate') as mapboxgl.GeoJSONSource;
            if (deepstateSource) deepstateSource.setData(polygonsOnly);
          }
        })
        .catch(err => console.error('Error fetching deepstate:', err));

      // Add DeepState layer with custom colors
      map.addLayer({
        id: 'deepstate-polygons',
        type: 'fill',
        source: 'deepstate',
        layout: { visibility: 'none' }, // Default hidden until synced
        paint: {
          'fill-opacity': 0.5,
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
      }, targetInitId);


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
          'fill-opacity': 0.5,
          'fill-color': ['coalesce', ['get', 'color'], '#ffffff']
        }
      }, firstSymbolId);

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

      // Lines (Paint & Measure & Outlines)
      map.addLayer({
        id: 'custom-lines',
        type: 'line',
        source: 'custom-annotations',
        paint: {
          'line-width': 6,
          'line-color': ['coalesce', ['get', 'color'], '#ffffff']
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
    window.addEventListener('requestViewCapture', handleRequestViewCapture);
    return () => window.removeEventListener('requestViewCapture', handleRequestViewCapture);
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

    const features: GeoJSON.Feature[] = annotations.map(ann => {
      if (ann.type === 'paint') {
        return {
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: ann.coordinates },
          properties: { color: ann.color, id: ann.id, type: ann.type }
        };
      }
      if (ann.type === 'measure') {
        const dist = calculateDistance(ann.coordinates);
        return {
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: ann.coordinates },
          properties: { color: ann.color, id: ann.id, type: ann.type, textLabel: `${dist.toFixed(2)} km` }
        };
      }
      if (ann.type === 'circle') {
        return {
          type: 'Feature',
          geometry: { type: 'Polygon', coordinates: ann.coordinates },
          properties: { color: ann.color, id: ann.id, type: ann.type, textLabel: `${ann.radius?.toFixed(2)} km` }
        };
      }
      if (ann.type === 'polygon') {
        return {
          type: 'Feature',
          geometry: { type: 'Polygon', coordinates: ann.coordinates },
          properties: { color: ann.color, id: ann.id, type: ann.type }
        };
      }
      return null;
    }).filter(Boolean) as GeoJSON.Feature[];

    source.setData({ type: 'FeatureCollection', features });

    // Handle DOM markers for labels, measures, and circles
    const expectedMarkers = new Map<string, { lngLat: [number, number], el: HTMLElement }>();

    annotations.forEach(ann => {
      if (ann.type === 'label') {
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
        el.className = 'custom-highlight-marker';
        const contrastColor = getContrastYIQ(ann.color || '#000000');
        el.style.backgroundColor = ann.color;
        el.style.color = contrastColor;
        el.innerHTML = ann.text || '';
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
        const iconObj = settings.icons?.find(i => i.id === ann.iconId);
        if (iconObj) {
          const el = document.createElement('div');
          el.className = 'w-8 h-8 flex items-center justify-center p-1 icon-svg-wrapper';
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

              const rankCondition = ['<=', ['coalesce', ['get', 'symbolrank'], 1], maxRank];
              
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
        if (map.getSource(`dynamic-source-${id}`)) map.removeSource(`dynamic-source-${id}`);
      }
    });

    // Hide deepstate if it was removed or is not in this map's layer stack
    if (!layers.find(l => l.id === 'deepstate')) {
      if (map.getLayer('deepstate-polygons')) {
        map.setLayoutProperty('deepstate-polygons', 'visibility', 'none');
      }
    }

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
        } else if (layer.type === 'raster' || layer.type === 'satellite') {
          map.addLayer({
            id: layerId,
            type: 'raster',
            source: sourceId,
            layout: { visibility: layer.visible ? 'visible' : 'none' },
            paint: { 'raster-opacity': layer.opacity ?? 1.0 }
          }, firstAdminId);
        }
      } else if (map.getLayer(layerId)) {
        map.setLayoutProperty(layerId, 'visibility', layer.visible ? 'visible' : 'none');
        if (layer.type === 'raster' || layer.type === 'satellite') {
          map.setPaintProperty(layerId, 'raster-opacity', layer.opacity ?? 1.0);
        }
        if (map.getLayer(lineId)) {
          map.setLayoutProperty(lineId, 'visibility', layer.visible ? 'visible' : 'none');
        }
      }

      // Hardcoded hook for deepstate to avoid react state bloat
      if (layer.id === 'deepstate' && map.getLayer('deepstate-polygons')) {
        map.setLayoutProperty('deepstate-polygons', 'visibility', layer.visible ? 'visible' : 'none');
      }
    });

    // Reorder layers dynamically. Iterate backwards to place the bottom-most layer right before firstAdminId.
    for (let i = layers.length - 1; i >= 0; i--) {
      const layer = layers[i];
      const idsToMove = [];
      
      if (layer.id === 'deepstate') {
        idsToMove.push('deepstate-polygons');
      } else {
        idsToMove.push(`dynamic-layer-${layer.id}`);
        if (map.getLayer(`dynamic-line-${layer.id}`)) {
          idsToMove.push(`dynamic-line-${layer.id}`);
        }
      }
      
      idsToMove.forEach(id => {
        if (map.getLayer(id)) {
          try {
            map.moveLayer(id, firstAdminId);
          } catch (e) {}
        }
      });
    }

  }, [settings.layers, mapLoaded]);

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

  // Render DOM markers for labels and highlights
  useEffect(() => {
    if (!mapRef.current || !mapLoaded) return;
    mapRef.current.getCanvas().style.cursor = activeTool !== 'none' ? 'crosshair' : 'grab';
    clearActiveDrawMarkers();
  }, [activeTool, mapLoaded]);

  const updateActiveDrawing = (geojson: any) => {
    if (!mapRef.current) return;
    const source = mapRef.current.getSource('active-drawing') as mapboxgl.GeoJSONSource;
    if (source) source.setData(geojson);
  };

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const onClick = (e: mapboxgl.MapMouseEvent) => {
      // Handle GeoJSON Edit Mode first
      if (activeGeojsonLayerId) {
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

      // Handle selection first
      const features = map.queryRenderedFeatures(e.point, { layers: ['custom-polygons', 'custom-lines'] });
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
      
      if (activeTool === 'label') {
        setLabelPrompt({ lngLat: [e.lngLat.lng, e.lngLat.lat] });
        return;
      }

      if (activeTool === 'highlight') {
        const features = map.queryRenderedFeatures(e.point);
        const symbolFeature = features.find(f => f.layer?.type === 'symbol' && (f.properties?.name || f.properties?.name_en || f.properties?.name_de));
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
    };

    const onMouseDown = (e: mapboxgl.MapMouseEvent) => {
      if (activeTool === 'none') return;

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

      if (activeTool === 'polygon' || activeTool === 'measure') {
        // Draw temporary line to cursor
        const tempCoords = [...currentShapeCoords.current, [e.lngLat.lng, e.lngLat.lat]];
        updateActiveDrawing({
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: tempCoords },
          properties: { color: currentColor }
        });
        
        if (activeTool === 'measure') {
          // Update floating cursor marker
          let dist = calculateDistance(currentShapeCoords.current);
          dist += turf.distance(currentShapeCoords.current[currentShapeCoords.current.length - 1], [e.lngLat.lng, e.lngLat.lat], { units: 'kilometers' });
          
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
            coordinates: [...currentShapeCoords.current]
          }]);
        }
        updateActiveDrawing({ type: 'FeatureCollection', features: [] });
        clearActiveDrawMarkers();
        setActiveDistance(null);
      }
    };

    // Disable double click zoom when using polygon or measure tool to prevent interference
    if (activeTool === 'polygon' || activeTool === 'measure') {
      map.doubleClickZoom.disable();
    } else {
      map.doubleClickZoom.enable();
    }

    const onTouchStart = (e: mapboxgl.MapTouchEvent) => {
      if (e.points.length > 1) return;
      if (activeTool === 'paint' || activeTool === 'circle') {
        e.preventDefault();
        onMouseDown(e as unknown as mapboxgl.MapMouseEvent);
      }
    };

    const onTouchMove = (e: mapboxgl.MapTouchEvent) => {
      if (e.points.length > 1) return;
      if (isDrawing.current && (activeTool === 'paint' || activeTool === 'circle')) {
        e.preventDefault();
        onMouseMove(e as unknown as mapboxgl.MapMouseEvent);
      }
    };

    const onTouchEnd = (e: mapboxgl.MapTouchEvent) => {
      if (isDrawing.current && (activeTool === 'paint' || activeTool === 'circle')) {
        // In some cases touchend might lack a reliable lngLat, but Mapbox usually provides it based on changedTouches.
        // We ensure it falls back if needed.
        const fakeEvent = e as unknown as mapboxgl.MapMouseEvent;
        if (!fakeEvent.lngLat && currentShapeCoords.current.length > 0) {
           const last = currentShapeCoords.current[currentShapeCoords.current.length - 1];
           fakeEvent.lngLat = new mapboxgl.LngLat(last[0], last[1]);
        } else if (!fakeEvent.lngLat && activeTool === 'circle' && circleCenter.current) {
           // fallback for circle
           fakeEvent.lngLat = new mapboxgl.LngLat(circleCenter.current[0], circleCenter.current[1]);
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
  }, [activeTool, currentColor, setAnnotations, activeGeojsonLayerId, setActiveGeojsonLayerId, setSelectedGeojsonFeatureId]);

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
  
  const splitLayer = props.settings.layers.find(l => l.type === 'split');
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

  if (splitLayer && splitLayer.splitLayers) {
    settings1 = {
      ...props.settings,
      layers: props.settings.layers.flatMap(l => l.id === splitLayer.id ? [splitLayer.splitLayers![0]] : [l])
    };
    settings2 = {
      ...props.settings,
      layers: props.settings.layers.flatMap(l => l.id === splitLayer.id ? [splitLayer.splitLayers![1]] : [l])
    };
  }

  const clipPath = splitVertical ? `inset(0 0 0 ${splitPos}%)` : `inset(${splitPos}% 0 0 0)`;

  return (
    <div className="w-full h-full relative overflow-hidden z-0" ref={containerRef}>
      <MapboxMap {...props} settings={settings1} onMapInit={setMap1} />
      {splitLayer && (
        <>
          <MapboxMap {...props} settings={settings2} onMapInit={setMap2} isSecondary clipPath={clipPath} />
          <div 
             onDoubleClick={() => setSplitVertical(!splitVertical)}
             onMouseDown={(e) => { e.preventDefault(); setIsDragging(true); }}
             onTouchStart={() => { setIsDragging(true); }}
             className={`absolute bg-white shadow-[0_0_10px_rgba(0,0,0,0.5)] z-20 transition-colors hover:bg-white ${splitVertical ? 'w-1 h-full cursor-col-resize -ml-[2px]' : 'h-1 w-full cursor-row-resize -mt-[2px]'}`}
             style={splitVertical ? { left: `${splitPos}%`, top: 0 } : { top: `${splitPos}%`, left: 0 }}
          />
        </>
      )}
    </div>
  );
};
