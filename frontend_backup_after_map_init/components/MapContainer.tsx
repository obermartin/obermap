import React, { useState, useRef, useEffect, } from 'react';
import { useTranslation } from '../contexts/I18nContext';
import { useVideoExport } from '../hooks/useVideoExport';
import { VideoExportProgress } from './ui/VideoExportProgress';
import { customAlert } from '../utils/dialogService';
import { CropOverlay } from './CropOverlay';
import { MapboxMap } from './MapboxMap';
import type { MapContainerProps } from './MapboxMap';

export const MapContainer: React.FC<MapContainerProps> = (props) => {
  const { t, language } = useTranslation();
  const [map1, setMap1] = useState<maplibregl.Map | null>(null);
  const [map2, setMap2] = useState<maplibregl.Map | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const map1MarkersRef = useRef<{ [id: string]: maplibregl.Marker }>({});
  
  const splitLayer = props.settings.layers.find(l => l.type === 'split' && l.visible);
  const [splitPos, setSplitPos] = useState(splitLayer?.splitPosition ? splitLayer.splitPosition * 100 : 50);
  const [splitVertical, setSplitVertical] = useState(splitLayer?.splitDirection !== 'horizontal');

  const { videoExportState } = useVideoExport({
    map1,
    map2,
    containerRef,
    settings: props.settings,
    annotations: props.annotations,
    language,
    t,
    customAlert,
    map1MarkersRef
  });




  useEffect(() => {
    if (!map1 || !map2) return;
    let isSyncing = false;
    const sync1to2 = () => {
      if (isSyncing) return;
      isSyncing = true;
      map2.jumpTo({ center: map1.getCenter(), zoom: map1.getZoom(), pitch: map1.getPitch(), bearing: map1.getBearing(), ...(map1.queryTerrainElevation(map1.getCenter()) !== null ? { elevation: map1.queryTerrainElevation(map1.getCenter()) || 0 } : {}) });
      isSyncing = false;
    };
    const sync2to1 = () => {
      if (isSyncing) return;
      isSyncing = true;
      map1.jumpTo({ center: map2.getCenter(), zoom: map2.getZoom(), pitch: map2.getPitch(), bearing: map2.getBearing(), ...(map2.queryTerrainElevation(map2.getCenter()) !== null ? { elevation: map2.queryTerrainElevation(map2.getCenter()) || 0 } : {}) });
      isSyncing = false;
    };
    map1.on('move', sync1to2);
    map2.on('move', sync2to1);
    return () => {
      map1.off('move', sync1to2);
      map2.off('move', sync2to1);
    };
  }, [map1, map2]);

  const handleDrag = (e: React.MouseEvent | React.TouchEvent | MouseEvent | TouchEvent) => {
    if (!isDragging || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    let clientX, clientY;
    if ('touches' in e) {
      clientX = (e as TouchEvent).touches[0].clientX;
      clientY = (e as TouchEvent).touches[0].clientY;
    } else {
      clientX = (e as MouseEvent).clientX;
      clientY = (e as MouseEvent).clientY;
    }
    
    if (splitVertical) {
      const pos = ((clientX - rect.left) / rect.width) * 100;
      setSplitPos(Math.max(0, Math.min(100, pos)));
    } else {
      const pos = ((clientY - rect.top) / rect.height) * 100;
      setSplitPos(Math.max(0, Math.min(100, pos)));
    }
  };



  useEffect(() => {
    if (isDragging) {
      const onMove = (e: MouseEvent | TouchEvent) => handleDrag(e);
      const onUp = () => setIsDragging(false);
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
      window.addEventListener('touchmove', onMove, { passive: false });
      window.addEventListener('touchend', onUp);
      return () => {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
        window.removeEventListener('touchmove', onMove);
        window.removeEventListener('touchend', onUp);
      };
    }
  }, [isDragging, splitVertical]);



  let settings1 = props.settings;
  let settings2 = props.settings;
  let layer1Name = '';
  let layer2Name = '';

  let isSplitActive = false;

  if (splitLayer && splitLayer.splitLayers && splitLayer.splitLayers.length > 0) {
    const l1 = splitLayer.splitLayers[0];
    
    settings1 = {
      ...props.settings,
      layers: props.settings.layers.flatMap(l => l.id === splitLayer.id ? [l1] : [l])
    };
    
    if (splitLayer.splitLayers.length > 1) {
      const l2 = splitLayer.splitLayers[1];
      settings2 = {
        ...props.settings,
        layers: props.settings.layers.flatMap(l => l.id === splitLayer.id ? [l2] : [l])
      };
      layer1Name = l1.name;
      layer2Name = l2.name;
      isSplitActive = true;
    } else {
      settings2 = {
        ...props.settings,
        layers: props.settings.layers.filter(l => l.id !== splitLayer.id)
      };
      layer1Name = l1.name;
      layer2Name = 'Empty';
      isSplitActive = true;
    }
  } else if (splitLayer) {
    settings1 = {
      ...props.settings,
      layers: props.settings.layers.filter(l => l.id !== splitLayer.id)
    };
  }

  const clipPath = splitVertical ? `inset(0 0 0 ${splitPos}%)` : `inset(${splitPos}% 0 0 0)`;

  return (
    <div className="w-full h-full relative overflow-hidden z-0" ref={containerRef} style={videoExportState ? { width: `${videoExportState.width}px`, height: `${videoExportState.height}px`, transform: videoExportState.scaleTransform, transformOrigin: 'top left', position: 'absolute', top: 0, left: 0 } : undefined}>
      <MapboxMap
          {...props}
          markersRef={map1MarkersRef}
          settings={settings1}
          onMapInit={setMap1}
          isExporting={!!videoExportState} imageExportScale={videoExportState?.imageExportScale}
        />
      {isSplitActive && (
        <>
          <MapboxMap {...props} settings={settings2} onMapInit={setMap2} isSecondary clipPath={clipPath} isExporting={!!videoExportState} imageExportScale={videoExportState?.imageExportScale} />
          <div 
             onDoubleClick={(e) => {
               const rect = containerRef.current?.getBoundingClientRect();
               if (rect) {
                 if (splitVertical) {
                   const pos = ((e.clientY - rect.top) / rect.height) * 100;
                   setSplitPos(Math.max(0, Math.min(100, pos)));
                 } else {
                   const pos = ((e.clientX - rect.left) / rect.width) * 100;
                   setSplitPos(Math.max(0, Math.min(100, pos)));
                 }
               }
               setSplitVertical(!splitVertical);
             }}
             onMouseDown={(e) => { e.preventDefault(); setIsDragging(true); }}
             onTouchStart={() => { setIsDragging(true); }}
             className={`absolute flex items-center justify-center z-20 touch-none ${splitVertical ? 'w-8 h-full cursor-col-resize -ml-4' : 'h-8 w-full cursor-row-resize -mt-4'}`}
             style={splitVertical ? { left: `${splitPos}%`, top: 0 } : { top: `${splitPos}%`, left: 0 }}
          >
             <div className={`bg-white shadow-[0_0_10px_rgba(0,0,0,0.5)] pointer-events-none transition-colors ${splitVertical ? 'w-[2px] h-full' : 'h-[2px] w-full'}`} />
          </div>
          {splitVertical ? (
            <>
              <div 
                className="absolute top-[24px] whitespace-nowrap bg-white text-black px-2 py-1 text-xs font-bold pointer-events-none z-30"
                style={{ right: `calc(100% - ${splitPos}% + 6px)` }}
              >
                {layer1Name}
              </div>
              <div 
                className="absolute top-[24px] whitespace-nowrap bg-white text-black px-2 py-1 text-xs font-bold pointer-events-none z-30"
                style={{ left: `calc(${splitPos}% + 6px)` }}
              >
                {layer2Name}
              </div>
            </>
          ) : (
            <>
              <div 
                className="absolute right-[24px] whitespace-nowrap bg-white text-black px-2 py-1 text-xs font-bold pointer-events-none z-30"
                style={{ bottom: `calc(100% - ${splitPos}% + 6px)` }}
              >
                {layer1Name}
              </div>
              <div 
                className="absolute right-[24px] whitespace-nowrap bg-white text-black px-2 py-1 text-xs font-bold pointer-events-none z-30"
                style={{ top: `calc(${splitPos}% + 6px)` }}
              >
                {layer2Name}
              </div>
            </>
          )}
        </>
      )}
      
      {props.activeCropOverlay && !videoExportState && (
        <CropOverlay
          format={props.activeCropOverlay}
          cropSetting={
            props.settings.exportCropSettings?.[props.activeCropOverlay] || 
            { scale: 1, offsetX: 0, offsetY: 0 }
          }
          onChange={(newSetting: { scale: number; offsetX: number; offsetY: number; }) => {
            if (props.setSettings) {
              props.setSettings(prev => ({
                ...prev,
                exportCropSettings: {
                  ...prev.exportCropSettings,
                  landscape: prev.exportCropSettings?.landscape || { scale: 1, offsetX: 0, offsetY: 0 },
                  portrait: prev.exportCropSettings?.portrait || { scale: 1, offsetX: 0, offsetY: 0 },
                  square: prev.exportCropSettings?.square || { scale: 1, offsetX: 0, offsetY: 0 },
                  [props.activeCropOverlay!]: newSetting
                }
              }));
            }
          }}
        />
      )}
      
      <VideoExportProgress videoExportState={videoExportState} />
    </div>
  );
};
