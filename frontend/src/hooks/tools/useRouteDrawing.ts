import { useEffect } from 'react';
import type { MutableRefObject } from 'react';
import maplibregl from 'maplibre-gl';
import { getContrastYIQ } from '../../utils/colorUtils';
import type { AppSettings, ToolType, RouteMode } from '../../types';

interface UseRouteDrawingProps {
  map: maplibregl.Map | null;
  mapLoaded: boolean;
  activeTool: ToolType;
  currentColor: string;
  routeMode: RouteMode | null;
  settings: AppSettings;
  isDrawing: MutableRefObject<boolean>;
  currentShapeCoords: MutableRefObject<[number, number][]>;
  activeDrawMarkersRef: MutableRefObject<{ [id: string]: maplibregl.Marker }>;
  updateActiveDrawing: (featureInfo: any) => void;
  fetchRouteSegment: (p1: [number, number], p2: [number, number], mode: RouteMode, token?: string) => Promise<{ coords: [number, number][], leg: any }>;
  currentDrawSessionRef: MutableRefObject<number>;
  pendingFetchesRef: MutableRefObject<number>;
  routeGeometryRef: MutableRefObject<{ type: 'LineString', coordinates: [number, number][] }>;
  routeLegsRef: MutableRefObject<{ distance: number; duration: number }[]>;
  routeSegmentsRef: MutableRefObject<{ [idx: number]: [number, number][] }>;
  routeLegsSegmentsRef: MutableRefObject<{ [idx: number]: { distance: number; duration: number } }>;
  routeClickTimeoutRef: MutableRefObject<any>;
}

export const useRouteDrawing = ({
  map,
  mapLoaded,
  activeTool,
  currentColor,
  routeMode,
  settings,
  isDrawing,
  currentShapeCoords,
  activeDrawMarkersRef,
  updateActiveDrawing,
  fetchRouteSegment,
  currentDrawSessionRef,
  pendingFetchesRef,
  routeGeometryRef,
  routeLegsRef,
  routeSegmentsRef,
  routeLegsSegmentsRef,
  routeClickTimeoutRef
}: UseRouteDrawingProps) => {

  useEffect(() => {
    if (!map || !mapLoaded) return;

    const onClick = (e: maplibregl.MapMouseEvent) => {
      if (activeTool !== 'route') return;

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
          <div style="position: absolute; left: 0; top: 0; transform: translate(-50%, -50%) scale(var(--export-annotation-scale, 1)); transform-origin: center center; display: flex; align-items: center; justify-content: center;">
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
          currentDrawSessionRef.current = (currentDrawSessionRef.current || 0) + 1;
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
            <div style="position: absolute; left: 0; top: 0; transform: translate(-50%, -50%) scale(var(--export-annotation-scale, 1)); transform-origin: center center; display: flex; align-items: center; justify-content: center;">
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
          
          const sessionId = currentDrawSessionRef.current;
          pendingFetchesRef.current += 1;
          fetchRouteSegment(lastPoint, point, routeMode || 'driving', settings.googleMapsToken)
            .then(({ coords, leg }) => {
              pendingFetchesRef.current -= 1;
              if (sessionId !== currentDrawSessionRef.current) return;
              
              routeSegmentsRef.current[currentIdx] = coords;
              routeLegsSegmentsRef.current[currentIdx] = leg;
              
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
            })
            .catch((err: any) => {
              pendingFetchesRef.current -= 1;
              console.error('Routing error:', err);
            });
        }
      }, 250);
    };

    map.on('click', onClick);
    return () => { map.off('click', onClick); };
  }, [map, mapLoaded, activeTool, currentColor, routeMode, settings, fetchRouteSegment, updateActiveDrawing]);

};
