import maplibregl from 'maplibre-gl';
import type { AppSettings, Annotation } from '../../types';
import { renderMarkerToCanvas } from './markerRenderer';
import { getContrastYIQ } from '../../utils/colorUtils';
import { globalLabelManager } from '../../labels/LabelMarkerManager';
import type { VideoExportState } from '../useVideoExport';

export const startImageExportSequence = async (
  formats: ('landscape' | 'portrait' | 'square')[],
  filenamePrefix: string = 'obermap',
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
  if (!map1 || formats.length === 0) return;
  
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
    const applyCropToView = async (view: { center: [number, number], zoom: number }, cropSetting: { scale: number, offsetX: number, offsetY: number } | undefined) => {
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
      
      const outHeight = 3840;
      const aspect = currentFmt === 'landscape' ? 16/9 : currentFmt === 'portrait' ? 9/16 : 1;
      const outWidth = Math.round(outHeight * aspect);
      
      window.dispatchEvent(new CustomEvent('hideEarthquakeDotsForExport'));
      
      const cropSetting = settings.exportCropSettings?.[currentFmt];
      const croppedView = await applyCropToView({ center: [originalCenter.lng, originalCenter.lat] as [number, number], zoom: originalZoom }, cropSetting);

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

      await new Promise(r => setTimeout(r, 500));
      map1.resize();
      map1.jumpTo({ center: croppedView.center, zoom: newZoom });
      
      await new Promise(r => setTimeout(r, 2000));
      
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

      const mapCanvas = map1.getCanvas();
      
      let mapCaptured = false;
      const offscreenMapCanvas = document.createElement('canvas');
      offscreenMapCanvas.width = mapCanvas.width;
      offscreenMapCanvas.height = mapCanvas.height;
      const offscreenMapCtx = offscreenMapCanvas.getContext('2d', { willReadFrequently: true })!;

      const captureOnce = () => {
        if (mapCaptured) return;
        mapCaptured = true;
        offscreenMapCtx.clearRect(0, 0, offscreenMapCanvas.width, offscreenMapCanvas.height);
        offscreenMapCtx.drawImage(mapCanvas, 0, 0);
        map1.off('render', captureOnce);
      };

      map1.on('render', captureOnce);
      map1.triggerRepaint();
      
      await new Promise<void>(resolve => {
        const check = () => {
          if (mapCaptured) resolve();
          else setTimeout(check, 50);
        };
        check();
      });
      
      const compositorCanvas = document.createElement('canvas');
      compositorCanvas.width = outWidth;
      compositorCanvas.height = outHeight;
      const ctx = compositorCanvas.getContext('2d');
      if (!ctx) throw new Error("Canvas 2D context not supported");

      ctx.globalCompositeOperation = 'source-over';
      ctx.clearRect(0, 0, outWidth, outHeight);
      
      try {
        const bitmap = await createImageBitmap(offscreenMapCanvas, { premultiplyAlpha: 'premultiply' });
        ctx.drawImage(bitmap, 0, 0, outWidth, outHeight);
        bitmap.close();
      } catch (e) {
        ctx.drawImage(offscreenMapCanvas, 0, 0, outWidth, outHeight);
      }
      
      ctx.globalCompositeOperation = 'destination-over';
      ctx.fillStyle = settings.enableSky ? (settings.skyColor || '#88C6FC') : '#18181b';
      ctx.fillRect(0, 0, outWidth, outHeight);
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
          exportScale: outHeight / originalContainerHeight,
          annScale: settings.exportAnnotationScale ?? 1.0,
          dpr
        });
      });

      const dataUrl = compositorCanvas.toDataURL('image/png');
      
      const a = document.createElement('a');
      a.href = dataUrl;
      
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
    const shakemapDots = document.querySelectorAll('.shakemap-marker-dot');
    shakemapDots.forEach((el: any) => el.style.display = '');

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
