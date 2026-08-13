import * as turf from '@turf/turf';
import type { Annotation, AppSettings, ToolType } from '../../types';
import { createCirclePolygon } from '../../utils/mapUtils';
import { customPrompt } from '../../utils/dialogService';
import { globalLabelManager } from '../../labels/LabelMarkerManager';
import { getContrastYIQ } from '../../utils/colorUtils';

export interface MarkerFactoryContext {
  activeTool: ToolType;
  isToolbarOpen?: boolean;
  selectedAnnotationId: string | null;
  setSelectedAnnotationId: React.Dispatch<React.SetStateAction<string | null>>;
  setAnnotations: React.Dispatch<React.SetStateAction<Annotation[]>>;
  getBaseTemplate: (id?: string) => any;
  setLabelPrompt: React.Dispatch<React.SetStateAction<{ lngLat: [number, number], initialText?: string, initialSecondary?: string, annotationId?: string } | null>>;
  t: any;
  handleRouteWaypointDragEnd: (annId: string, wpIdx: number, newLngLat: [number, number]) => void;
  settings: AppSettings;
  onViewMedia?: (annotation: Annotation) => void;
  onEditIcon?: (annotation: Annotation) => void;
}

export type ExpectedMarkerData = {
  lngLat: [number, number];
  el: HTMLElement;
  draggable?: boolean;
  onDragEnd?: (lngLat: [number, number]) => void;
};

export const createLabelMarker = (ann: Annotation, ctx: MarkerFactoryContext): Map<string, ExpectedMarkerData> => {
  const result = new Map<string, ExpectedMarkerData>();
  if (!ann.coordinates) return result;
  
  const onClick = () => {
    if (ctx.activeTool !== 'none' && ctx.isToolbarOpen) {
      ctx.setSelectedAnnotationId(ann.id);
    }
    window.dispatchEvent(new CustomEvent('flyToLabel', { detail: ann.id }));
  };
  
  let el: HTMLElement;
  const contrastColor = getContrastYIQ(ann.color || '#ffffff');
  
  if (ann.template) {
    try {
      const baseTemplateName = ctx.getBaseTemplate(ann.template) || '';
      const handle = globalLabelManager.createLabel({
        id: ann.id,
        lngLat: ann.coordinates,
        text: ann.secondaryText ? { primary: ann.text || '', secondary: ann.secondaryText } : (ann.text || ''),
        template: baseTemplateName,
        theme: ann.theme || { 
          primaryBackplateFill: globalLabelManager.templates.get(baseTemplateName)?.manifest?.primary?.color || ann.color,
          primaryTextColor: globalLabelManager.templates.get(baseTemplateName)?.manifest?.primary?.typography?.color || contrastColor,
          pointerFill: globalLabelManager.templates.get(baseTemplateName)?.manifest?.primary?.pointer?.color,
          secondaryBackplateFill: globalLabelManager.templates.get(baseTemplateName)?.manifest?.secondary?.color
        },
        onClick
      });
      el = handle.getElement();
    } catch (e) {
      console.error('Error rendering SVG label', e);
      el = document.createElement('div');
    }
  } else {
    el = document.createElement('div');
    el.className = 'custom-marker';
    el.innerHTML = `
      <div class="annotation-scale-wrapper" style="display: flex; flex-direction: column; align-items: center; transform-origin: bottom center;">
        <div class="custom-marker-plate" style="--marker-bg: ${ann.color}; background-color: ${ann.color}; border-color: ${ann.color === '#000000' || ann.color === '#000' ? 'rgba(255,255,255,0.1)' : ann.color}">
          <div class="custom-marker-text" style="color: ${contrastColor}; display: flex; flex-direction: column; align-items: flex-start;">
            <span style="font-size: 1.6em; line-height: 1;">${ann.text}</span>
            ${ann.secondaryText ? `<span style="font-size: 1em; line-height: 1;">${ann.secondaryText}</span>` : ''}
          </div>
        </div>
        <div class="custom-marker-pointer" style="border-top-color: ${ann.color}"></div>
      </div>
    `;
    el.style.cursor = 'pointer';
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      onClick();
    });
  }

  el.addEventListener('dblclick', (e) => {
    e.stopPropagation();
    if (ctx.activeTool !== 'none') {
      ctx.setLabelPrompt({
        lngLat: ann.coordinates!,
        initialText: ann.text || '',
        initialSecondary: ann.secondaryText || '',
        annotationId: ann.id
      });
    }
  });

  const isSelected = ann.id === ctx.selectedAnnotationId;
  if (isSelected) {
    el.style.filter = 'drop-shadow(0 0 6px rgba(255,255,255,1)) drop-shadow(0 0 12px rgba(255,255,255,0.8))';
    el.style.zIndex = '1000';
    const content = el.querySelector('.custom-marker-plate') || el.querySelector('.backplate.primary');
    if (content) {
      (content as HTMLElement).style.outline = '2px dashed #ffffff';
      (content as HTMLElement).style.outlineOffset = '2px';
    }
  }
  
  result.set(ann.id, {
    lngLat: ann.coordinates,
    el,
    draggable: isSelected && ctx.activeTool !== 'none',
    onDragEnd: (lngLat) => {
      ctx.setAnnotations(prev => prev.map(a => a.id === ann.id ? { ...a, coordinates: lngLat } : a));
    }
  });
  
  return result;
};

