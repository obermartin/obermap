import React, { useState, useEffect } from 'react';
import * as Mp4Muxer from 'mp4-muxer';
import maplibregl from 'maplibre-gl';
import type { AppSettings, Annotation } from '../types';

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

import { getContrastYIQ } from '../utils/colorUtils';
import { globalLabelManager } from '../labels/LabelMarkerManager';

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
  // --- VIDEO EXPORT STATE ---
  const [videoExportState, setVideoExportState] = useState<{
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
  } | null>(null);



  const generateAEJSX = (viewsToVisit: any[], duration: number) => {
    let script = `(function() {
  app.beginUndoGroup("Import OBERMAP Animation");

  var comp = app.project.activeItem;
  if (!comp || !(comp instanceof CompItem)) {
    alert("Please select the containing comp or Map Comp in the Project panel/Timeline before running this script.");
    return;
  }

  var layer = comp.selectedLayers.length > 0 ? comp.selectedLayers[0] : null;
  if (!layer) {
    for (var i = 1; i <= comp.numLayers; i++) {
      if (comp.layer(i).property("Effects").property("Latitude") != null) {
        layer = comp.layer(i);
        break;
      }
    }
  }

  if (!layer || layer.property("Effects").property("Latitude") == null) {
    alert("Could not find a layer with Geolayers effects (Latitude, Longitude, Zoom). Please select the Map Comp layer and try again.");
    return;
  }

  function getParam(effectName) {
    var eff = layer.property("Effects").property(effectName);
    if (!eff) return null;
    return eff.property(1); // Get slider/angle value
  }

  var latProp = getParam("Latitude");
  var lonProp = getParam("Longitude");
  var zoomProp = getParam("Zoom");
  var bearingProp = getParam("Bearing");
  var pitchProp = getParam("Pitch");
  
  if (!latProp || !lonProp || !zoomProp) {
      alert("Geolayers properties missing on layer.");
      return;
  }

  // Clear existing keyframes
  while (latProp.numKeys > 0) latProp.removeKey(1);
  while (lonProp.numKeys > 0) lonProp.removeKey(1);
  while (zoomProp.numKeys > 0) zoomProp.removeKey(1);
  if (bearingProp) while (bearingProp.numKeys > 0) bearingProp.removeKey(1);
  if (pitchProp) while (pitchProp.numKeys > 0) pitchProp.removeKey(1);

  var easeIn = new KeyframeEase(0, 33);
  var easeOut = new KeyframeEase(0, 33);

  function addKey(prop, time, value) {
      if (!prop) return;
      var k = prop.addKey(time);
      prop.setValueAtKey(k, value);
      prop.setTemporalEaseAtKey(k, [easeIn], [easeOut]);
  }
`;

    let currentTime = 0;

    for (let i = 0; i < viewsToVisit.length; i++) {
      const v = viewsToVisit[i].view;
      
      if (i > 0) {
        currentTime += duration;
      }
      
      script += `
  addKey(latProp, ${currentTime}, ${v.center[1]});
  addKey(lonProp, ${currentTime}, ${v.center[0]});
  addKey(zoomProp, ${currentTime}, ${v.zoom});
  addKey(bearingProp, ${currentTime}, ${v.bearing || 0});
  addKey(pitchProp, ${currentTime}, ${v.pitch || 0});
`;
      
      // Add hold frame
      if (i === 0) {
        currentTime += 2; // Pause 2s at the start
      } else {
        currentTime += 1; // Pause 1s at each stop
      }
      
      script += `
  addKey(latProp, ${currentTime}, ${v.center[1]});
  addKey(lonProp, ${currentTime}, ${v.center[0]});
  addKey(zoomProp, ${currentTime}, ${v.zoom});
  addKey(bearingProp, ${currentTime}, ${v.bearing || 0});
  addKey(pitchProp, ${currentTime}, ${v.pitch || 0});
`;
    }

    script += `
  app.endUndoGroup();
})();`;

    return script;
  };

  const startExportSequence = async (formats: ('landscape' | 'portrait' | 'square')[], fileTypes: ('mp4' | 'jsx')[], duration: number, dynamicLabels: boolean = true, bitrate: number = 15, showName?: string | null) => {
    if (!map1 || formats.length === 0 || fileTypes.length === 0) return;
    
    if (fileTypes.includes('mp4') && typeof window.VideoEncoder === 'undefined') {
      await customAlert(t('Video export requires a modern browser and a secure context (HTTPS). WebCodecs API is not available on this server.'));
      return;
    }
    
    // Disable user interactions
    document.body.classList.add('is-recording');

    const shakemapDots = document.querySelectorAll('.shakemap-marker-dot');
    shakemapDots.forEach((el: any) => el.style.display = 'none');

    // Reset all animation triggers
    // We will reset animation triggers inside the format loop

    // Hide labels and highlights initially if dynamicLabels is enabled
    if (dynamicLabels) {
      annotations.forEach(ann => {
        if (ann.type === 'label' || ann.type === 'highlight') {
          map1!.setFeatureState({ source: 'custom-annotations', id: ann.id }, { visible: false });
        }
      });
    }
    
    const formatsToRender = formats;
    
    // Calculate total views: defaultView + label views
    const labelAnnotations = annotations.filter(a => (a.type === 'label' || a.type === 'highlight') && a.text && a.view);
    const viewsToVisit = [
      { view: settings.defaultView, annotationId: 'overview', animationTriggerId: undefined, hideAnimationTriggerId: undefined, cropSettings: settings.defaultView.cropSettings },
      ...labelAnnotations.map(a => ({ view: a.view!, annotationId: a.id, animationTriggerId: a.animationTriggerId, hideAnimationTriggerId: a.hideAnimationTriggerId, cropSettings: a.cropSettings }))
    ];
    const totalViews = viewsToVisit.length;

    // Generate JSX if requested
    if (fileTypes.includes('jsx')) {
      const jsxContent = generateAEJSX(viewsToVisit, duration);
      const blob = new Blob([jsxContent], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const safeShowName = (showName || 'obermap_tour').replace(/\s+/g, '_');
      a.download = `${safeShowName}.jsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      if (!fileTypes.includes('mp4')) {
        // Exit early since we don't need the MP4
        setVideoExportState(null);
        document.body.classList.remove('is-recording');
        window.dispatchEvent(new CustomEvent('resetAnimationTriggers'));
        
        // Restore earthquake filters
        window.dispatchEvent(new CustomEvent('restoreEarthquakeDotsForExport'));
        
        // Restore dynamic labels
        if (dynamicLabels) {
          annotations.forEach(ann => {
            if (ann.type === 'label' || ann.type === 'highlight') {
              map1!.setFeatureState({ source: 'custom-annotations', id: ann.id }, { visible: true });
            }
          });
        }
        return;
      }
    }

    try {
      const originalContainerWidth = containerRef.current?.clientWidth || window.innerWidth;
      const originalContainerHeight = containerRef.current?.clientHeight || window.innerHeight;

      // Create a helper to apply crop transformation to a view
      const applyCropToView = (view: { center: [number, number], zoom: number, pitch?: number, bearing?: number, elevation?: number }, cropSetting: { scale: number, offsetX: number, offsetY: number } | undefined, targetWidth: number, format: 'landscape'|'portrait'|'square') => {
        const aspect = format === 'landscape' ? 16/9 : format === 'portrait' ? 9/16 : 1;
        let maxW = originalContainerWidth;
        let maxH = originalContainerWidth / aspect;
        if (maxH > originalContainerHeight) {
          maxH = originalContainerHeight;
          maxW = originalContainerHeight * aspect;
        }

        if (!cropSetting) {
          // Even without a crop setting, we need to adjust zoom for the container resize
          // so that the maximum box fills the target dimensions.
          const newZoom = view.zoom + Math.log2(targetWidth / maxW);
          return { ...view, zoom: newZoom };
        }
        
        const { scale, offsetX, offsetY } = cropSetting;
        if (scale === 1 && offsetX === 0 && offsetY === 0) {
          const newZoom = view.zoom + Math.log2(targetWidth / maxW);
          return { ...view, zoom: newZoom };
        }

        // targetWidth / (maxW * scale) is the exact scaling factor from the crop box to the target video/image
        const newZoom = view.zoom + Math.log2(targetWidth / (maxW * scale));
        
        // Use Maplibre's native unproject to perfectly handle 3D pitch/bearing!
        // We temporarily jump the map to the target view to ensure the projection matrix matches the view.
        // Because originalContainerWidth/Height haven't changed yet, this gives us exactly what the user saw.
        map1!.jumpTo({
          center: view.center,
          zoom: view.zoom,
          pitch: view.pitch,
          bearing: view.bearing,
          ...(view.elevation !== undefined ? { elevation: view.elevation } : {})
        });

        // The crop box was offset from the screen center by offsetX/Y pixels
        const targetScreenX = (originalContainerWidth / 2) + offsetX;
        const targetScreenY = (originalContainerHeight / 2) + offsetY;
        
        const newLngLat = map1!.unproject([targetScreenX, targetScreenY]);

        return {
          ...view,
          center: [newLngLat.lng, newLngLat.lat] as [number, number],
          zoom: newZoom
        };
      };

      for (let fIdx = 0; fIdx < formatsToRender.length; fIdx++) {
        const currentFmt = formatsToRender[fIdx];
        const cropSetting = settings.exportCropSettings?.[currentFmt];
        const targetWidth = currentFmt === 'landscape' ? 1920 : currentFmt === 'portrait' ? 1080 : 1920;
        const targetHeight = currentFmt === 'landscape' ? 1080 : currentFmt === 'portrait' ? 1920 : 1920;
        
        // Map original views to cropped views for this format
        const currentViewsToVisit = viewsToVisit.map(v => {
          const specificCropSetting = v.cropSettings?.[currentFmt] || cropSetting;
          return {
            ...v,
            view: applyCropToView(v.view, specificCropSetting, targetWidth, currentFmt)
          };
        });

        if (currentViewsToVisit.length > 0 && fIdx === 0) {
          map1!.jumpTo({
            center: currentViewsToVisit[0].view.center,
            zoom: currentViewsToVisit[0].view.zoom,
            pitch: currentViewsToVisit[0].view.pitch,
            bearing: currentViewsToVisit[0].view.bearing,
            ...(currentViewsToVisit[0].view.elevation !== undefined ? { elevation: currentViewsToVisit[0].view.elevation } : {})
          });
          // Let the map move to the starting position BEFORE starting the video export sequence
          await new Promise(r => setTimeout(r, 1000));
        }

        // Reset all animation triggers at the start of each format to prevent double-firing
        window.dispatchEvent(new CustomEvent('resetAnimationTriggers'));



      
      // Hide earthquake dots if shakemap is visible
      window.dispatchEvent(new CustomEvent('hideEarthquakeDotsForExport'));
      
      // Calculate scale so it fits on screen
      const screenW = window.innerWidth;
      const screenH = window.innerHeight;
      const scale = Math.min(screenW / targetWidth, screenH / targetHeight) * 0.8;
      
      setVideoExportState({
        active: true,
        formats,
        currentFormat: currentFmt,
        progress: 0,
        total: totalViews,
        message: formatsToRender.length > 1 ? `${t("Rendering")} ${currentFmt.toUpperCase()} (${t("Video")} ${fIdx + 1} ${t("of")} ${formatsToRender.length})...` : t("Rendering Video..."),
        duration,
        scaleTransform: `scale(${scale})`,
        width: targetWidth,
        height: targetHeight
      });

      // Wait a bit for React to render the massive container
      await new Promise(r => setTimeout(r, 500));
      map1.resize();
      await new Promise(r => setTimeout(r, 1000)); // allow tiles to load at new res

      // PRELOAD SVGS FOR COMPOSITOR
      const preloadedIcons = new Map<string, HTMLImageElement>();
      for (const ann of annotations) {
        if (ann.type === 'icon' && ann.iconId) {
          const iconObj = settings.icons?.flatMap(c => c.icons).find(i => i.id === ann.iconId);
          if (iconObj) {
            const colorHex = ann.color || '#ffffff';
            const contrast = getContrastYIQ(colorHex);
            
            const parser = new DOMParser();
            const doc = parser.parseFromString(iconObj.svg, 'image/svg+xml');
            const svgEl = doc.querySelector('svg');
            if (svgEl) {
              svgEl.setAttribute('width', '48');
              svgEl.setAttribute('height', '48');
              if (svgEl.getAttribute('fill') === 'currentColor') svgEl.setAttribute('fill', contrast);
              if (svgEl.getAttribute('stroke') === 'currentColor') svgEl.setAttribute('stroke', contrast);
              
              const elements = svgEl.querySelectorAll('*');
              for (let j = 0; j < elements.length; j++) {
                const p = elements[j];
                if (p.getAttribute('fill') === 'currentColor') p.setAttribute('fill', contrast);
                if (p.getAttribute('stroke') === 'currentColor') p.setAttribute('stroke', contrast);
                const htmlEl = p as HTMLElement;
                if (htmlEl.style?.fill === 'currentColor') htmlEl.style.fill = contrast;
                if (htmlEl.style?.stroke === 'currentColor') htmlEl.style.stroke = contrast;
              }
              const finalSvgStr = new XMLSerializer().serializeToString(doc);
              
              const img = new Image();
              await new Promise((resolve) => {
                img.onload = resolve;
                img.onerror = (e) => {
                  console.error("Failed to load SVG icon:", e, finalSvgStr);
                  resolve(null);
                };
                img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(finalSvgStr)));
              });
              preloadedIcons.set(ann.id, img);
            }
          }
        }
      }

      const preloadedLabels = new Map<string, HTMLImageElement>();
      for (const ann of annotations) {
        if (ann.type === 'label' || ann.type === 'highlight') {
          const el = document.querySelector(`.label-marker-${ann.id}`);
          if (el && el.classList.contains('label-marker')) {
            try {
              const img = await globalLabelManager.getRasterizedImage(ann.id, settings.exportAnnotationScale ?? 1.0);
              if (img) preloadedLabels.set(ann.id, img);
            } catch (e) {
              console.error('Failed to rasterize label for video export', e);
            }
          }
        }
      }

      const preloadedWeatherIcons = new Map<string, HTMLImageElement>();
      const weatherMarkers = document.querySelectorAll('.custom-city-weather-marker');
      for (let i = 0; i < weatherMarkers.length; i++) {
        const el = weatherMarkers[i];
        const svgEl = el.querySelector('svg');
        const nameSpan = el.querySelector('span');
        if (svgEl && nameSpan) {
          const doc = new DOMParser().parseFromString(svgEl.outerHTML, 'image/svg+xml');
          const finalSvgStr = new XMLSerializer().serializeToString(doc);
          const img = new Image();
          await new Promise((resolve) => {
            img.onload = resolve;
            img.onerror = resolve;
            img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(finalSvgStr)));
          });
          preloadedWeatherIcons.set(nameSpan.innerText, img);
        }
      }


      // INIT MUXER
      const muxer = new Mp4Muxer.Muxer({
        target: new Mp4Muxer.ArrayBufferTarget(),
        video: { codec: 'avc', width: targetWidth, height: targetHeight },
        fastStart: 'in-memory'
      });
      
      const videoEncoder = new VideoEncoder({
        output: (chunk, meta) => muxer.addVideoChunk(chunk, meta as any),
        error: (e) => console.error(e)
      });
      
      videoEncoder.configure({
        codec: 'avc1.640034',
        width: targetWidth,
        height: targetHeight,
        bitrate: bitrate * 1_000_000,
        framerate: 60
      });

      // COMPOSITOR CANVAS
      const compositorCanvas = document.createElement('canvas');
      compositorCanvas.width = targetWidth;
      compositorCanvas.height = targetHeight;
      const ctx = compositorCanvas.getContext('2d', { willReadFrequently: true })!;

      // CAPTURE MAPBOX SYNCHRONOUSLY TO AVOID BUFFER CLEARING
      let isRecording = true;
      const mapCanvas = map1.getCanvas();
      
      const offscreenMapCanvas = document.createElement('canvas');
      offscreenMapCanvas.width = mapCanvas.width;
      offscreenMapCanvas.height = mapCanvas.height;
      const offscreenMapCtx = offscreenMapCanvas.getContext('2d', { willReadFrequently: true })!;
      
      const renderHandler = () => {
        if (!isRecording) return;
        if (offscreenMapCanvas.width !== mapCanvas.width) offscreenMapCanvas.width = mapCanvas.width;
        if (offscreenMapCanvas.height !== mapCanvas.height) offscreenMapCanvas.height = mapCanvas.height;
        offscreenMapCtx.clearRect(0, 0, offscreenMapCanvas.width, offscreenMapCanvas.height);
        offscreenMapCtx.drawImage(mapCanvas, 0, 0);
      };
      
      map1.on('render', renderHandler);
      map1.triggerRepaint(); // Force initial capture

      // RENDER LOOP
      let frameCount = 0;
      
      const captureFrame = () => {
        if (!isRecording) return;
        
        ctx.clearRect(0, 0, targetWidth, targetHeight);
        ctx.drawImage(offscreenMapCanvas, 0, 0, targetWidth, targetHeight);
        
        
        Object.entries(map1MarkersRef.current).forEach(([id, markerInfo]) => {
          const ann = annotations.find(a => a.id === id);

          const el = markerInfo.getElement();
          if (!el || el.style.opacity === '0' || el.style.visibility === 'hidden' || el.style.display === 'none') return;
          
          const lngLat = markerInfo.getLngLat();
          if (!lngLat) return;
          
          const point = map1!.project(lngLat);
          ctx.save();
          ctx.translate(point.x, point.y);
          
          const annScale = settings.exportAnnotationScale ?? 1.0;
          ctx.scale(annScale, annScale);
          
          let innerEl = el;
          if (el.className.includes('label-marker-')) {
            innerEl = el.querySelector('.custom-marker-flat') as HTMLElement 
              || el.querySelector('.custom-marker-dot') as HTMLElement
              || el.querySelector('.icon-marker') as HTMLElement
              || el.querySelector('.custom-highlight-marker') as HTMLElement
              || el.querySelector('.custom-country-marker') as HTMLElement
              || el;
          }
          
          let opacity = parseFloat(window.getComputedStyle(innerEl).opacity || window.getComputedStyle(el).opacity || '1');
          if (isNaN(opacity)) opacity = 1;
          ctx.globalAlpha = opacity;

          if (innerEl.classList.contains('custom-marker')) {
            const plate = innerEl.querySelector('.custom-marker-plate') as HTMLElement;
            const textEl = innerEl.querySelector('.custom-marker-text') as HTMLElement;
            if (plate && textEl) {
              const spans = textEl.querySelectorAll('span');
              const lines = spans.length > 0 ? Array.from(spans).map(s => s.textContent || '') : [textEl.textContent?.trim() || ''];
              
              ctx.font = '600 12px Roboto, sans-serif';
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              
              const textW = Math.max(...lines.map(l => ctx.measureText(l.toUpperCase()).width));
              const boxW = textW + 16;
              const boxH = lines.length > 1 ? 32 : 20;
              const pointerH = 6;
              
              const startX = -boxW / 2;
              const startY = -(boxH + pointerH);
              
              const clipStr = window.getComputedStyle(plate).clipPath || '';
              let clipTop = 0;
              if (clipStr.includes('inset')) {
                const match = clipStr.match(/inset\(([-\d.]+)%?/);
                if (match) clipTop = parseFloat(match[1]) || 0;
              }
              const clipPx = (clipTop / 100) * boxH;
              
              let transY = 0;
              const transStr = window.getComputedStyle(textEl).transform || '';
              if (transStr.includes('translateY')) {
                const match = transStr.match(/translateY\(([-\d.]+)%\)/);
                if (match) transY = parseFloat(match[1]) || 0;
              }
              const textOffY = (transY / 100) * boxH;

              ctx.beginPath();
              ctx.moveTo(-6, startY + boxH);
              ctx.lineTo(6, startY + boxH);
              ctx.lineTo(0, startY + boxH + pointerH);
              ctx.fillStyle = window.getComputedStyle(plate).borderColor || '#000';
              ctx.fill();

              ctx.save();
              ctx.beginPath();
              ctx.rect(startX, startY + clipPx, boxW, boxH - clipPx);
              ctx.clip();
              ctx.fillStyle = (ann && ann.color) ? ann.color : (window.getComputedStyle(plate).backgroundColor || '#000');
              ctx.fillRect(startX, startY, boxW, boxH);
              
              ctx.fillStyle = window.getComputedStyle(textEl).color || '#fff';
              if (lines.length > 1) {
                ctx.font = '600 14px Roboto, sans-serif';
                ctx.fillText(lines[0].toUpperCase(), 0, startY + boxH / 2 + textOffY - 6);
                ctx.font = '400 10px Roboto, sans-serif';
                ctx.fillText(lines[1].toUpperCase(), 0, startY + boxH / 2 + textOffY + 8);
              } else {
                ctx.fillText(lines[0].toUpperCase(), 0, startY + boxH / 2 + textOffY);
              }
              ctx.restore();
            }
          } 
          else if (innerEl.classList.contains('custom-highlight-marker')) {
            const plate = innerEl.querySelector('.custom-highlight-plate') as HTMLElement;
            const textEl = innerEl.querySelector('.custom-highlight-text') as HTMLElement;
            
            ctx.beginPath();
            ctx.arc(0, 0, 7, 0, Math.PI * 2);
            ctx.fillStyle = (ann && ann.color) ? ann.color : (window.getComputedStyle(innerEl).backgroundColor || '#000');
            ctx.fill();

            if (plate && textEl) {
              const text = (textEl.textContent?.trim() || '').toUpperCase();
              ctx.font = '700 14px Roboto, sans-serif';
              ctx.textAlign = 'left';
              ctx.textBaseline = 'middle';
              
              const boxW = ctx.measureText(text).width + 16;
              const boxH = 22;
              const startX = 15; 
              const startY = -boxH / 2;
              
              let clipLeft = 0;
              const clipStr = window.getComputedStyle(plate).clipPath || '';
              if (clipStr.includes('inset')) {
                const parts = clipStr.replace('inset(', '').replace(')', '').split(' ');
                if (parts.length > 1) clipLeft = parseFloat(parts[1]) || 0;
              }
              const clipPx = (clipLeft / 100) * boxW;
              
              let transY = 0;
              const transStr = window.getComputedStyle(textEl).transform || '';
              if (transStr.includes('translateY')) {
                const match = transStr.match(/translateY\(([-\d.]+)%\)/);
                if (match) transY = parseFloat(match[1]) || 0;
              }
              const textOffY = (transY / 100) * boxH;
              
              ctx.save();
              ctx.beginPath();
              ctx.rect(startX, startY, boxW - clipPx, boxH);
              ctx.clip();
              ctx.fillStyle = (ann && ann.color) ? ann.color : (window.getComputedStyle(plate).backgroundColor || '#000');
              ctx.fillRect(startX, startY, boxW, boxH);
              ctx.fillStyle = window.getComputedStyle(textEl).color || '#fff';
              ctx.fillText(text, startX + 8, textOffY + 1.5);
              ctx.restore();
            }
          }
          else if (innerEl.classList.contains('custom-country-marker')) {
            ctx.globalAlpha = 1.0; // Force full opacity for country markers
            const plate = innerEl.querySelector('.custom-country-plate') as HTMLElement;
            const textEl = innerEl.querySelector('.custom-country-text') as HTMLElement;
            if (plate && textEl) {
              const text = (textEl.textContent?.trim() || '').toUpperCase();
              ctx.font = '700 14px Roboto, sans-serif';
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              
              const boxW = ctx.measureText(text).width + 16;
              const boxH = 22;
              const startX = -boxW / 2;
              const startY = -boxH / 2;
              
              let clipRight = 0;
              const clipStr = window.getComputedStyle(plate).clipPath || '';
              if (clipStr.includes('inset')) {
                const parts = clipStr.replace('inset(', '').replace(')', '').split(' ');
                if (parts.length > 1) clipRight = parseFloat(parts[1]) || 0;
              }
              const clipPx = (clipRight / 100) * boxW;
              
              let transY = 0;
              const transStr = window.getComputedStyle(textEl).transform || '';
              if (transStr.includes('translateY')) {
                const match = transStr.match(/translateY\(([-\d.]+)%\)/);
                if (match) transY = parseFloat(match[1]) || 0;
              }
              const textOffY = (transY / 100) * boxH;
              
              ctx.save();
              ctx.beginPath();
              ctx.rect(startX, startY, boxW - clipPx, boxH);
              ctx.clip();
              ctx.fillStyle = (ann && ann.color) ? ann.color : (window.getComputedStyle(plate).backgroundColor || '#000');
              ctx.fillRect(startX, startY, boxW, boxH);
              ctx.fillStyle = window.getComputedStyle(textEl).color || '#fff';
              ctx.fillText(text, 0, textOffY);
              ctx.restore();
            }
          }
          else if (innerEl.classList.contains('icon-marker')) {
            const img = preloadedIcons.get(id);
            if (img && img.complete && img.naturalWidth > 0) {
              const bgStr = window.getComputedStyle(innerEl).backgroundColor || '#ffffff';
              ctx.beginPath();
              ctx.rect(-32, -32, 64, 64);
              ctx.fillStyle = bgStr;
              ctx.fill();
              ctx.drawImage(img, -24, -24, 48, 48);
            }
          }
          else if (innerEl.classList.contains('label-marker')) {
            const img = preloadedLabels.get(id);
            if (img && img.complete && img.naturalWidth > 0) {
               const offset = globalLabelManager.getAnchorOffset(id);
               const currentScale = settings.exportAnnotationScale ?? 1.0;
               if (offset) {
                 ctx.drawImage(img, -offset.x, -offset.y, img.naturalWidth / currentScale, img.naturalHeight / currentScale);
               }
            }
          }
          else if (innerEl.classList.contains('custom-marker-flat')) {
            const lines = el.innerHTML.split(/<br\s*\/?>/i).map((s: string) => s.replace(/<[^>]+>/g, '').trim());
            ctx.font = innerEl.classList.contains('text-xs') ? '700 12px ui-sans-serif, system-ui' : '600 12px ui-sans-serif, system-ui';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            
            const textW = Math.max(...lines.map((l: string) => ctx.measureText(l).width));
            const boxW = textW + 12;
            const boxH = lines.length === 2 ? 30 : 20;
            const startX = -boxW / 2;
            const startY = -boxH / 2;
            
            ctx.fillStyle = (ann && ann.color) ? ann.color : (window.getComputedStyle(innerEl).backgroundColor || '#000');
            ctx.fillRect(startX, startY, boxW, boxH);
            ctx.fillStyle = window.getComputedStyle(innerEl).color || '#fff';
            
            if (lines.length === 1) {
              ctx.fillText(lines[0], 0, 0);
            } else {
              ctx.fillText(lines[0], 0, -6);
              ctx.font = '600 9px ui-sans-serif, system-ui';
              ctx.globalAlpha = opacity * 0.9;
              ctx.fillText(lines[1], 0, 8);
            }
          }
          else if (innerEl.classList.contains('custom-marker-dot') || innerEl.classList.contains('custom-route-dot')) {
            ctx.beginPath();
            ctx.arc(0, 0, 12, 0, Math.PI * 2);
            ctx.fillStyle = (ann && ann.color) ? ann.color : (window.getComputedStyle(innerEl).backgroundColor || '#000');
            ctx.fill();
          }
          else if (innerEl.classList.contains('custom-city-weather-marker')) {
            const spans = innerEl.querySelectorAll('span');
            const svgDiv = innerEl.querySelector('div');
            
            ctx.font = '700 11px system-ui, -apple-system, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            
            let text = '';
            if (spans.length > 0) {
              text = Array.from(spans).map(s => s.innerText).join(' ');
            }
            
            const hasIcon = !!svgDiv;
            const textW = text ? ctx.measureText(text).width : 0;
            const iconW = hasIcon ? 14 : 0;
            const gap = (text && hasIcon) ? 6 : 0; 
            
            const totalW = textW + gap + iconW;
            const px = 6; 
            const py = 2; 
            const boxW = totalW + (px * 2);
            const boxH = 16 + (py * 2);
            
            const startX = -boxW / 2;
            const startY = (-boxH / 2) - 16; 
            
            ctx.fillStyle = '#000000';
            ctx.beginPath();
            ctx.rect(startX, startY, boxW, boxH);
            ctx.fill();
            
            ctx.fillStyle = '#ffffff';
            let currentX = startX + px;
            
            if (text) {
              ctx.fillText(text, currentX + textW/2, startY + boxH/2);
              currentX += textW + gap;
            }
            
            if (hasIcon) {
               const img = preloadedWeatherIcons.get(text);
               if (img) {
                  ctx.drawImage(img, currentX, startY + (boxH - 14) / 2, 14, 14);
               }
            }
          }
          
          ctx.restore();
        });

        annotations.filter(a => a.type === 'headline').forEach(ann => {
          const el = document.querySelector(`.headline-overlay-element[data-id="${ann.id}"]`) as HTMLElement;
          if (!el || parseFloat(window.getComputedStyle(el).opacity || '1') === 0) return;

          const x = ann.screenPosition?.x || 0;
          const y = ann.screenPosition?.y || 0;
          
          ctx.save();
          ctx.translate(x, y);
          ctx.textBaseline = 'middle';
          ctx.textAlign = 'left';
          
          let currentX = 0;
          const fontSize = 48; // 3em = 48px
          const bgHeight = fontSize * 1.1;
          const centerY = bgHeight / 2;
          
          if (ann.text) {
            ctx.font = `900 ${fontSize}px "Gotham Condensed"`;
            ctx.fillStyle = '#000000';
            const textStr = ann.text;
            ctx.fillText(textStr, currentX, centerY + 3);
            currentX += ctx.measureText(textStr).width;
          }
          if (ann.secondaryText) {
            if (currentX > 0) currentX += 12; // gap-3 = 12px
            ctx.font = `900 ${fontSize}px "Gotham Condensed"`;
            const secStr = ann.secondaryText;
            const secW = ctx.measureText(secStr).width;
            
            ctx.fillStyle = '#FF0000';
            ctx.fillRect(currentX - 8, 0, secW + 16, bgHeight);
            
            ctx.fillStyle = '#FFFFFF';
            ctx.fillText(secStr, currentX, centerY + 3);
          }
          
          ctx.restore();
        });

        const frame = new VideoFrame(compositorCanvas, { timestamp: frameCount * 1e6 / 60 });
        videoEncoder.encode(frame, { keyFrame: frameCount % 60 === 0 });
        frame.close();
        frameCount++;
        requestAnimationFrame(captureFrame);
      };
      
      // PRELOAD TILES BY JUMPING TO ALL VIEWS
      for (let i = 0; i < currentViewsToVisit.length; i++) {
        setVideoExportState(prev => prev ? { ...prev, message: `Preloading map tiles... (${i + 1}/${currentViewsToVisit.length})` } : null);
        const { view } = currentViewsToVisit[i];
        await new Promise<void>((resolve) => {
          map1!.jumpTo({
            center: view.center,
            zoom: view.zoom,
            pitch: view.pitch,
            bearing: view.bearing,
            ...(view.elevation !== undefined ? { elevation: view.elevation } : {})
          });
          
          let hasResolved = false;
          const onIdle = () => {
            if (!hasResolved) {
              hasResolved = true;
              map1!.off('idle', onIdle);
              // Brief delay for vector tiles
              setTimeout(resolve, 500);
            }
          };
          map1!.on('idle', onIdle);
          
          // Fallback
          setTimeout(() => {
             if (!hasResolved) {
                hasResolved = true;
                map1!.off('idle', onIdle);
                resolve();
             }
          }, 3000);
        });
      }

      // Jump back to the start
      const firstView = currentViewsToVisit[0].view;
      await new Promise<void>((resolve) => {
        map1!.jumpTo({
          center: firstView.center,
          zoom: firstView.zoom,
          pitch: firstView.pitch,
          bearing: firstView.bearing,
          ...(firstView.elevation !== undefined ? { elevation: firstView.elevation } : {})
        });
        setTimeout(resolve, 1000);
      });

      setVideoExportState(prev => prev ? { ...prev, message: formatsToRender.length > 1 ? `${t("Rendering")} ${currentFmt.toUpperCase()} (${t("Video")} ${fIdx + 1} ${t("of")} ${formatsToRender.length})...` : t("Rendering Video...") } : null);

      requestAnimationFrame(captureFrame);

      // FLY TO VIEWS
      for (let i = 0; i < currentViewsToVisit.length; i++) {
        const { view } = currentViewsToVisit[i];
        
        setVideoExportState(prev => prev ? { ...prev, progress: i + 1, total: currentViewsToVisit.length } : null);
        
        if (dynamicLabels) {
          const currId = currentViewsToVisit[i].animationTriggerId || currentViewsToVisit[i].annotationId;
          
          if (currId && currId !== 'overview') {
            window.dispatchEvent(new CustomEvent('activateExportTrigger', { detail: { triggerId: currId } }));
          }
        }

        await new Promise<void>((resolve) => {
          if (i === 0) {
            map1!.jumpTo({
              center: view.center,
              zoom: view.zoom,
              pitch: view.pitch,
              bearing: view.bearing,
              ...(view.elevation !== undefined ? { elevation: view.elevation } : {})
            });
            // Allow tiles to load and give a brief pause at the start of the video
            setTimeout(resolve, 2000);
          } else {
                        map1!.flyTo({
              center: view.center,
              zoom: view.zoom,
              pitch: view.pitch,
              bearing: view.bearing,
              duration: duration * 1000,
              essential: true
            });
                        if (view.elevation !== undefined) {
              map1!.once('moveend', () => {
                const currentCenter = map1!.getCenter();
                if (currentCenter) {
                  const dist = Math.sqrt(Math.pow(currentCenter.lng - view.center[0], 2) + Math.pow(currentCenter.lat - view.center[1], 2));
                  if (dist < 0.1) {
                    map1!.jumpTo({
                      center: view.center,
                      zoom: view.zoom,
                      pitch: view.pitch,
                      bearing: view.bearing,
                      elevation: view.elevation
                    });
                  }
                }
              });
            }
            map1!.once('moveend', () => {
              // Wait 1 second extra to let tiles settle and to pause on the view
              setTimeout(resolve, 1000);
            });
          }
        });
      }

      // STOP AND EXPORT
      isRecording = false;
      map1!.off('render', renderHandler);
      await videoEncoder.flush();
      videoEncoder.close();
      muxer.finalize();
      
      const buffer = muxer.target.buffer;
      const blob = new Blob([buffer], { type: 'video/mp4' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const safeShowName = (showName || 'obermap_tour').replace(/\s+/g, '_');
      const fmtSuffix = language === 'de' ? (currentFmt === 'landscape' ? 'quer' : currentFmt === 'portrait' ? 'hochkant' : 'quadratisch') : currentFmt;
      a.download = `${safeShowName}_${fmtSuffix}.mp4`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
    } catch (err: any) {
      console.error('Video Export Error:', err);
      await customAlert(t('An error occurred during video export: \n{{err}}', { err: err.message || String(err) }));
    } finally {
      // RESTORE
      document.body.classList.remove('is-recording');
      const shakemapDots = document.querySelectorAll('.shakemap-marker-dot');
      shakemapDots.forEach((el: any) => el.style.display = '');

      // Restore earthquake filters
      window.dispatchEvent(new CustomEvent('restoreEarthquakeDotsForExport'));

      setVideoExportState(null);
      if (dynamicLabels) {
        annotations.forEach(ann => {
          if (ann.type === 'label' || ann.type === 'highlight') {
            map1!.setFeatureState({ source: 'custom-annotations', id: ann.id }, { visible: true });
          }
        });
      }
      // Resize map back to 100%
      setTimeout(() => map1?.resize(), 500);
    }
  };

  const startImageExportSequence = async (formats: ('landscape' | 'portrait' | 'square')[], filenamePrefix: string = 'obermap') => {
    if (!map1 || formats.length === 0) return;
    
    // Disable user interactions
    document.body.classList.add('is-recording');
    
    const shakemapDots = document.querySelectorAll('.shakemap-marker-dot');
    shakemapDots.forEach((el: any) => el.style.display = 'none');

    const originalZoom = map1.getZoom();
    const originalCenter = map1.getCenter();
    const originalPitch = map1.getPitch();
    const originalBearing = map1.getBearing();
    const originalContainerWidth = containerRef.current?.clientWidth || window.innerWidth;
    const originalContainerHeight = containerRef.current?.clientHeight || window.innerHeight;

    try {
      const applyCropToView = (view: { center: [number, number], zoom: number }, cropSetting: { scale: number, offsetX: number, offsetY: number } | undefined) => {
        if (!cropSetting) return { ...view };
        
        const { scale, offsetX, offsetY } = cropSetting;
        if (scale === 1 && offsetX === 0 && offsetY === 0) {
          return { ...view };
        }

        const newZoom = view.zoom - Math.log2(scale);
        
        map1!.jumpTo({
          center: view.center,
          zoom: view.zoom,
          pitch: originalPitch,
          bearing: originalBearing
        });

        const screenCenterX = originalContainerWidth / 2;
        const screenCenterY = originalContainerHeight / 2;
        
        const targetScreenX = screenCenterX + offsetX;
        const targetScreenY = screenCenterY + offsetY;
        
        const newLngLat = map1!.unproject([targetScreenX, targetScreenY]);

        return {
          ...view,
          center: [newLngLat.lng, newLngLat.lat] as [number, number],
          zoom: newZoom
        };
      };

      for (let fIdx = 0; fIdx < formats.length; fIdx++) {
        const currentFmt = formats[fIdx];
        
        // Output image should have a height of 3840 physical pixels
        const outHeight = 3840;
        const aspect = currentFmt === 'landscape' ? 16/9 : currentFmt === 'portrait' ? 9/16 : 1;
        const outWidth = Math.round(outHeight * aspect);
        
        // Hide earthquake dots if shakemap is visible
        window.dispatchEvent(new CustomEvent('hideEarthquakeDotsForExport'));
        
        const cropSetting = settings.exportCropSettings?.[currentFmt];
        const croppedView = applyCropToView({ center: [originalCenter.lng, originalCenter.lat] as [number, number], zoom: originalZoom }, cropSetting);

        const dpr = window.devicePixelRatio || 1;
        const targetWidth = outWidth / dpr;
        const targetHeight = outHeight / dpr;
        
        const scaleFactor = targetHeight / originalContainerHeight;
        const newZoom = croppedView.zoom + Math.log2(scaleFactor);
        
        const screenW = window.innerWidth;
        const screenH = window.innerHeight;
        const scale = Math.min(screenW / targetWidth, screenH / targetHeight) * 0.8;
        
        setVideoExportState({
          active: true,
          formats,
          currentFormat: currentFmt,
          progress: 1,
          total: 1,
          message: formats.length > 1 ? `${t("Exporting")} ${currentFmt.toUpperCase()}...` : t("Exporting Image..."),
          duration: 0,
          scaleTransform: `scale(${scale})`,
          width: targetWidth,
          height: targetHeight,
          imageExportScale: scaleFactor
        });

        // Wait for React to apply CSS to map container
        await new Promise(r => setTimeout(r, 500));
        map1.resize();
        map1.jumpTo({ center: croppedView.center, zoom: newZoom });
        
        // Wait for map tiles to load at the new resolution
        await new Promise(r => setTimeout(r, 2000));
        
        // PRELOAD SVGS FOR COMPOSITOR
        const preloadedIcons = new Map<string, HTMLImageElement>();
        for (const ann of annotations) {
          if (ann.type === 'icon' && ann.iconId) {
            const iconObj = settings.icons?.flatMap(c => c.icons).find(i => i.id === ann.iconId);
            if (iconObj) {
              const colorHex = ann.color || '#ffffff';
              const contrast = getContrastYIQ(colorHex);
              
              const parser = new DOMParser();
              const doc = parser.parseFromString(iconObj.svg, 'image/svg+xml');
              const svgEl = doc.querySelector('svg');
              if (svgEl) {
                svgEl.setAttribute('width', '48');
                svgEl.setAttribute('height', '48');
                if (svgEl.getAttribute('fill') === 'currentColor') svgEl.setAttribute('fill', contrast);
                if (svgEl.getAttribute('stroke') === 'currentColor') svgEl.setAttribute('stroke', contrast);
                
                const elements = svgEl.querySelectorAll('*');
                for (let j = 0; j < elements.length; j++) {
                  const p = elements[j];
                  if (p.getAttribute('fill') === 'currentColor') p.setAttribute('fill', contrast);
                  if (p.getAttribute('stroke') === 'currentColor') p.setAttribute('stroke', contrast);
                  const htmlEl = p as HTMLElement;
                  if (htmlEl.style?.fill === 'currentColor') htmlEl.style.fill = contrast;
                  if (htmlEl.style?.stroke === 'currentColor') htmlEl.style.stroke = contrast;
                }
                const finalSvgStr = new XMLSerializer().serializeToString(doc);
                
                const img = new Image();
                await new Promise((resolve) => {
                  img.onload = resolve;
                  img.onerror = resolve;
                  img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(finalSvgStr)));
                });
                preloadedIcons.set(ann.id, img);
              }
            }
          }
        }

        // Pre-rasterize SVG labels
        const preloadedLabels = new Map<string, HTMLImageElement>();
        for (const ann of annotations) {
          if (ann.type === 'label' || ann.type === 'highlight') {
            const el = document.querySelector(`.label-marker-${ann.id}`);
            if (el && el.classList.contains('label-marker')) {
              try {
                const exportScale = outHeight / originalContainerHeight;
                const annScale = settings.exportAnnotationScale ?? 1.0;
                const img = await globalLabelManager.getRasterizedImage(ann.id, exportScale * annScale);
                if (img) preloadedLabels.set(ann.id, img);
              } catch (e) {
                console.error("Failed to preload label SVG", e);
              }
            }
          }
        }

        const preloadedWeatherIcons = new Map<string, HTMLImageElement>();
        const weatherMarkers = document.querySelectorAll('.custom-city-weather-marker');
        for (let i = 0; i < weatherMarkers.length; i++) {
          const el = weatherMarkers[i];
          const svgEl = el.querySelector('svg');
          const nameSpan = el.querySelector('span');
          if (svgEl && nameSpan) {
            const doc = new DOMParser().parseFromString(svgEl.outerHTML, 'image/svg+xml');
            const svgDocEl = doc.querySelector('svg');
            if (svgDocEl) {
              const finalSvgStr = new XMLSerializer().serializeToString(doc);
              const img = new Image();
              await new Promise((resolve) => {
                img.onload = resolve;
                img.onerror = resolve;
                img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(finalSvgStr)));
              });
              preloadedWeatherIcons.set(nameSpan.innerText, img);
            }
          }
        }

        // Capture map
        const mapCanvas = map1.getCanvas();
        const compositorCanvas = document.createElement('canvas');
        compositorCanvas.width = outWidth;
        compositorCanvas.height = outHeight;
        const ctx = compositorCanvas.getContext('2d', { alpha: false });
        if (!ctx) throw new Error("Canvas 2D context not supported");

        ctx.fillStyle = '#18181b';
        ctx.fillRect(0, 0, outWidth, outHeight);
        ctx.drawImage(mapCanvas, 0, 0, outWidth, outHeight);

        // Draw DOM markers
        
        Object.entries(map1MarkersRef.current).forEach(([id, markerInfo]) => {
          const ann = annotations.find(a => a.id === id);

          const el = markerInfo.getElement();
          if (!el || el.style.opacity === '0' || el.style.visibility === 'hidden' || el.style.display === 'none') return;
          
          // Skip shakemap red dots from export
          if (el.classList.contains('shakemap-marker-dot')) return;
          
          const lngLat = markerInfo.getLngLat();
          if (!lngLat) return;
          
          const point = map1!.project(lngLat);
          ctx.save();
          ctx.translate(point.x * dpr, point.y * dpr);
          
          const exportScale = outHeight / originalContainerHeight;
          const annScale = settings.exportAnnotationScale ?? 1.0;
          ctx.scale(exportScale * annScale, exportScale * annScale);
          
          let innerEl = el;
          if (el.className.includes('label-marker-')) {
            innerEl = el.querySelector('.custom-marker-flat') as HTMLElement 
              || el.querySelector('.custom-marker-dot') as HTMLElement
              || el.querySelector('.icon-marker') as HTMLElement
              || el.querySelector('.custom-highlight-marker') as HTMLElement
              || el.querySelector('.custom-country-marker') as HTMLElement
              || el;
          }
          
          let opacity = parseFloat(window.getComputedStyle(innerEl).opacity || window.getComputedStyle(el).opacity || '1');
          if (isNaN(opacity)) opacity = 1;
          ctx.globalAlpha = opacity;
          
          if (innerEl.classList.contains('custom-marker')) {
            const plate = innerEl.querySelector('.custom-marker-plate') as HTMLElement;
            const textEl = innerEl.querySelector('.custom-marker-text') as HTMLElement;
            if (plate && textEl) {
              const spans = textEl.querySelectorAll('span');
              const lines = spans.length > 0 ? Array.from(spans).map(s => s.textContent || '') : [textEl.textContent?.trim() || ''];
              
              ctx.font = '600 12px Roboto, sans-serif';
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              
              const textW = Math.max(...lines.map(l => ctx.measureText(l.toUpperCase()).width));
              const boxW = textW + 16;
              const boxH = lines.length > 1 ? 32 : 20;
              const pointerH = 6;
              
              const startX = -boxW / 2;
              const startY = -(boxH + pointerH);
              
              const clipStr = window.getComputedStyle(plate).clipPath || '';
              let clipTop = 0;
              if (clipStr.includes('inset')) {
                const match = clipStr.match(/inset\(([-\d.]+)%?/);
                if (match) clipTop = parseFloat(match[1]) || 0;
              }
              const clipPx = (clipTop / 100) * boxH;
              
              let transY = 0;
              const transStr = window.getComputedStyle(textEl).transform || '';
              if (transStr.includes('translateY')) {
                const match = transStr.match(/translateY\(([-\d.]+)%\)/);
                if (match) transY = parseFloat(match[1]) || 0;
              }
              const textOffY = (transY / 100) * boxH;

              ctx.beginPath();
              ctx.moveTo(-6, startY + boxH);
              ctx.lineTo(6, startY + boxH);
              ctx.lineTo(0, startY + boxH + pointerH);
              ctx.fillStyle = window.getComputedStyle(plate).borderColor || '#000';
              ctx.fill();

              ctx.save();
              ctx.beginPath();
              ctx.rect(startX, startY + clipPx, boxW, boxH - clipPx);
              ctx.clip();
              ctx.fillStyle = (ann && ann.color) ? ann.color : (window.getComputedStyle(plate).backgroundColor || '#000');
              ctx.fillRect(startX, startY, boxW, boxH);
              
              ctx.fillStyle = window.getComputedStyle(textEl).color || '#fff';
              if (lines.length > 1) {
                ctx.font = '600 14px Roboto, sans-serif';
                ctx.fillText(lines[0].toUpperCase(), 0, startY + boxH / 2 + textOffY - 6);
                ctx.font = '400 10px Roboto, sans-serif';
                ctx.fillText(lines[1].toUpperCase(), 0, startY + boxH / 2 + textOffY + 8);
              } else {
                ctx.fillText(lines[0].toUpperCase(), 0, startY + boxH / 2 + textOffY);
              }
              ctx.restore();
            }
          } 
          else if (innerEl.classList.contains('custom-highlight-marker')) {
            const plate = innerEl.querySelector('.custom-highlight-plate') as HTMLElement;
            const textEl = innerEl.querySelector('.custom-highlight-text') as HTMLElement;
            
            ctx.beginPath();
            ctx.arc(0, 0, 7, 0, Math.PI * 2);
            ctx.fillStyle = (ann && ann.color) ? ann.color : (window.getComputedStyle(innerEl).backgroundColor || '#000');
            ctx.fill();

            if (plate && textEl) {
              const text = (textEl.textContent?.trim() || '').toUpperCase();
              ctx.font = '700 14px Roboto, sans-serif';
              ctx.textAlign = 'left';
              ctx.textBaseline = 'middle';
              
              const boxW = ctx.measureText(text).width + 16;
              const boxH = 22;
              const startX = 15; 
              const startY = -boxH / 2;
              
              let clipLeft = 0;
              const clipStr = window.getComputedStyle(plate).clipPath || '';
              if (clipStr.includes('inset')) {
                const parts = clipStr.replace('inset(', '').replace(')', '').split(' ');
                if (parts.length > 1) clipLeft = parseFloat(parts[1]) || 0;
              }
              const clipPx = (clipLeft / 100) * boxW;
              
              let transY = 0;
              const transStr = window.getComputedStyle(textEl).transform || '';
              if (transStr.includes('translateY')) {
                const match = transStr.match(/translateY\(([-\d.]+)%\)/);
                if (match) transY = parseFloat(match[1]) || 0;
              }
              const textOffY = (transY / 100) * boxH;
              
              ctx.save();
              ctx.beginPath();
              ctx.rect(startX, startY, boxW - clipPx, boxH);
              ctx.clip();
              ctx.fillStyle = (ann && ann.color) ? ann.color : (window.getComputedStyle(plate).backgroundColor || '#000');
              ctx.fillRect(startX, startY, boxW, boxH);
              ctx.fillStyle = window.getComputedStyle(textEl).color || '#fff';
              ctx.fillText(text, startX + 8, textOffY + 1.5);
              ctx.restore();
            }
          }
          else if (innerEl.classList.contains('custom-country-marker')) {
            ctx.globalAlpha = 1.0; // Force full opacity for country markers
            const plate = innerEl.querySelector('.custom-country-plate') as HTMLElement;
            const textEl = innerEl.querySelector('.custom-country-text') as HTMLElement;
            if (plate && textEl) {
              const text = (textEl.textContent?.trim() || '').toUpperCase();
              ctx.font = '700 14px Roboto, sans-serif';
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              
              const boxW = ctx.measureText(text).width + 16;
              const boxH = 22;
              const startX = -boxW / 2;
              const startY = -boxH / 2;
              
              let clipRight = 0;
              const clipStr = window.getComputedStyle(plate).clipPath || '';
              if (clipStr.includes('inset')) {
                const parts = clipStr.replace('inset(', '').replace(')', '').split(' ');
                if (parts.length > 1) clipRight = parseFloat(parts[1]) || 0;
              }
              const clipPx = (clipRight / 100) * boxW;
              
              let transY = 0;
              const transStr = window.getComputedStyle(textEl).transform || '';
              if (transStr.includes('translateY')) {
                const match = transStr.match(/translateY\(([-\d.]+)%\)/);
                if (match) transY = parseFloat(match[1]) || 0;
              }
              const textOffY = (transY / 100) * boxH;
              
              ctx.save();
              ctx.beginPath();
              ctx.rect(startX, startY, boxW - clipPx, boxH);
              ctx.clip();
              ctx.fillStyle = (ann && ann.color) ? ann.color : (window.getComputedStyle(plate).backgroundColor || '#000');
              ctx.fillRect(startX, startY, boxW, boxH);
              ctx.fillStyle = window.getComputedStyle(textEl).color || '#fff';
              ctx.fillText(text, 0, textOffY);
              ctx.restore();
            }
          }
          else if (innerEl.classList.contains('icon-marker')) {
            const img = preloadedIcons.get(id);
            if (img && img.complete && img.naturalWidth > 0) {
              const bgStr = window.getComputedStyle(innerEl).backgroundColor || '#ffffff';
              ctx.beginPath();
              ctx.rect(-32, -32, 64, 64);
              ctx.fillStyle = bgStr;
              ctx.fill();
              ctx.drawImage(img, -24, -24, 48, 48);
            }
          }
          else if (innerEl.classList.contains('label-marker')) {
            const img = preloadedLabels.get(id);
            if (img && img.complete && img.naturalWidth > 0) {
               const offset = globalLabelManager.getAnchorOffset(id);
               const currentScale = exportScale * annScale;
               if (offset) {
                 ctx.drawImage(img, -offset.x, -offset.y, img.naturalWidth / currentScale, img.naturalHeight / currentScale);
               }
            }
          }
          else if (innerEl.classList.contains('custom-marker-flat')) {
            const lines = el.innerHTML.split(/<br\s*\/?>/i).map((s: string) => s.replace(/<[^>]+>/g, '').trim());
            ctx.font = innerEl.classList.contains('text-xs') ? '700 12px ui-sans-serif, system-ui' : '600 12px ui-sans-serif, system-ui';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            
            const textW = Math.max(...lines.map((l: string) => ctx.measureText(l).width));
            const boxW = textW + 12;
            const boxH = lines.length === 2 ? 30 : 20;
            const startX = -boxW / 2;
            const startY = -boxH / 2;
            
            ctx.fillStyle = (ann && ann.color) ? ann.color : (window.getComputedStyle(innerEl).backgroundColor || '#000');
            ctx.fillRect(startX, startY, boxW, boxH);
            ctx.fillStyle = window.getComputedStyle(innerEl).color || '#fff';
            
            if (lines.length === 1) {
              ctx.fillText(lines[0], 0, 0);
            } else {
              ctx.fillText(lines[0], 0, -6);
              ctx.font = '600 9px ui-sans-serif, system-ui';
              ctx.globalAlpha = opacity * 0.9;
              ctx.fillText(lines[1], 0, 8);
            }
          }
          else if (innerEl.classList.contains('custom-marker-dot') || innerEl.classList.contains('custom-route-dot')) {
            ctx.beginPath();
            ctx.arc(0, 0, 12, 0, Math.PI * 2);
            ctx.fillStyle = (ann && ann.color) ? ann.color : (window.getComputedStyle(innerEl).backgroundColor || '#000');
            ctx.fill();
          }
          else if (innerEl.classList.contains('custom-city-weather-marker')) {
            const spans = innerEl.querySelectorAll('span');
            const svgDiv = innerEl.querySelector('div');
            
            ctx.font = '700 11px system-ui, -apple-system, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            
            let text = '';
            if (spans.length > 0) {
              text = Array.from(spans).map(s => s.innerText).join(' ');
            }
            
            const hasIcon = !!svgDiv;
            const textW = text ? ctx.measureText(text).width : 0;
            const iconW = hasIcon ? 14 : 0;
            const gap = (text && hasIcon) ? 6 : 0; 
            
            const totalW = textW + gap + iconW;
            const px = 6; 
            const py = 2; 
            const boxW = totalW + (px * 2);
            const boxH = 16 + (py * 2);
            
            const startX = -boxW / 2;
            const startY = (-boxH / 2) - 16; 
            
            ctx.fillStyle = '#000000';
            ctx.beginPath();
            ctx.rect(startX, startY, boxW, boxH);
            ctx.fill();
            
            ctx.fillStyle = '#ffffff';
            let currentX = startX + px;
            
            if (text) {
              ctx.fillText(text, currentX + textW/2, startY + boxH/2);
              currentX += textW + gap;
            }
            
            if (hasIcon) {
               const img = preloadedWeatherIcons.get(text);
               if (img) {
                  ctx.drawImage(img, currentX, startY + (boxH - 14) / 2, 14, 14);
               }
            }
          }
          
          ctx.restore();
        });

        const dataUrl = compositorCanvas.toDataURL('image/png');
        
        // Download
        const a = document.createElement('a');
        a.href = dataUrl;
        
        // Sanitize filename prefix
        const safePrefix = (filenamePrefix || 'obermap').replace(/[^a-z0-9]/gi, '_').toLowerCase();
        const fmtSuffix = language === 'de' ? (currentFmt === 'landscape' ? 'quer' : currentFmt === 'portrait' ? 'hochkant' : 'quadratisch') : currentFmt;
        a.download = `${safePrefix}_${fmtSuffix}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
    } catch (err: any) {
      console.error('Image Export Error:', err);
      await customAlert(t('An error occurred during image export: \n{{err}}', { err: err.message || String(err) }));
    } finally {
      // Restore everything
      const shakemapDots = document.querySelectorAll('.shakemap-marker-dot');
      shakemapDots.forEach((el: any) => el.style.display = '');

      // Restore earthquake filters
      window.dispatchEvent(new CustomEvent('restoreEarthquakeDotsForExport'));

      setVideoExportState(null);
      document.body.classList.remove('is-recording');
      setTimeout(() => {
        if (map1) {
          map1.resize();
          map1.jumpTo({ center: originalCenter, zoom: originalZoom });
        }
      }, 500);
    }
  };
  // --- END VIDEO EXPORT ---


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

  return { videoExportState, setVideoExportState, startImageExportSequence };
}
