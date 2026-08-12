import { useEffect } from 'react';
import type { MutableRefObject } from 'react';
import maplibregl from 'maplibre-gl';
import * as turf from '@turf/turf';
import { calculateDistance, simplifyLine, createCirclePolygon, createArrowFeatures } from '../../utils/mapUtils';
import { getContrastYIQ } from '../../utils/colorUtils';
import type { Annotation, ToolType, RouteMode } from '../../types';

interface UseShapeDrawingProps {
  map: maplibregl.Map | null;
  mapLoaded: boolean;
  activeTool: ToolType;
  currentColor: string;
  currentStrokeType: 'solid' | 'dashed' | 'dotted';
  currentFillOpacity: number | null;
  annotations: Annotation[];
  setAnnotations: React.Dispatch<React.SetStateAction<Annotation[]>>;
  isDrawing: MutableRefObject<boolean>;
  currentShapeCoords: MutableRefObject<[number, number][]>;
  circleCenter: MutableRefObject<[number, number] | null>;
  arrowStart: MutableRefObject<[number, number] | null>;
  activeDrawMarkersRef: MutableRefObject<{ [id: string]: maplibregl.Marker }>;
  updateActiveDrawing: (featureInfo: any) => void;
  clearActiveDrawMarkers: () => void;
  setActiveDistance: React.Dispatch<React.SetStateAction<number | null>>;
  
  // Route dependencies for onDblClick and onMouseMove
  routeMode: RouteMode | null;
  routeGeometryRef: MutableRefObject<{ type: 'LineString', coordinates: [number, number][] }>;
  routeLegsRef: MutableRefObject<{ distance: number; duration: number }[]>;
  pendingFetchesRef: MutableRefObject<number>;
  currentDrawSessionRef: MutableRefObject<number>;
  
  // Toolbar interactions
  isToolbarOpen: boolean;
  clickedAnnotationId: string | null;
  setSelectedAnnotationId: React.Dispatch<React.SetStateAction<string | null>>;
}

