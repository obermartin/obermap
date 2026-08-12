import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import type { Annotation, AppSettings, ToolType } from '../../types';
import { createLabelMarker, createHighlightMarker, createMeasureMarkers, createRouteMarkers, createCircleMarkers, createIconMarker } from './domMarkerFactory';

interface UseAnnotationDOMMarkersProps {
  map: maplibregl.Map | null;
  mapLoaded: boolean;
  mapStyleLoaded: boolean;
  annotations: Annotation[];
  setAnnotations: React.Dispatch<React.SetStateAction<Annotation[]>>;
  selectedAnnotationId: string | null;
  setSelectedAnnotationId: React.Dispatch<React.SetStateAction<string | null>>;
  activeTool: ToolType;
  settings: AppSettings;
  t: any;
  getBaseTemplate: (id?: string) => any;
  handleRouteWaypointDragEnd: (annId: string, wpIdx: number, newLngLat: [number, number]) => Promise<void>;
  markersRef: React.MutableRefObject<{ [id: string]: maplibregl.Marker }>;
  onEditIcon?: (annotation: Annotation) => void;
  onViewMedia?: (annotation: Annotation) => void;
  setLabelPrompt: React.Dispatch<React.SetStateAction<{ lngLat: [number, number], initialText?: string, initialSecondary?: string, annotationId?: string } | null>>;
  isToolbarOpen?: boolean;
}

export const useAnnotationDOMMarkers = ({
  map,
  mapLoaded,
  mapStyleLoaded,
  annotations,
  setAnnotations,
  selectedAnnotationId,
  setSelectedAnnotationId,
  activeTool,
  settings,
  t,
  getBaseTemplate,
  handleRouteWaypointDragEnd,
  markersRef,
  onEditIcon,
  onViewMedia,
  setLabelPrompt,
  isToolbarOpen
}: UseAnnotationDOMMarkersProps) => {
  const setAnnotationsRef = useRef(setAnnotations);
  useEffect(() => {
    setAnnotationsRef.current = setAnnotations;
  }, [setAnnotations]);

  const handleRouteWaypointDragEndRef = useRef(handleRouteWaypointDragEnd);
  useEffect(() => {
    handleRouteWaypointDragEndRef.current = handleRouteWaypointDragEnd;
  }, [handleRouteWaypointDragEnd]);

  useEffect(() => {
    if (!map || !mapLoaded || !mapStyleLoaded) return;

    const expectedMarkers = new Map<string, { lngLat: [number, number], el: HTMLElement, draggable?: boolean, onDragEnd?: (lngLat: [number, number]) => void }>();

    const ctx = {
      activeTool,
      isToolbarOpen,
      selectedAnnotationId,
      setSelectedAnnotationId,
      setAnnotations: setAnnotationsRef.current,
      getBaseTemplate,
      setLabelPrompt,
      t,
      handleRouteWaypointDragEnd: handleRouteWaypointDragEndRef.current,
      settings,
      onViewMedia,
      onEditIcon
    };

    annotations.forEach(ann => {
      let newMarkers = new Map();
      if (ann.type === 'label') {
        newMarkers = createLabelMarker(ann, ctx);
      } else if (ann.type === 'highlight') {
        newMarkers = createHighlightMarker(ann, ctx);
      } else if (ann.type === 'measure') {
        newMarkers = createMeasureMarkers(ann, ctx);
      } else if (ann.type === 'route') {
        newMarkers = createRouteMarkers(ann, ctx);
      } else if (ann.type === 'circle') {
        newMarkers = createCircleMarkers(ann, ctx);
      } else if (ann.type === 'icon') {
        newMarkers = createIconMarker(ann, ctx);
      }
      
      newMarkers.forEach((data, id) => {
        expectedMarkers.set(id, data);
      });
    });

    Object.keys(markersRef.current).forEach(id => {
      markersRef.current[id].remove();
      delete markersRef.current[id];
    });

    expectedMarkers.forEach((data, id) => {
      let anchor: any = 'center';
      let offset: [number, number] = [0, 0];
      
      if (data.el.dataset.anchorX && data.el.dataset.anchorY) {
        anchor = 'top-left';
        offset = [-parseFloat(data.el.dataset.anchorX), -parseFloat(data.el.dataset.anchorY)];
      } else if (data.el.classList.contains('custom-marker')) {
        anchor = 'bottom';
      }

      const marker = new maplibregl.Marker({ element: data.el, anchor, offset })
        .setLngLat(data.lngLat)
        .addTo(map!);
      
      if (data.draggable) {
        marker.setDraggable(true);
        if (data.onDragEnd) {
          marker.on('dragend', () => {
            const lngLat = marker.getLngLat();
            data.onDragEnd!([lngLat.lng, lngLat.lat]);
          });
        }
      }
      markersRef.current[id] = marker;
    });
  }, [annotations, activeTool, mapLoaded, mapStyleLoaded, selectedAnnotationId, settings.icons, map, markersRef, isToolbarOpen, setSelectedAnnotationId, getBaseTemplate, setLabelPrompt, t, onViewMedia, onEditIcon]);
};