export const createHighlightMarker = (ann: Annotation, ctx: MarkerFactoryContext): Map<string, ExpectedMarkerData> => {
  const result = new Map<string, ExpectedMarkerData>();
  
  const onClick = () => {
    if (ctx.activeTool !== 'none' && ctx.isToolbarOpen) {
      ctx.setSelectedAnnotationId(ann.id);
    } else {
      window.dispatchEvent(new CustomEvent('flyToLabel', { detail: ann.id }));
    }
  };

  let el: HTMLElement;
  const contrastColor = getContrastYIQ(ann.color || '#000000');
  
  if (ann.template && !ann.polygonGeometry) {
    try {
      const baseTemplateName = ctx.getBaseTemplate(ann.template) || '';
      const handle = globalLabelManager.createLabel({
        id: ann.id,
        lngLat: ann.coordinates!,
        text: ann.text || '',
        template: baseTemplateName,
        theme: ann.theme || { 
          primaryBackplateFill: globalLabelManager.templates.get(baseTemplateName)?.manifest?.primary?.color || ann.color,
          primaryTextColor: globalLabelManager.templates.get(baseTemplateName)?.manifest?.primary?.typography?.color || contrastColor,
          pointerFill: globalLabelManager.templates.get(baseTemplateName)?.manifest?.primary?.pointer?.color,
          secondaryBackplateFill: globalLabelManager.templates.get(baseTemplateName)?.manifest?.secondary?.color
        },
        onClick
      });
      el = handle.getElement();
    } catch (e) {
      console.error('Error rendering SVG highlight', e);
      el = document.createElement('div');
    }
  } else {
    el = document.createElement('div');
    el.className = `label-marker-${ann.id} ${ann.polygonGeometry ? 'custom-country-marker' : 'custom-highlight-marker'}`;
    el.style.width = '0px';
    el.style.height = '0px';
    el.style.position = 'relative';
    
    if (ann.polygonGeometry) {
      el.innerHTML = `
        <div style="position: absolute; left: 0; top: 0; transform: translate(-50%, -50%); transform-origin: center center;">
          <div class="annotation-scale-wrapper" style="transform-origin: center center;">
            <div class="custom-country-plate" style="--marker-bg: ${ann.color}; background-color: ${ann.color};">
              <div class="custom-country-text" style="color: ${contrastColor}">
                ${ann.text || ''}
              </div>
            </div>
          </div>
        </div>
      `;
    } else {
      el.innerHTML = `
        <div style="position: absolute; left: 0; top: 0; transform: translate(-50%, -50%); transform-origin: center center;">
          <div class="annotation-scale-wrapper" style="transform-origin: center center;">
            <div class="custom-highlight-marker" style="--marker-bg: ${ann.color}; background-color: ${ann.color};">
              <div class="custom-highlight-plate" style="--marker-bg: ${ann.color}; background-color: ${ann.color};">
                <div class="custom-highlight-text" style="color: ${contrastColor}">
                  ${ann.text || ''}
                </div>
              </div>
            </div>
          </div>
        </div>
      `;
    }
    
    el.style.cursor = 'pointer';
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      onClick();
    });
  }

  el.addEventListener('dblclick', async (e) => {
    e.stopPropagation();
    if (ctx.activeTool !== 'none') {
      const newText = await customPrompt(ctx.t('Enter new text:'), ann.text || '');
      if (newText !== null) {
        ctx.setAnnotations(prev => prev.map(a => a.id === ann.id ? { ...a, text: newText } : a));
      }
    }
  });

  if (ann.id === ctx.selectedAnnotationId) {
    el.style.filter = 'drop-shadow(0 0 6px rgba(255,255,255,1)) drop-shadow(0 0 12px rgba(255,255,255,0.8))';
    el.style.zIndex = '1000';
    const content = el.querySelector('.custom-highlight-plate') || el.querySelector('.backplate.primary') || el;
    if (content) {
      (content as HTMLElement).style.outline = '2px dashed #ffffff';
      (content as HTMLElement).style.outlineOffset = '2px';
    }
  }
  
  const markerLngLat = ann.polygonGeometry && ann.polygonGeometry.type === 'Polygon' ? turf.centerOfMass(ann.polygonGeometry).geometry.coordinates as [number, number] : ann.coordinates;
  if (markerLngLat) {
    result.set(ann.id, { lngLat: markerLngLat, el });
  }
  return result;
};

