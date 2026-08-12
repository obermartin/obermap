import React, { useState, useEffect } from 'react';
import maplibregl from 'maplibre-gl';
import type { AppSettings, Annotation } from '../types';
import { startExportSequence as videoExportSequence } from './export/videoExportSequence';
import { startImageExportSequence as imageExportSequence } from './export/imageExportSequence';

export interface VideoExportState {
  active: boolean;
  formats: ('landscape' | 'portrait' | 'square')[];
  currentFormat: 'landscape' | 'portrait' | 'square';
  progress: number;
  total: number;
  message: string;
  duration: number;
  scaleTransform: string;
  width: number;
  height: number;
  imageExportScale?: number;
}

export interface UseVideoExportProps {
  map1: maplibregl.Map | null;
  map2: maplibregl.Map | null;
  containerRef: React.RefObject<HTMLDivElement | null>;
  settings: AppSettings;
  annotations: Annotation[];
  language: string;
  t: (key: string, options?: any) => string;
  customAlert: (msg: string) => void;
  map1MarkersRef: React.MutableRefObject<{[key: string]: maplibregl.Marker}>;
}

export function useVideoExport({
  map1,
  map2,
  containerRef,
  settings,
  annotations,
  language,
  t,
  customAlert,
  map1MarkersRef
}: UseVideoExportProps) {
  const [videoExportState, setVideoExportState] = useState<VideoExportState | null>(null);

  const startExportSequence = async (
    formats: ('landscape' | 'portrait' | 'square')[], 
    fileTypes: ('mp4' | 'jsx')[], 
    duration: number, 
    dynamicLabels: boolean = true, 
    bitrate: number = 15, 
    showName?: string | null
  ) => {
    return videoExportSequence(
      formats,
      fileTypes,
      duration,
      dynamicLabels,
      bitrate,
      showName,
      map1,
      containerRef,
      settings,
      annotations,
      language,
      t,
      customAlert,
      map1MarkersRef,
      setVideoExportState
    );
  };

  const startImageExportSequence = async (
    formats: ('landscape' | 'portrait' | 'square')[], 
    filenamePrefix: string = 'obermap'
  ) => {
    return imageExportSequence(
      formats,
      filenamePrefix,
      map1,
      containerRef,
      settings,
      annotations,
      language,
      t,
      customAlert,
      map1MarkersRef,
      setVideoExportState
    );
  };

  useEffect(() => {
    const handleStartVideoExport = (e: any) => {
      const { formats, fileTypes, duration, dynamicLabels, bitrate, showName } = e.detail;
      startExportSequence(formats, fileTypes, duration, dynamicLabels, bitrate, showName);
    };
    
    const handleStartImageExport = (e: any) => {
      const { formats, filenamePrefix } = e.detail;
      startImageExportSequence(formats, filenamePrefix);
    };
    
    window.addEventListener('startVideoExport', handleStartVideoExport);
    window.addEventListener('startImageExport', handleStartImageExport);
    return () => {
      window.removeEventListener('startVideoExport', handleStartVideoExport);
      window.removeEventListener('startImageExport', handleStartImageExport);
    };
  }, [map1, map2, containerRef, settings, annotations]);

  return { videoExportState, setVideoExportState, startExportSequence, startImageExportSequence };
}
