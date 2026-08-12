import { useRef } from 'react';
import type { MutableRefObject } from 'react';
import maplibregl from 'maplibre-gl';
import type { Annotation, AppSettings, ToolType, RouteMode } from '../../types';
import { useDrawingClickHandlers } from './useDrawingClickHandlers';
import { useRouteDrawing } from './useRouteDrawing';
import { useShapeDrawing } from './useShapeDrawing';

interface UseDrawingToolsProps {
  map: maplibregl.Map | null;
  mapLoaded: boolean;
  activeTool: ToolType;
  currentColor: string;
  currentStrokeType: 'solid' | 'dashed' | 'dotted';
  currentFillOpacity: number | null;
  annotations: Annotation[];
  setAnnotations: React.Dispatch<React.SetStateAction<Annotation[]>>;
  settings: AppSettings;
  selectedIconId: string | null;
  routeMode: RouteMode | null;
  isToolbarOpen: boolean;
  clickedAnnotationId: string | null;
  setSelectedAnnotationId: React.Dispatch<React.SetStateAction<string | null>>;
  setLabelPrompt: React.Dispatch<React.SetStateAction<{ lngLat: [number, number], initialText?: string, initialSecondary?: string, annotationId?: string } | null>>;
  setHeadlinePrompt: React.Dispatch<React.SetStateAction<{ id?: string; initialPrimary?: string; initialSecondary?: string } | null>> | undefined;
  mapRef: React.RefObject<maplibregl.Map | null>;
  activeDrawMarkersRef: MutableRefObject<{ [id: string]: maplibregl.Marker }>;
  isDrawing: MutableRefObject<boolean>;
  updateActiveDrawing: (featureInfo: any) => void;
  clearActiveDrawMarkers: () => void;
  setActiveDistance: React.Dispatch<React.SetStateAction<number | null>>;
  fetchRouteSegment: (p1: [number, number], p2: [number, number], mode: RouteMode, token?: string) => Promise<{ coords: [number, number][], leg: any }>;
  handleSelectionClick: (e: maplibregl.MapMouseEvent) => boolean;
}

export const useDrawingTools = (props: UseDrawingToolsProps) => {
  const currentShapeCoords = useRef<[number, number][]>([]);
  const circleCenter = useRef<[number, number] | null>(null);
  const arrowStart = useRef<[number, number] | null>(null);
  
  const routeGeometryRef = useRef<{ type: 'LineString', coordinates: [number, number][] }>({ type: 'LineString', coordinates: [] });
  const routeLegsRef = useRef<{ distance: number; duration: number }[]>([]);
  const routeSegmentsRef = useRef<{ [idx: number]: [number, number][] }>({});
  const routeLegsSegmentsRef = useRef<{ [idx: number]: { distance: number; duration: number } }>({});
  const routeClickTimeoutRef = useRef<any>(null);
  const currentDrawSessionRef = useRef<number>(0);
  const pendingFetchesRef = useRef<number>(0);

  useDrawingClickHandlers({
    ...props
  });

  useRouteDrawing({
    ...props,
    currentShapeCoords,
    routeGeometryRef,
    routeLegsRef,
    routeSegmentsRef,
    routeLegsSegmentsRef,
    routeClickTimeoutRef,
    currentDrawSessionRef,
    pendingFetchesRef
  });

  useShapeDrawing({
    ...props,
    currentShapeCoords,
    circleCenter,
    arrowStart,
    routeGeometryRef,
    routeLegsRef,
    currentDrawSessionRef,
    pendingFetchesRef
  });
};
