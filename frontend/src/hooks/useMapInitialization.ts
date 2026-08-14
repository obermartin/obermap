import { useEffect } from 'react';
import maplibregl from 'maplibre-gl';
import type { AppSettings, Annotation } from '../types';
import { omProtocol } from '@openmeteo/weather-map-layer';

import { loadDefaultMapIcons } from '../map/icons';

// Patch Maplibre getSource to prevent crashes when style is not loaded yet
const origGetSource = maplibregl.Map.prototype.getSource;
(maplibregl.Map.prototype as any).getSource = function(id: string) {
  if (!this.style) return undefined;
  return origGetSource.call(this, id);
};
import { applyMapFontOverrides } from '../map/fonts';
import { setupCustomMapLayers } from '../map/layers';
import { setupGeocoder } from './map/useGeocoder';
import { useMapAnimationEvents } from './map/useMapAnimationEvents';

let omProtocolRegistered = false;

export interface MapInitializationProps {
  mapContainer: React.RefObject<HTMLDivElement | null>;
  mapRef: React.MutableRefObject<maplibregl.Map | null>;
  settings: AppSettings;
  settingsRef: React.MutableRefObject<AppSettings>;
  setMapLoaded: React.Dispatch<React.SetStateAction<boolean>>;
  setMapStyleLoaded: React.Dispatch<React.SetStateAction<boolean>>;
  setMapStyleTick: React.Dispatch<React.SetStateAction<number>>;
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
}: MapInitializationProps) => {

  // Delegate animation window events to a separate hook
  useMapAnimationEvents(
    mapRef,
    triggerProgressRef,
    triggerTimestampsRef,
    setRevealedTriggers,
    setHiddenTriggers
  );

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

    // Initialize with an empty style if it's a URL string. 
    // useMapStyling.ts will fetch the actual style, inject Gotham, and call setStyle.
    // This prevents MapLibre from fetching default Roboto fonts before we can override them.
    const initialStyle = typeof finalStyle === 'string' ? { version: 8, sources: {}, layers: [] } : finalStyle;

    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: initialStyle,
      center: settings.defaultView.center,
      zoom: settings.defaultView.zoom,
      pitch: settings.defaultView.pitch,
      bearing: settings.defaultView.bearing,
      maxPitch: 85,
      projection: settings.projection === 'globe' ? { type: 'globe' } : { type: 'mercator' },
      canvasContextAttributes: { preserveDrawingBuffer: true, alpha: true, antialias: true },
      attributionControl: false,
      transformRequest: (url: string, resourceType?: string) => {
        let currentUrl = url;
        
        if (resourceType === 'Glyphs' && currentUrl.includes('orangemug.github.io/font-glyphs')) {
          currentUrl = currentUrl.replace('https://orangemug.github.io/font-glyphs/glyphs/', 'https://tiles.openfreemap.org/fonts/');
          currentUrl = currentUrl.replace(/Arial(?:%20| )Unicode(?:%20| )MS(?:%20| )Regular/gi, 'Noto%20Sans%20Regular');
        }

        if (currentUrl.includes('virtualearth.net/tiles/a/')) {
          const match = currentUrl.match(/\/tiles\/a\/(\d+)\/(\d+)\/(\d+)/);
          if (match) {
            const z = parseInt(match[1], 10);
            const x = parseInt(match[2], 10);
            const y = parseInt(match[3], 10);
            let quadKey = '';
            for (let i = z; i > 0; i--) {
              let digit = 0;
              const mask = 1 << (i - 1);
              if ((x & mask) !== 0) digit += 1;
              if ((y & mask) !== 0) digit += 2;
              quadKey += digit.toString();
            }
            return { url: currentUrl.replace(/\/tiles\/a\/\d+\/\d+\/\d+/, `/tiles/a${quadKey}`) };
          }
        }
        if (settings.replaceGothamFont !== false && currentUrl.includes('Gotham')) {
          try {
            const urlObj = new URL(currentUrl);
            const parts = urlObj.pathname.split('/');
            const range = parts.pop();
            const fontstack = decodeURIComponent(parts.pop() || '');
            if (fontstack.startsWith('Gotham Condensed')) {
              const primaryFont = fontstack.split(',')[0].trim();
              const pathname = window.location.pathname;
              const cleanPath = pathname.endsWith('/') ? pathname : pathname.substring(0, pathname.lastIndexOf('/') + 1);
              return { url: `${window.location.origin}${cleanPath}fonts/PBF/${encodeURIComponent(primaryFont)}/${range}` };
            }
          } catch (e) {
            console.warn("Failed to rewrite local glyph URL", e);
          }
        }
        return { url: currentUrl };
      }
    } as any);

    const resizeObserver = new ResizeObserver(() => {
      if (mapRef.current) {
        mapRef.current.resize();
      }
    });
    if (mapContainer.current) {
      resizeObserver.observe(mapContainer.current);
    }
    
    mapRef.current = map;
    onMapInit?.(map);

    if ((map as any).painter) {
      const painter = (map as any).painter;
      if (typeof painter.maybeDrawDepth === 'function') {
        const origMaybeDrawDepth = painter.maybeDrawDepth;
        painter.maybeDrawDepth = function (...args: any[]) {
          if (!map.getTerrain()) return;
          try {
            return origMaybeDrawDepth.apply(this, args);
          } catch (e) {}
        };
      }
      if (typeof painter.maybeDrawCoords === 'function') {
        const origMaybeDrawCoords = painter.maybeDrawCoords;
        painter.maybeDrawCoords = function (...args: any[]) {
          if (!map.getTerrain()) return;
          try {
            return origMaybeDrawCoords.apply(this, args);
          } catch (e) {}
        };
      }
    }

    map.on('error', (e: any) => {
      if (e.sourceId || e.tile || e.source || (e.error && e.error.message && (e.error.message.includes('glyphs') || e.error.message.includes('sprite') || e.error.message.includes('tile')))) {
        return;
      }
      if (e.error && e.error.message && e.error.message.includes('404') && typeof settings.mapStyle === 'string' && settings.mapStyle.includes('api.php?action=basemap_style')) {
        console.error("Map style not found (404). Falling back to default map style.", e.error);
        setSettings?.(p => ({ ...p, mapStyle: 'https://tiles.openfreemap.org/styles/liberty' }));
        try {
          map.setStyle('https://tiles.openfreemap.org/styles/liberty', { diff: false });
        } catch (err) {}
      }
    });

    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true, showZoom: false }), 'top-right');
    
    setupGeocoder(map, mapRef, settingsRef, setAnnotationsRef, currentColorRef);
    
    map.addControl(new maplibregl.ScaleControl({ maxWidth: 150, unit: 'metric' }), 'top-right');

    map.on('load', () => {
      if (mapRef.current !== map) return;

      map.resize();
      map.triggerRepaint();

      setTimeout(() => {
        if (mapRef.current === map) {
          map.resize();
          map.triggerRepaint();
        }
      }, 100);
      setTimeout(() => {
        if (mapRef.current === map) {
          map.resize();
          map.triggerRepaint();
        }
      }, 300);

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

      const handleStyleLoad = () => {
        const { firstSymbolId, initFirstAdminId } = applyMapFontOverrides(map, settings, originalFiltersRef);
        loadDefaultMapIcons(map);
        setupCustomMapLayers(map, initFirstAdminId, firstSymbolId, mapRef, setMapLoaded, settings);
        setMapStyleLoaded(true);
        setMapStyleTick(t => t + 1);
        window.dispatchEvent(new CustomEvent('mapStyleReloaded'));
      };

      map.on('style.load', handleStyleLoad);
      
      map.on('styleimagemissing', (e) => {
        if (['airplane', 'helicopter', 'small_aircraft', 'military'].includes(e.id)) {
            loadDefaultMapIcons(map);
        }
      });
      
      // Also run it immediately if the style is already somewhat loaded.
      if (map.getStyle()) {
        handleStyleLoad();
      }
      
      setMapLoaded(true);
    });

    return () => {
      resizeObserver.disconnect();
      map.remove();
      mapRef.current = null;
    };
  }, [settings.replaceGothamFont]);
};
