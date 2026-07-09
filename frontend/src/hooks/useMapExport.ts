import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import type { AppSettings } from '../types';
import { scaleMapboxExpression } from '../utils/mapboxScaleHelper';

export interface MapExportProps {
  map: maplibregl.Map | null;
  mapLoaded: boolean;
  settings: AppSettings;
  imageExportScale?: number;
  isExporting?: boolean;
}

export const useMapExport = ({
  map,
  mapLoaded,
  settings,
  imageExportScale,
  isExporting
}: MapExportProps) => {
  const originalBasemapLayoutsRef = useRef<Record<string, { textSize?: any; iconSize?: any }>>({});

  // Handle view capture request
  useEffect(() => {
    const handleRequestViewCapture = () => {
      if (!map) return;
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
      if (!map) return;
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
      if (!map) return;
      const customEvent = e as CustomEvent<string>;
      const annotationId = customEvent.detail;
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
      if (!map) return;
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
  }, [map]);

  // Export Scaling Logic (Basemap Labels)
  useEffect(() => {
    if (!map || !mapLoaded) return;
    
    const scale = (settings.exportBasemapScale ?? 1.0) * (imageExportScale || 1.0);
    const style = map.getStyle();
    if (!style || !style.layers) return;

    const finalScale = scale;

    style.layers.forEach((layer) => {
      // Scale basemap symbol layers (skip custom app layers)
      if (layer.type === 'symbol' && !layer.id.startsWith('custom-') && !layer.id.startsWith('dynamic-') && !layer.id.startsWith('selected-')) {
        // Cache original sizes
        if (!originalBasemapLayoutsRef.current[layer.id]) {
          try {
            originalBasemapLayoutsRef.current[layer.id] = {
              textSize: map.getLayoutProperty(layer.id, 'text-size'),
              iconSize: map.getLayoutProperty(layer.id, 'icon-size')
            };
          } catch (e) {
            // Maplibre occasionally crashes when reading getLayoutProperty on certain layers
            originalBasemapLayoutsRef.current[layer.id] = {};
          }
        }

        const cachedLayout = originalBasemapLayoutsRef.current[layer.id];
        
        // Only scale if we successfully cached the properties
        if (cachedLayout) {
          const origTextSize = cachedLayout.textSize;
          const origIconSize = cachedLayout.iconSize;

          if (origTextSize !== undefined && origTextSize !== null) {
            try {
              if (finalScale === 1.0) {
                map.setLayoutProperty(layer.id, 'text-size', origTextSize);
              } else {
                map.setLayoutProperty(layer.id, 'text-size', scaleMapboxExpression(origTextSize, finalScale));
              }
            } catch (e) {
              console.warn('Failed to scale text-size for layer', layer.id, e);
            }
          }

          if (origIconSize !== undefined && origIconSize !== null) {
            try {
              if (finalScale === 1.0) {
                map.setLayoutProperty(layer.id, 'icon-size', origIconSize);
              } else {
                map.setLayoutProperty(layer.id, 'icon-size', scaleMapboxExpression(origIconSize, finalScale));
              }
            } catch (e) {
              console.warn('Failed to scale icon-size for layer', layer.id, e);
            }
          }
        }
      }
    });
  }, [map, mapLoaded, settings.mapStyle, settings.exportBasemapScale, settings.exportScalePreview, isExporting, imageExportScale]);

  // Export Scaling Logic (Annotations)
  useEffect(() => {
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
  }, [map, mapLoaded, settings.exportAnnotationScale, settings.exportScalePreview, isExporting, imageExportScale]);
};
