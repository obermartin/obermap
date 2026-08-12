import { useEffect } from 'react';
import maplibregl from 'maplibre-gl';
import type { StrokeType } from '../types';

interface UseMapDrawingCursorProps {
  map: maplibregl.Map | null;
  mapLoaded: boolean;
  activeTool: string | null;
  currentStrokeType?: StrokeType;
  clearActiveDrawMarkers: () => void;
  isDrawing: React.MutableRefObject<boolean>;
}

export const useMapDrawingCursor = ({
  map,
  mapLoaded,
  activeTool,
  currentStrokeType,
  clearActiveDrawMarkers,
  isDrawing
}: UseMapDrawingCursorProps) => {
  // Update cursor and drawing state when tool changes
  useEffect(() => {
    if (!map || !mapLoaded) return;
    map.getCanvas().style.cursor = activeTool !== 'none' ? 'crosshair' : 'grab';
    clearActiveDrawMarkers();
    isDrawing.current = false;
    map.dragPan.enable();
    const source = map.getSource('active-drawing') as maplibregl.GeoJSONSource;
    if (source) source.setData({ type: 'FeatureCollection', features: [] });
  }, [activeTool, mapLoaded, map, clearActiveDrawMarkers, isDrawing]);

  const updateActiveDrawing = (geojson: any) => {
    if (!map) return;
    const source = map.getSource('active-drawing') as maplibregl.GeoJSONSource;
    if (source) {
      source.setData(geojson);
      if (map.getLayer('active-drawing-line')) {
        if (currentStrokeType === 'solid') {
          map.setPaintProperty('active-drawing-line', 'line-dasharray', undefined);
        } else {
          const dasharray = currentStrokeType === 'dashed' ? [2, 2] : [0.1, 2];
          map.setPaintProperty('active-drawing-line', 'line-dasharray', dasharray);
        }
      }
    }
  };

  return { updateActiveDrawing };
};
