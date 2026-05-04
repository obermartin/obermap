import React, { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import type { Annotation, ToolType, AppSettings } from '../types';
import * as turf from '@turf/turf';
import { createCirclePolygon, calculateDistance, simplifyLine, transliterateToGerman } from '../utils/mapUtils';

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

export const MapContainer: React.FC<MapContainerProps> = ({
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

    // Add Orbital controls (NavigationControl)
    map.addControl(new mapboxgl.NavigationControl({ visualizePitch: true, showZoom: false }), 'top-right');

    map.on('load', () => {
      // Add DeepState geojson source
      map.addSource('deepstate', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] } // Empty initially
      });

      // Fetch the actual data
      fetch('https://deepstatemap.live/api/history/last')
        .then(res => res.json())
        .then(data => {
          if (data && data.map) {
            const deepstateSource = map.getSource('deepstate') as mapboxgl.GeoJSONSource;
            if (deepstateSource) deepstateSource.setData(data.map);
          }
        })
        .catch(err => console.error('Error fetching deepstate:', err));

      // Find first symbol layer to render deepstate below labels
      const layers = map.getStyle().layers;
      let firstSymbolId;
      for (let i = 0; i < layers.length; i++) {
        if (layers[i].type === 'symbol') {
          if (!firstSymbolId) firstSymbolId = layers[i].id;
          if (!layers[i].id.startsWith('custom-')) {
            originalFiltersRef.current[layers[i].id] = layers[i].filter || null;
          }
        }
      }

      // Add DeepState layer with custom colors
      map.addLayer({
        id: 'deepstate-polygons',
        type: 'fill',
        source: 'deepstate',
        filter: ['==', '$type', 'Polygon'],
        paint: {
          'fill-opacity': 0.5,
          'fill-color': [
            'case',
            ['in', 'unknown', ['downcase', ['get', 'name']]], '#F15A38',
            ['in', 'liberated', ['downcase', ['get', 'name']]], '#317FE0',
            ['in', 'occupied', ['downcase', ['get', 'name']]], '#C91D2C',
            ['in', 'cadr', ['downcase', ['get', 'name']]], '#AB1926',
            ['in', 'crimea', ['downcase', ['get', 'name']]], '#AB1926',
            '#888888' // fallback
          ]
        }
      }, firstSymbolId);

      // Outlines for deepstate
      map.addLayer({
        id: 'deepstate-lines',
        type: 'line',
        source: 'deepstate',
        filter: ['==', '$type', 'Polygon'],
        paint: {
          'line-width': 1,
          'line-color': [
            'case',
            ['in', 'unknown', ['downcase', ['get', 'name']]], '#F15A38',
            ['in', 'liberated', ['downcase', ['get', 'name']]], '#317FE0',
            ['in', 'occupied', ['downcase', ['get', 'name']]], '#C91D2C',
            ['in', 'cadr', ['downcase', ['get', 'name']]], '#AB1926',
            ['in', 'crimea', ['downcase', ['get', 'name']]], '#AB1926',
            '#888888'
          ],
          'line-opacity': 1
        }
      }, firstSymbolId); // Add custom annotations source
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

  // Handle save label properly
  useEffect(() => {
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

  // Handle drop icon event from Toolbar drag and drop
  useEffect(() => {
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

  // Handle Map Label Density
  useEffect(() => {
    if (!mapRef.current || !mapLoaded || settings.labelDensity === undefined) return;
    
    const density = settings.labelDensity;
    const style = mapRef.current.getStyle();

    if (style && style.layers) {
      style.layers.forEach(layer => {
        if (layer.type === 'symbol' && !layer.id.startsWith('custom-')) {
          const origFilter = originalFiltersRef.current[layer.id];
          let extraCondition: any = null;

          const id = layer.id.toLowerCase();
          const sourceLayer = layer['source-layer'] ? layer['source-layer'].toLowerCase() : '';

          if (id.includes('place') || sourceLayer.includes('place')) {
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
  }, [activeTool, currentColor, setAnnotations]);

  return <div ref={mapContainer} className="w-full h-full" />;
};
