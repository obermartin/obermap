import { useState, useEffect, useRef } from 'react';
import type { Annotation, ToolType, StrokeType, AppSettings, RouteMode } from '../types';

export const useAppState = (DEFAULT_SETTINGS: AppSettings) => {
  const [activeTool, setActiveTool] = useState<ToolType>('none');
  const [currentColor, setCurrentColor] = useState(DEFAULT_SETTINGS.colorPalette[0]);
  const [currentStrokeType, setCurrentStrokeType] = useState<StrokeType>('solid');
  const [currentFillOpacity, setCurrentFillOpacity] = useState<number>(0.2);
  const [routeMode, setRouteMode] = useState<RouteMode>('driving');
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  
  const settingsRef = useRef(settings);
  useEffect(() => {
    settingsRef.current = settings;
    if (settings.colorPalette && !settings.colorPalette.includes(currentColor)) {
      setCurrentColor(settings.colorPalette[0] || DEFAULT_SETTINGS.colorPalette[0]);
    }
  }, [settings, currentColor, DEFAULT_SETTINGS]);

  const [labelPrompt, setLabelPrompt] = useState<{ lngLat: [number, number], initialText?: string, initialSecondary?: string, annotationId?: string } | null>(null);
  const [headlinePrompt, setHeadlinePrompt] = useState<{ id?: string, initialPrimary?: string, initialSecondary?: string } | null>(null);
  const [labelInput, setLabelInput] = useState('');
  const [secondaryLabelInput, setSecondaryLabelInput] = useState('');
  const [headlineInput, setHeadlineInput] = useState('');
  const [highlightedLineInput, setHighlightedLineInput] = useState('');

  useEffect(() => {
    if (labelPrompt) {
      setLabelInput(labelPrompt.initialText || '');
      setSecondaryLabelInput(labelPrompt.initialSecondary || '');
    } else {
      setLabelInput('');
      setSecondaryLabelInput('');
    }
  }, [labelPrompt]);

  useEffect(() => {
    if (headlinePrompt) {
      setHeadlineInput(headlinePrompt.initialPrimary || '');
      setHighlightedLineInput(headlinePrompt.initialSecondary || '');
    }
  }, [headlinePrompt]);

  const [activeDistance, setActiveDistance] = useState<number | null>(null);
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null);
  const [selectedIconId, setSelectedIconId] = useState<string | null>(null);
  const [isLayerSidebarOpen, setIsLayerSidebarOpen] = useState(false);
  const [activeGeojsonLayerId, setActiveGeojsonLayerId] = useState<string | null>(null);
  const [selectedGeojsonFeatureId, setSelectedGeojsonFeatureId] = useState<string | number | null>(null);
  const [isToolbarOpen, setIsToolbarOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [currentView, setCurrentView] = useState<'overview' | 'map'>('overview');
  const [currentShow, setCurrentShow] = useState<string | null>(null);
  const [activeCropOverlay, setActiveCropOverlay] = useState<'landscape' | 'portrait' | 'square' | null>(null);
  const [activeMapViewId, setActiveMapViewId] = useState<string>('overview');

  useEffect(() => {
    setSelectedAnnotationId(null);
  }, [activeTool]);

  return {
    activeTool, setActiveTool,
    currentColor, setCurrentColor,
    currentStrokeType, setCurrentStrokeType,
    currentFillOpacity, setCurrentFillOpacity,
    routeMode, setRouteMode,
    annotations, setAnnotations,
    settings, setSettings,
    settingsRef,
    labelPrompt, setLabelPrompt,
    headlinePrompt, setHeadlinePrompt,
    labelInput, setLabelInput,
    secondaryLabelInput, setSecondaryLabelInput,
    headlineInput, setHeadlineInput,
    highlightedLineInput, setHighlightedLineInput,
    activeDistance, setActiveDistance,
    selectedAnnotationId, setSelectedAnnotationId,
    selectedIconId, setSelectedIconId,
    isLayerSidebarOpen, setIsLayerSidebarOpen,
    activeGeojsonLayerId, setActiveGeojsonLayerId,
    selectedGeojsonFeatureId, setSelectedGeojsonFeatureId,
    isToolbarOpen, setIsToolbarOpen,
    isSaving, setIsSaving,
    isLoaded, setIsLoaded,
    currentView, setCurrentView,
    currentShow, setCurrentShow,
    activeCropOverlay, setActiveCropOverlay,
    activeMapViewId, setActiveMapViewId
  };
};
