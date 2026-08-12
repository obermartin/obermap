import { useRef } from 'react';
import maplibregl from 'maplibre-gl';
import type { Annotation, AppSettings, ToolType } from '../types';
import { useAnnotationGeoJSON } from './annotations/useAnnotationGeoJSON';
import { useAnnotationDOMMarkers } from './annotations/useAnnotationDOMMarkers';
import { useAnnotationAnimations } from './annotations/useAnnotationAnimations';

export interface AnnotationsStreamProps {
  map: maplibregl.Map | null;
  mapLoaded: boolean;
  mapStyleLoaded: boolean;
  mapStyleTick: number;
  annotations: Annotation[];
  setAnnotations: React.Dispatch<React.SetStateAction<Annotation[]>>;
  selectedAnnotationId: string | null;
  setSelectedAnnotationId: React.Dispatch<React.SetStateAction<string | null>>;
  revealedTriggers: Set<string>;
  hiddenTriggers: Set<string>;
  triggerProgressRef: React.MutableRefObject<Record<string, number>>;
  triggerTimestampsRef: React.MutableRefObject<Record<string, number>>;
  markersRef: React.MutableRefObject<{ [id: string]: maplibregl.Marker }>;
  animationTick: number;
  setAnimationTick: React.Dispatch<React.SetStateAction<number>>;
  activeTool: ToolType;
  settings: AppSettings;
  t: any;
  getBaseTemplate: (id?: string) => any;
  handleRouteWaypointDragEnd: (annId: string, wpIdx: number, newLngLat: [number, number]) => Promise<void>;
  onEditIcon?: (annotation: Annotation) => void;
  onViewMedia?: (annotation: Annotation) => void;
  setLabelPrompt: React.Dispatch<React.SetStateAction<{ lngLat: [number, number], initialText?: string, initialSecondary?: string, annotationId?: string } | null>>;
  isToolbarOpen?: boolean;
}

export const useAnnotationsStream = ({
  map,
  mapLoaded,
  mapStyleLoaded,
  mapStyleTick,
  annotations,
  setAnnotations,
  selectedAnnotationId,
  setSelectedAnnotationId,
  revealedTriggers,
  hiddenTriggers,
  triggerProgressRef,
  triggerTimestampsRef,
  animationTick,
  setAnimationTick,
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
}: AnnotationsStreamProps) => {
  const baseFeaturesRef = useRef<GeoJSON.Feature[]>([]);
  const activeFeaturesRef = useRef<GeoJSON.Feature[]>([]);
  const cachedTurfDataRef = useRef<{ [id: string]: any }>({});

  useAnnotationGeoJSON({
    map,
    mapLoaded,
    mapStyleLoaded,
    mapStyleTick,
    annotations,
    baseFeaturesRef,
    activeFeaturesRef,
    cachedTurfDataRef
  });

  useAnnotationDOMMarkers({
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
  });

  useAnnotationAnimations({
    map,
    mapLoaded,
    mapStyleLoaded,
    mapStyleTick,
    annotations,
    activeTool,
    settings,
    revealedTriggers,
    hiddenTriggers,
    triggerProgressRef,
    triggerTimestampsRef,
    animationTick,
    setAnimationTick,
    selectedAnnotationId,
    baseFeaturesRef,
    activeFeaturesRef,
    cachedTurfDataRef,
    markersRef
  });
};
