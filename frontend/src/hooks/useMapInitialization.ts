import { useEffect } from 'react';
import maplibregl from 'maplibre-gl';
import MapboxGeocoder from '@maplibre/maplibre-gl-geocoder';
import '@maplibre/maplibre-gl-geocoder/dist/maplibre-gl-geocoder.css';
import type { AppSettings, Annotation } from '../types';
import excludedCitiesData from '../assets/excluded-cities.json';
import { omProtocol } from '@openmeteo/weather-map-layer';

let omProtocolRegistered = false;

export interface MapInitializationProps {
  mapContainer: React.RefObject<HTMLDivElement | null>;
  mapRef: React.MutableRefObject<maplibregl.Map | null>;
  settings: AppSettings;
  settingsRef: React.MutableRefObject<AppSettings>;
  setMapLoaded: (v: boolean) => void;
  setStyleLoadedTick: React.Dispatch<React.SetStateAction<number>>;
  setRevealedTriggers: React.Dispatch<React.SetStateAction<Set<string>>>;
  setHiddenTriggers: React.Dispatch<React.SetStateAction<Set<string>>>;
  onMapInit?: (map: maplibregl.Map) => void;
  setSettings?: React.Dispatch<React.SetStateAction<AppSettings>>;
  originalFiltersRef: React.MutableRefObject<{ [layerId: string]: any }>;
  currentColorRef: React.MutableRefObject<string>;
  setAnnotationsRef: React.MutableRefObject<React.Dispatch<React.SetStateAction<Annotation[]>>>;
  triggerProgressRef: React.MutableRefObject<Record<string, number>>;
  triggerTimestampsRef: React.MutableRefObject<Record<string, number>>;
}

export const useMapInitialization = ({
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
}: MapInitializationProps) => {
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
            id: 'solid-bg-layer',
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
      projection: settings.projection === 'globe' ? { type: 'globe' } : { type: 'mercator' },
      canvasContextAttributes: { preserveDrawingBuffer: true },
      attributionControl: false,
      transformRequest: (url: string, resourceType?: string) => {
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
    } as any);
    
    mapRef.current = map;
    onMapInit?.(map);

    map.on('error', (e: any) => {
      // Ignore tile loading errors (which have a sourceId/tile) that might happen during flyTo or out of bounds.
      if (e.sourceId || e.tile || e.source) {
        return;
      }

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
            
            if (id.includes('place') || id.includes('city') || id.includes('town') || id.includes('village') || id.includes('capital')) {
              try {
                const layout = (styleLayers[i] as any).layout;
                if (layout && layout['icon-image']) {
                  const existingSize = layout['icon-size'];
                  // If icon-size is missing, invalid (e.g. string), or >= 1, force a sane default
                  const needsScaleDown = existingSize === undefined || 
                                         (typeof existingSize !== 'number' && !Array.isArray(existingSize)) || 
                                         (typeof existingSize === 'number' && existingSize >= 1);
                                         
                  if (needsScaleDown) {
                    map.setLayoutProperty(id, 'icon-size', 0.2);
                  }
                }
              } catch(e) {}
            }
            
            // Apply language overrides
            const layout = (styleLayers[i] as any).layout;
            if (layout && layout['text-field']) {
              // Ensure we don't accidentally overwrite icon-only layers that don't have text
              if (typeof layout['text-field'] === 'string' || Array.isArray(layout['text-field'])) {
                
                const originalTextStr = JSON.stringify(layout['text-field']).toLowerCase();
                
                if (originalTextStr.includes('name')) {
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
                }
                
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

      const setupCustomLayers = () => {
        if (!mapRef.current || mapRef.current !== map) return;
        if (map.getSource('custom-annotations') && map.getLayer('custom-polygons')) return;

        // Add custom annotations source
        if (!map.getSource('custom-annotations')) {
          map.addSource('custom-annotations', {
            type: 'geojson',
            promoteId: 'featureId',
            data: { type: 'FeatureCollection', features: [] }
          });
        }

        if (!map.getLayer('custom-polygons')) {
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
        }

        // Lines (Paint & Measure & Outlines & Arrows)
        if (!map.getLayer('custom-lines')) {
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
        }

        if (!map.getLayer('custom-lines-dashed')) {
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
        }

        if (!map.getLayer('custom-lines-dotted')) {
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
        }

        // Arrow Heads
        if (!map.getLayer('custom-arrow-heads')) {
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
        }

        // Invisible layer to force Mapbox's collision detection to hide underlying labels
        if (!map.getLayer('annotation-collision-layer')) {
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
        }

        // Selected Annotation Glow
        if (!map.getLayer('custom-selected-glow')) {
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
        }

        // Selected Annotation Highlight
        if (!map.getLayer('custom-selected-line')) {
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
        }

        // Active drawing source
        if (!map.getSource('active-drawing')) {
          map.addSource('active-drawing', {
            type: 'geojson',
            data: { type: 'FeatureCollection', features: [] }
          });
        }
        if (!map.getLayer('active-drawing-line')) {
          map.addLayer({
            id: 'active-drawing-line',
            type: 'line',
            source: 'active-drawing',
            paint: { 'line-width': 6, 'line-color': ['coalesce', ['get', 'color'], '#ffffff'], 'line-dasharray': [2, 2] }
          });
        }
        if (!map.getLayer('active-drawing-fill')) {
          map.addLayer({
            id: 'active-drawing-fill',
            type: 'fill',
            source: 'active-drawing',
            filter: ['==', '$type', 'Polygon'],
            paint: { 'fill-opacity': 0.3, 'fill-color': ['coalesce', ['get', 'color'], '#ffffff'] }
          });
        }

        // Selected GeoJSON feature highlighting
        if (!map.getSource('selected-geojson-feature')) {
          map.addSource('selected-geojson-feature', {
            type: 'geojson',
            data: { type: 'FeatureCollection', features: [] }
          });
        }
        if (!map.getLayer('geojson-selected-glow')) {
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
        }
        if (!map.getLayer('geojson-selected-line')) {
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
        }

        setStyleLoadedTick(t => t + 1);
      };

      setMapLoaded(true);
      setupCustomLayers();
      map.on('styledata', setupCustomLayers);
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
  }, [settings.replaceGothamFont]);
};
