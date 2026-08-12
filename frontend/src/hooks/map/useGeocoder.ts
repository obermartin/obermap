import maplibregl from 'maplibre-gl';
import MapboxGeocoder from '@maplibre/maplibre-gl-geocoder';
import '@maplibre/maplibre-gl-geocoder/dist/maplibre-gl-geocoder.css';
import type { AppSettings, Annotation } from '../../types';

export const setupGeocoder = (
  map: maplibregl.Map,
  mapRef: React.MutableRefObject<maplibregl.Map | null>,
  settingsRef: React.MutableRefObject<AppSettings>,
  setAnnotationsRef: React.MutableRefObject<React.Dispatch<React.SetStateAction<Annotation[]>>>,
  currentColorRef: React.MutableRefObject<string>
) => {
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
    

};