export const useShapeDrawing = ({
  map,
  mapLoaded,
  activeTool,
  currentColor,
  currentStrokeType,
  currentFillOpacity,
  setAnnotations,
  isDrawing,
  currentShapeCoords,
  circleCenter,
  arrowStart,
  activeDrawMarkersRef,
  updateActiveDrawing,
  clearActiveDrawMarkers,
  setActiveDistance,
  routeMode,
  routeGeometryRef,
  routeLegsRef,
  pendingFetchesRef,
  currentDrawSessionRef,
  isToolbarOpen,
  clickedAnnotationId,
  setSelectedAnnotationId
}: UseShapeDrawingProps) => {

  useEffect(() => {
    if (!map || !mapLoaded) return;

    const onClick = (e: maplibregl.MapMouseEvent) => {
      if (activeTool === 'polygon' || activeTool === 'measure') {
        if (!isDrawing.current) {
          isDrawing.current = true;
          currentShapeCoords.current = [[e.lngLat.lng, e.lngLat.lat]];
        } else {
          const lastPoint = currentShapeCoords.current[currentShapeCoords.current.length - 1];
          const p1 = map.project(lastPoint);
          const p2 = e.point;
          const distPx = Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));
          if (distPx < 10) return;

          currentShapeCoords.current.push([e.lngLat.lng, e.lngLat.lat]);
          updateActiveDrawing({
            type: 'Feature',
            geometry: { type: 'LineString', coordinates: [...currentShapeCoords.current] },
            properties: { color: currentColor }
          });
        }

        if (activeTool === 'measure') {
          const dist = calculateDistance(currentShapeCoords.current);
          const labelEl = document.createElement('div');
          labelEl.className = 'label-marker-measure-draw';
          labelEl.style.width = '0px';
          labelEl.style.height = '0px';
          labelEl.style.position = 'relative';
          labelEl.style.pointerEvents = 'none';
          labelEl.innerHTML = `
            <div style="position: absolute; left: 0; top: 0; transform: translate(-50%, -50%) scale(var(--export-annotation-scale, 1)); transform-origin: center center; display: flex; align-items: center; justify-content: center;">
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
      }
    };

    const onMouseDown = (e: maplibregl.MapMouseEvent) => {
      if ((e.originalEvent?.target as HTMLElement)?.closest('.maplibregl-marker')) return;

      let features: maplibregl.MapGeoJSONFeature[] = [];
      try {
        const bbox: [maplibregl.PointLike, maplibregl.PointLike] = [
          [e.point.x - 5, e.point.y - 5],
          [e.point.x + 5, e.point.y + 5]
        ];
        features = map.queryRenderedFeatures(bbox, { layers: ['custom-polygons', 'custom-lines-solid', 'custom-lines-dashed-new', 'custom-lines-dotted-new', 'custom-arrow-heads'] });
      } catch (err) {}
      
      const targetFeature = features.find(f => activeTool === 'none' ? true : f.layer.id !== 'custom-polygons');
      
      if (targetFeature) {
        let clickedId = targetFeature.properties?.id;
        if (clickedId && isToolbarOpen) {
          setSelectedAnnotationId(clickedId);
          return; 
        }
      } else {
        setSelectedAnnotationId(null);
      }

      if (activeTool === 'paint') {
        isDrawing.current = true;
        currentShapeCoords.current = [[e.lngLat.lng, e.lngLat.lat]];
        map.dragPan.disable();
      }

      if (activeTool === 'circle') {
        isDrawing.current = true;
        circleCenter.current = [e.lngLat.lng, e.lngLat.lat];
        map.dragPan.disable();
        
        const centerEl = document.createElement('div');
        centerEl.className = 'label-marker-circle-center-draw';
        centerEl.style.width = '0px';
        centerEl.style.height = '0px';
        centerEl.style.position = 'relative';
        centerEl.style.pointerEvents = 'none';
        centerEl.innerHTML = `
          <div style="position: absolute; left: 0; top: 0; transform: translate(-50%, -50%) scale(var(--export-annotation-scale, 1)); transform-origin: center center;">
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
      if (!isDrawing.current || activeTool === 'none' || activeTool === 'icon' || activeTool === 'label' || activeTool === 'headline' || activeTool === 'highlight') {
        if (activeTool === 'none') {
          if (document.body.style.cursor === 'wait') return;
          let hasCemsHover = false;
          try {
            const features = map.queryRenderedFeatures(e.point, { layers: ['active-wildfire-cems-vt-extent-fill', 'active-flood-cems-vt-extent-fill'] });
            hasCemsHover = features.length > 0;
          } catch (err) {}
          if (hasCemsHover) {
            map.getCanvas().style.cursor = 'pointer';
          } else {
            map.getCanvas().style.cursor = 'grab';
          }
        }
        return;
      }

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
            
            if (!activeDrawMarkersRef.current['circle-radius']) {
              const labelEl = document.createElement('div');
              labelEl.className = 'label-marker-circle-radius';
              labelEl.style.width = '0px';
              labelEl.style.height = '0px';
              labelEl.style.position = 'relative';
              labelEl.style.pointerEvents = 'none';
              labelEl.innerHTML = `
                <div style="position: absolute; left: 0; top: 0; transform: translate(-50%, -50%) scale(var(--export-annotation-scale, 1)); transform-origin: center center; display: flex; align-items: center; justify-content: center;">
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
                <div style="position: absolute; left: 0; top: 0; transform: translate(-50%, -50%) scale(var(--export-annotation-scale, 1)); transform-origin: center center; display: flex; align-items: center; justify-content: center;">
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
        const feats = createArrowFeatures(arrowStart.current, currentPos, currentColor, undefined);
        if (feats) {
          updateActiveDrawing({
            type: 'FeatureCollection',
            features: [feats.shaft, feats.head]
          });
        }
      }

      if (activeTool === 'polygon' || activeTool === 'measure' || activeTool === 'route') {
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
              <div style="position: absolute; left: 0; top: 0; transform: translate(-50%, -50%) scale(var(--export-annotation-scale, 1)); transform-origin: center center; display: flex; align-items: center; justify-content: center;">
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
              <div style="position: absolute; left: 0; top: 0; transform: translate(-50%, -50%) scale(var(--export-annotation-scale, 1)); transform-origin: center center; display: flex; align-items: center; justify-content: center;">
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
        e.preventDefault(); 
        isDrawing.current = false;
        currentShapeCoords.current.pop();
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
              routeMode: routeMode || undefined,
              routeLegs: [...routeLegsRef.current]
            }]);
          }
          updateActiveDrawing({ type: 'FeatureCollection', features: [] });
          clearActiveDrawMarkers();
          currentDrawSessionRef.current = (currentDrawSessionRef.current || 0) + 1;
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
        const fakeEvent = e as unknown as maplibregl.MapMouseEvent;
        if (!fakeEvent.lngLat && currentShapeCoords.current.length > 0) {
           const last = currentShapeCoords.current[currentShapeCoords.current.length - 1];
           fakeEvent.lngLat = new maplibregl.LngLat(last[0], last[1]);
        } else if (!fakeEvent.lngLat && activeTool === 'circle' && circleCenter.current) {
           fakeEvent.lngLat = new maplibregl.LngLat(circleCenter.current[0], circleCenter.current[1]);
        } else if (!fakeEvent.lngLat && activeTool === 'arrow' && arrowStart.current) {
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
  }, [
    map, mapLoaded, activeTool, currentColor, currentStrokeType, currentFillOpacity, 
    setAnnotations, isDrawing, currentShapeCoords, circleCenter, arrowStart, 
    activeDrawMarkersRef, updateActiveDrawing, clearActiveDrawMarkers, setActiveDistance, 
    routeMode, routeGeometryRef, routeLegsRef, pendingFetchesRef, currentDrawSessionRef,
    isToolbarOpen, clickedAnnotationId, setSelectedAnnotationId
  ]);
};