export const createMeasureMarkers = (ann: Annotation, ctx: MarkerFactoryContext): Map<string, ExpectedMarkerData> => {
  const result = new Map<string, ExpectedMarkerData>();
  if (!ann.coordinates) return result;

  let totalDistance = 0;
  const contrastColor = getContrastYIQ(ann.color || '#ffffff');
  ann.coordinates.forEach((coord: [number, number], i: number) => {
    if (i > 0) {
      totalDistance += turf.distance(ann.coordinates![i-1], coord, { units: 'kilometers' });
    }
    const el = document.createElement('div');
    el.className = 'label-marker-measure-point';
    el.style.width = '0px';
    el.style.height = '0px';
    el.style.position = 'relative';
    el.innerHTML = `
      <div style="position: absolute; left: 0; top: 0; transform: translate(-50%, -50%); transform-origin: center center;">
        <div class="annotation-scale-wrapper" style="transform-origin: center center; display: flex; align-items: center; justify-content: center;">
          <div class="custom-marker-flat" style="--marker-bg: ${ann.color}; background-color: ${ann.color}; color: ${contrastColor};">
            ${totalDistance.toFixed(2)} km
          </div>
        </div>
      </div>
    `;
    el.style.cursor = 'pointer';
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      if (ctx.activeTool !== 'none' && ctx.isToolbarOpen) {
        ctx.setSelectedAnnotationId(ann.id);
      }
    });

    if (ann.id === ctx.selectedAnnotationId) {
      el.style.filter = 'drop-shadow(0 0 6px rgba(255,255,255,1)) drop-shadow(0 0 12px rgba(255,255,255,0.8))';
      el.style.zIndex = '1000';
      el.style.outline = '2px dashed #ffffff';
      el.style.outlineOffset = '2px';
    }
    result.set(`${ann.id}-measure-${i}`, { lngLat: coord, el });
  });
  return result;
};

