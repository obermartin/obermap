import * as Mp4Muxer from 'mp4-muxer';
import maplibregl from 'maplibre-gl';
import type { AppSettings, Annotation } from '../../types';
import { generateAEJSX } from './generateAEJSX';
import { renderMarkerToCanvas } from './markerRenderer';
import { getContrastYIQ } from '../../utils/colorUtils';
import { globalLabelManager } from '../../labels/LabelMarkerManager';
import type { VideoExportState } from '../useVideoExport';

export const startExportSequence = async (
  formats: ('landscape' | 'portrait' | 'square')[],
  fileTypes: ('mp4' | 'jsx')[],
  duration: number,
  dynamicLabels: boolean = true,
  bitrate: number = 15,
  showName: string | null | undefined,
  map1: maplibregl.Map | null,
  containerRef: React.RefObject<HTMLDivElement | null>,
  settings: AppSettings,
  annotations: Annotation[],
  language: string,
  t: (key: string, options?: any) => string,
  customAlert: (msg: string) => void,
  map1MarkersRef: React.MutableRefObject<{[key: string]: maplibregl.Marker}>,
  setVideoExportState: (state: VideoExportState | null | ((prev: VideoExportState | null) => VideoExportState | null)) => void
) => {
  if (!map1 || formats.length === 0 || fileTypes.length === 0) return;
  
  if (fileTypes.includes('mp4') && typeof window.VideoEncoder === 'undefined') {
    await customAlert(t('Video export requires a modern browser and a secure context (HTTPS). WebCodecs API is not available on this server.'));
    return;
  }
  
  document.body.classList.add('is-recording');

  const shakemapDots = document.querySelectorAll('.shakemap-marker-dot');
  shakemapDots.forEach((el: any) => el.style.display = 'none');

  if (dynamicLabels) {
    annotations.forEach(ann => {
      if (ann.type === 'label' || ann.type === 'highlight') {
        map1!.setFeatureState({ source: 'custom-annotations', id: ann.id }, { visible: false });
      }
    });
  }
  
  const formatsToRender = formats;
  
  const labelAnnotations = annotations.filter(a => (a.type === 'label' || a.type === 'highlight') && a.text && a.view);
  const viewsToVisit = [
    { view: settings.defaultView, annotationId: 'overview', animationTriggerId: undefined, hideAnimationTriggerId: undefined, cropSettings: settings.defaultView.cropSettings },
    ...labelAnnotations.map(a => ({ view: a.view!, annotationId: a.id, animationTriggerId: a.animationTriggerId, hideAnimationTriggerId: a.hideAnimationTriggerId, cropSettings: a.cropSettings }))
  ];
  const totalViews = viewsToVisit.length;

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
      setVideoExportState(null);
      document.body.classList.remove('is-recording');
      window.dispatchEvent(new CustomEvent('resetAnimationTriggers'));
      window.dispatchEvent(new CustomEvent('restoreEarthquakeDotsForExport'));
      
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

    const applyCropToView = async (view: { center: [number, number], zoom: number, pitch?: number, bearing?: number, elevation?: number }, cropSetting: { scale: number, offsetX: number, offsetY: number } | undefined, targetWidth: number, format: 'landscape'|'portrait'|'square') => {
      const aspect = format === 'landscape' ? 16/9 : format === 'portrait' ? 9/16 : 1;
      let maxW = originalContainerWidth;
      let maxH = originalContainerWidth / aspect;
      if (maxH > originalContainerHeight) {
        maxH = originalContainerHeight;
        maxW = originalContainerHeight * aspect;
      }

      if (!cropSetting) {
        const newZoom = view.zoom + Math.log2(targetWidth / maxW);
        return { ...view, zoom: newZoom };
      }
      
      const { scale, offsetX, offsetY } = cropSetting;
      if (scale === 1 && offsetX === 0 && offsetY === 0) {
        const newZoom = view.zoom + Math.log2(targetWidth / maxW);
        return { ...view, zoom: newZoom };
      }

      const newZoom = view.zoom + Math.log2(targetWidth / (maxW * scale));
      
      map1!.jumpTo({
        center: view.center,
        zoom: view.zoom,
        pitch: view.pitch,
        bearing: view.bearing,
        ...(view.elevation !== undefined ? { elevation: view.elevation } : {})
      });

      await new Promise<void>(resolve => {
         const timer = setTimeout(() => {
             map1!.off('render', onRender);
             resolve();
         }, 100);
         const onRender = () => {
             clearTimeout(timer);
             resolve();
         };
         map1!.once('render', onRender);
      });

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
      
      const currentViewsToVisit = [];
      for (const v of viewsToVisit) {
        const specificCropSetting = v.cropSettings?.[currentFmt] || cropSetting;
        currentViewsToVisit.push({
          ...v,
          view: await applyCropToView(v.view, specificCropSetting, targetWidth, currentFmt)
        });
      }

      if (currentViewsToVisit.length > 0 && fIdx === 0) {
        map1!.jumpTo({
          center: currentViewsToVisit[0].view.center,
          zoom: currentViewsToVisit[0].view.zoom,
          pitch: currentViewsToVisit[0].view.pitch,
          bearing: currentViewsToVisit[0].view.bearing,
          ...(currentViewsToVisit[0].view.elevation !== undefined ? { elevation: currentViewsToVisit[0].view.elevation } : {})
        });
        await new Promise(r => setTimeout(r, 1000));
      }

      window.dispatchEvent(new CustomEvent('resetAnimationTriggers'));
      window.dispatchEvent(new CustomEvent('hideEarthquakeDotsForExport'));
      
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

      await new Promise(r => setTimeout(r, 500));
      map1.resize();
      await new Promise(r => setTimeout(r, 1000));

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

      const compositorCanvas = document.createElement('canvas');
      compositorCanvas.width = targetWidth;
      compositorCanvas.height = targetHeight;
      const ctx = compositorCanvas.getContext('2d', { willReadFrequently: true })!;

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
      map1.triggerRepaint();

      let frameCount = 0;
      
      const captureFrame = async () => {
        if (!isRecording) return;
        
        ctx.globalCompositeOperation = 'source-over';
        ctx.clearRect(0, 0, targetWidth, targetHeight);
        
        try {
          const bitmap = await createImageBitmap(offscreenMapCanvas, { premultiplyAlpha: 'premultiply' });
          ctx.drawImage(bitmap, 0, 0, targetWidth, targetHeight);
          bitmap.close();
        } catch (e) {
          ctx.drawImage(offscreenMapCanvas, 0, 0, targetWidth, targetHeight);
        }
        
        ctx.globalCompositeOperation = 'destination-over';
        ctx.fillStyle = settings.enableSky ? (settings.skyColor || '#88C6FC') : '#18181b';
        ctx.fillRect(0, 0, targetWidth, targetHeight);
        ctx.globalCompositeOperation = 'source-over';
        
        Object.entries(map1MarkersRef.current).forEach(([id, markerInfo]) => {
          renderMarkerToCanvas({
            ctx,
            map: map1,
            id,
            markerInfo,
            annotations,
            preloadedIcons,
            preloadedLabels,
            preloadedWeatherIcons,
            exportScale: 1,
            annScale: settings.exportAnnotationScale ?? 1.0
          });
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
              setTimeout(resolve, 500);
            }
          };
          map1!.on('idle', onIdle);
          
          setTimeout(() => {
             if (!hasResolved) {
                hasResolved = true;
                map1!.off('idle', onIdle);
                resolve();
             }
          }, 3000);
        });
      }

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

      for (let i = 0; i < currentViewsToVisit.length; i++) {
        const { view } = currentViewsToVisit[i];
        
        setVideoExportState(prev => prev ? { ...prev, progress: i + 1, total: currentViewsToVisit.length } : null);
        
        if (dynamicLabels) {
          const currId = currentViewsToVisit[i].animationTriggerId || currentViewsToVisit[i].annotationId;
          const hideId = currentViewsToVisit[i].hideAnimationTriggerId;
          
          if (currId && currId !== 'overview') {
            window.dispatchEvent(new CustomEvent('activateExportTrigger', { detail: { triggerId: currId } }));
          }
          if (hideId) {
            window.dispatchEvent(new CustomEvent('updateHideAnimationTrigger', { detail: { triggerId: hideId } }));
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
              setTimeout(resolve, 1000);
            });
          }
        });
      }

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
    document.body.classList.remove('is-recording');
    const shakemapDots = document.querySelectorAll('.shakemap-marker-dot');
    shakemapDots.forEach((el: any) => el.style.display = '');
    window.dispatchEvent(new CustomEvent('restoreEarthquakeDotsForExport'));
    setVideoExportState(null);
    if (dynamicLabels) {
      annotations.forEach(ann => {
        if (ann.type === 'label' || ann.type === 'highlight') {
          map1!.setFeatureState({ source: 'custom-annotations', id: ann.id }, { visible: true });
        }
      });
    }
    setTimeout(() => map1?.resize(), 500);
  }
};
