import maplibregl from 'maplibre-gl';
import type { Annotation } from '../../types';
import { globalLabelManager } from '../../labels/LabelMarkerManager';

export interface MarkerRendererProps {
  ctx: CanvasRenderingContext2D;
  map: maplibregl.Map;
  id: string;
  markerInfo: maplibregl.Marker;
  annotations: Annotation[];
  preloadedIcons: Map<string, HTMLImageElement>;
  preloadedLabels: Map<string, HTMLImageElement>;
  preloadedWeatherIcons: Map<string, HTMLImageElement>;
  exportScale: number;
  annScale: number;
  dpr?: number;
}

export const renderMarkerToCanvas = ({
  ctx,
  map,
  id,
  markerInfo,
  annotations,
  preloadedIcons,
  preloadedLabels,
  preloadedWeatherIcons,
  exportScale,
  annScale,
  dpr = 1
}: MarkerRendererProps) => {
  const ann = annotations.find(a => a.id === id);
  const el = markerInfo.getElement();
  
  if (!el || el.style.opacity === '0' || el.style.visibility === 'hidden' || el.style.display === 'none') return;
  if (el.classList.contains('shakemap-marker-dot')) return; // Skip shakemap red dots
  
  const lngLat = markerInfo.getLngLat();
  if (!lngLat) return;
  
  const point = map.project(lngLat);
  ctx.save();
  ctx.translate(point.x * dpr, point.y * dpr);
  
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
};