export const createRouteMarkers = (ann: Annotation, ctx: MarkerFactoryContext): Map<string, ExpectedMarkerData> => {
  const result = new Map<string, ExpectedMarkerData>();
  if (!ann.coordinates || !ann.routeLegs) return result;

  const contrastColor = getContrastYIQ(ann.color || '#ffffff');
  let accumulatedDistance = 0;
  let accumulatedDuration = 0;
  
  ann.coordinates.forEach((coord: [number, number], i: number) => {
    const el = document.createElement('div');
    el.className = 'label-marker-route-point';
    el.style.width = '0px';
    el.style.height = '0px';
    el.style.position = 'relative';
    
    let innerClass = '';
    let innerHtml = '';
    
    if (i === 0) {
      innerClass = 'custom-marker-flat text-xs font-bold uppercase tracking-wider';
      innerHtml = 'START';
    } else {
      const leg = ann.routeLegs![i - 1];
      if (leg) {
        accumulatedDistance += leg.distance / 1000;
        accumulatedDuration += leg.duration;
      }
      const hrs = Math.floor(accumulatedDuration / 3600);
      const mins = Math.round((accumulatedDuration % 3600) / 60);
      const timeStr = hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`;
      
      innerClass = 'custom-marker-flat text-center leading-tight';
      innerHtml = `${accumulatedDistance.toFixed(1)} km<br/><span style="font-size:0.75em;opacity:0.9">${timeStr}</span>`;
    }
    
    el.innerHTML = `
        <div style="position: absolute; left: 0; top: 0; transform: translate(-50%, -50%); transform-origin: center center;">
          <div class="annotation-scale-wrapper" style="width: 100%; height: 100%; transform-origin: center center; display: flex; align-items: center; justify-content: center;">
            <div class="${innerClass}" style="--marker-bg: ${ann.color}; background-color: ${ann.color}; color: ${contrastColor};">
              ${innerHtml}
            </div>
          </div>
        </div>
    `;
    
    el.style.cursor = 'pointer';
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      if (ctx.activeTool !== 'none' && ctx.isToolbarOpen) {
        ctx.setSelectedAnnotationId(ann.id);
      }
    });

    if (ann.id === ctx.selectedAnnotationId) {
      el.style.filter = 'drop-shadow(0 0 6px rgba(255,255,255,1)) drop-shadow(0 0 12px rgba(255,255,255,0.8))';
      el.style.zIndex = '1000';
      el.style.outline = '2px dashed #ffffff';
      el.style.outlineOffset = '2px';
    }
    result.set(`${ann.id}-route-${i}`, { 
      lngLat: coord, 
      el,
      draggable: true,
      onDragEnd: (newLngLat: [number, number]) => ctx.handleRouteWaypointDragEnd(ann.id, i, newLngLat)
    });
  });
  return result;
};

export const createCircleMarkers = (ann: Annotation, ctx: MarkerFactoryContext): Map<string, ExpectedMarkerData> => {
  const result = new Map<string, ExpectedMarkerData>();
  if (!ann.coordinates || ann.coordinates.length === 0 || ann.coordinates[0].length === 0) return result;

  try {
    const contrastColor = getContrastYIQ(ann.color || '#ffffff');
    const center = turf.center(turf.polygon(ann.coordinates)).geometry.coordinates as [number, number];
    const centerEl = document.createElement('div');
    centerEl.className = 'label-marker-circle-center';
    centerEl.style.width = '0px';
    centerEl.style.height = '0px';
    centerEl.style.position = 'relative';
    centerEl.innerHTML = `
      <div style="position: absolute; left: 0; top: 0; transform: translate(-50%, -50%); transform-origin: center center;">
        <div class="annotation-scale-wrapper" style="transform-origin: center center;">
          <div class="custom-marker-dot" style="--marker-bg: ${ann.color}; background-color: ${ann.color};"></div>
        </div>
      </div>
    `;
    centerEl.style.cursor = 'pointer';
    centerEl.addEventListener('click', (e) => {
      e.stopPropagation();
      if (ctx.activeTool !== 'none' && ctx.isToolbarOpen) {
        ctx.setSelectedAnnotationId(ann.id);
      }
    });
    if (ann.id === ctx.selectedAnnotationId) {
      centerEl.style.filter = 'drop-shadow(0 0 6px rgba(255,255,255,1)) drop-shadow(0 0 12px rgba(255,255,255,0.8))';
      centerEl.style.zIndex = '1000';
      centerEl.style.outline = '2px dashed #ffffff';
      centerEl.style.outlineOffset = '2px';
    }
    result.set(`${ann.id}-circle-center`, {
      lngLat: center,
      el: centerEl,
      draggable: ann.id === ctx.selectedAnnotationId && ctx.activeTool !== 'none',
      onDragEnd: (newLngLat) => {
        const circlePoly = createCirclePolygon(newLngLat, ann.radius || 0);
        if (circlePoly) {
          ctx.setAnnotations(prev => prev.map(a => 
            a.id === ann.id ? { ...a, coordinates: circlePoly.geometry.coordinates } : a
          ));
        }
      }
    });

    const edge = ann.coordinates[0][0];
    const labelEl = document.createElement('div');
    labelEl.className = 'label-marker-circle-radius';
    labelEl.style.width = '0px';
    labelEl.style.height = '0px';
    labelEl.style.position = 'relative';
    labelEl.innerHTML = `
      <div style="position: absolute; left: 0; top: 0; transform: translate(-50%, -50%); transform-origin: center center;">
        <div class="annotation-scale-wrapper" style="transform-origin: center center; display: flex; align-items: center; justify-content: center;">
          <div class="custom-marker-flat" style="--marker-bg: ${ann.color}; background-color: ${ann.color}; color: ${contrastColor};">
            ${(ann.radius || 0).toFixed(2)} km
          </div>
        </div>
      </div>
    `;
    labelEl.style.cursor = 'pointer';
    labelEl.addEventListener('click', (e) => {
      e.stopPropagation();
      if (ctx.activeTool !== 'none' && ctx.isToolbarOpen) {
        ctx.setSelectedAnnotationId(ann.id);
      }
    });
    labelEl.addEventListener('dblclick', async (e) => {
      e.stopPropagation();
      if (ctx.activeTool !== 'none') {
        const currentRadius = ann.radius?.toFixed(2) || '';
        const newRadiusStr = await customPrompt(ctx.t('Enter new radius in km:'), currentRadius);
        if (newRadiusStr !== null) {
          const newRadius = parseFloat(newRadiusStr);
          if (!isNaN(newRadius) && newRadius > 0) {
            const circlePoly = createCirclePolygon(center, newRadius);
            if (circlePoly) {
              ctx.setAnnotations(prev => prev.map(a => 
                a.id === ann.id ? { ...a, radius: newRadius, coordinates: circlePoly.geometry.coordinates } : a
              ));
            }
          }
        }
      }
    });
    labelEl.addEventListener('mousedown', (e) => e.stopPropagation());
    if (ann.id === ctx.selectedAnnotationId) {
      labelEl.style.filter = 'drop-shadow(0 0 6px rgba(255,255,255,1)) drop-shadow(0 0 12px rgba(255,255,255,0.8))';
      labelEl.style.zIndex = '1000';
      labelEl.style.outline = '2px dashed #ffffff';
      labelEl.style.outlineOffset = '2px';
    }
    result.set(`${ann.id}-circle-radius`, { lngLat: edge, el: labelEl });
  } catch (e) {
    console.error('Error generating circle markers', e);
  }
  return result;
};

export const createIconMarker = (ann: Annotation, ctx: MarkerFactoryContext): Map<string, ExpectedMarkerData> => {
  const result = new Map<string, ExpectedMarkerData>();
  if (!ann.coordinates) return result;

  const allIcons = ctx.settings.icons?.flatMap(cat => cat.icons) || [];
  const iconObj = allIcons.find(i => i.id === ann.iconId);
  if (iconObj) {
    const hasLink = !!ann.mediaUrl || !!ann.linkUrl;
    const el = document.createElement('div');
    el.className = 'label-marker-icon';
    el.style.width = '0px';
    el.style.height = '0px';
    el.style.position = 'relative';
    el.innerHTML = `
      <div style="position: absolute; left: 0; top: 0; transform: translate(-50%, -50%); transform-origin: center center;">
        <div class="annotation-scale-wrapper" style="transform-origin: center center; display: flex; align-items: center; justify-content: center;">
          <div class="icon-marker w-16 h-16 flex items-center justify-center p-2 icon-svg-wrapper rounded-full" style="--marker-bg: ${ann.color || '#ffffff'}; background-color: ${ann.color || '#ffffff'}; color: ${getContrastYIQ(ann.color || '#ffffff')}; ${hasLink ? `outline: 3px solid ${ann.color || '#ffffff'}; outline-offset: 6px;` : ''}">
            ${iconObj.svg}
          </div>
        </div>
      </div>
    `;
    el.style.cursor = 'pointer';
    
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      if (ctx.activeTool !== 'none' && ctx.isToolbarOpen) {
        ctx.setSelectedAnnotationId(ann.id);
      } else if (ctx.onViewMedia && (ann.mediaUrl || ann.linkUrl)) {
        ctx.onViewMedia(ann);
      }
    });

    el.addEventListener('dblclick', async (e) => {
      e.stopPropagation();
      if (ctx.onEditIcon) {
        ctx.onEditIcon(ann);
      }
    });

    if (ann.id === ctx.selectedAnnotationId) {
      el.style.filter = 'drop-shadow(0 0 6px rgba(255,255,255,1)) drop-shadow(0 0 12px rgba(255,255,255,0.8))';
      el.style.zIndex = '1000';
      el.style.outline = '2px dashed #ffffff';
      el.style.outlineOffset = '2px';
    }
    const isSelected = ann.id === ctx.selectedAnnotationId;
    result.set(ann.id, {
      lngLat: ann.coordinates,
      el,
      draggable: isSelected && ctx.activeTool !== 'none',
      onDragEnd: (lngLat) => {
        ctx.setAnnotations(prev => prev.map(a => a.id === ann.id ? { ...a, coordinates: lngLat } : a));
      }
    });
  }
  return result;
};
