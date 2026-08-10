import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import * as turf from '@turf/turf';
import type { Annotation } from '../types';
import { createCirclePolygon, calculateDistance, createArrowFeatures } from '../utils/mapUtils';
import { customPrompt } from '../utils/dialogService';
import { globalLabelManager } from '../labels/LabelMarkerManager';
import { getContrastYIQ } from '../components/MapboxMap';
import type { AppSettings, ToolType } from '../types';


export interface AnnotationsStreamProps {
  map: maplibregl.Map | null;
  mapLoaded: boolean;
  mapStyleLoaded: boolean;
  annotations: Annotation[];
  setAnnotations: React.Dispatch<React.SetStateAction<Annotation[]>>;
  selectedAnnotationId: string | null;
  setSelectedAnnotationId: React.Dispatch<React.SetStateAction<string | null>>;
  revealedTriggers: Set<string>;
  hiddenTriggers: Set<string>;
  triggerProgressRef: React.MutableRefObject<Record<string, number>>;
  triggerTimestampsRef: React.MutableRefObject<Record<string, number>>;
  markersRef: React.MutableRefObject<{ [id: string]: maplibregl.Marker }>;  animationTick: number;
  setAnimationTick: React.Dispatch<React.SetStateAction<number>>;
  activeTool: ToolType;
  settings: AppSettings;
  t: any;
  getBaseTemplate: (id?: string) => any;
  handleRouteWaypointDragEnd: (annId: string, wpIdx: number, newLngLat: [number, number]) => Promise<void>;
  onEditIcon?: (annotation: Annotation) => void;
  onViewMedia?: (annotation: Annotation) => void;
  setLabelPrompt: React.Dispatch<React.SetStateAction<{ lngLat: [number, number], initialText?: string, initialSecondary?: string, annotationId?: string } | null>>;
}

export const useAnnotationsStream = ({
  map,
  mapLoaded,
  mapStyleLoaded,
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
  setLabelPrompt
}: AnnotationsStreamProps) => {
  const baseFeaturesRef = useRef<GeoJSON.Feature[]>([]);
  const activeFeaturesRef = useRef<GeoJSON.Feature[]>([]);
  const cachedTurfDataRef = useRef<{ [id: string]: any }>({});
  const setAnnotationsRef = useRef(setAnnotations);

  useEffect(() => {
    setAnnotationsRef.current = setAnnotations;
  }, [setAnnotations]);

  // Update mapbox features when annotations change
  useEffect(() => {
    if (!map || !mapLoaded || !mapStyleLoaded) return;
    const source = map.getSource('custom-annotations') as maplibregl.GeoJSONSource;
    if (!source) return;
    cachedTurfDataRef.current = {};
    const features: GeoJSON.Feature[] = annotations.reduce((acc: GeoJSON.Feature[], ann) => {
      if (ann.type === 'paint') {
        acc.push({
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: ann.coordinates },
          properties: { color: ann.color, id: ann.id, type: ann.type, strokeType: ann.strokeType || 'solid' }
        });
      } else if (ann.type === 'measure') {
        const dist = calculateDistance(ann.coordinates);
        acc.push({
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: ann.coordinates },
          properties: { color: ann.color, id: ann.id, type: ann.type, textLabel: `${dist.toFixed(2)} km`, strokeType: ann.strokeType || 'solid' }
        });
      } else if (ann.type === 'circle') {
        acc.push({
          type: 'Feature',
          geometry: { type: 'Polygon', coordinates: ann.coordinates },
          properties: { color: ann.color, id: ann.id, type: ann.type, textLabel: `${ann.radius?.toFixed(2)} km`, strokeType: ann.strokeType || 'solid', fillOpacity: ann.fillOpacity ?? 0.5 }
        });
      } else if (ann.type === 'polygon') {
        acc.push({
          type: 'Feature',
          geometry: { type: 'Polygon', coordinates: ann.coordinates },
          properties: { color: ann.color, id: ann.id, type: ann.type, strokeType: ann.strokeType || 'solid', fillOpacity: ann.fillOpacity ?? 0.5 }
        });
      } else if (ann.type === 'arrow' && ann.coordinates && ann.coordinates.length === 2) {
        const arrowFeats = createArrowFeatures(ann.coordinates[0], ann.coordinates[1], ann.color || '#ffffff', ann.id);
        if (arrowFeats) {
          arrowFeats.shaft.properties!.strokeType = ann.strokeType || 'solid';
          arrowFeats.head.properties!.strokeType = 'solid';
          arrowFeats.shaft.properties!.type = 'arrow';
          arrowFeats.head.properties!.type = 'arrow';
          acc.push(arrowFeats.shaft, arrowFeats.head);
        }
      } else if (ann.type === 'highlight' && ann.polygonGeometry) {
        if (ann.polygonGeometry.type === 'Polygon' || ann.polygonGeometry.type === 'MultiPolygon') {
          acc.push({
            type: 'Feature',
            geometry: ann.polygonGeometry,
            properties: { color: ann.color, id: ann.id, type: 'polygon', strokeType: ann.strokeType || 'solid', fillOpacity: ann.fillOpacity ?? 0.5 }
          });
        }
      } else if (ann.type === 'route' && ann.routeGeometry) {
        acc.push({
          type: 'Feature',
          geometry: ann.routeGeometry,
          properties: { color: ann.color, id: ann.id, type: ann.type, strokeType: ann.strokeType || 'solid' }
        });
      }

      // Add invisible collision box to hide underlying mapbox labels
      if (ann.type === 'highlight' && ann.text && ann.coordinates) {
        acc.push({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: ann.coordinates },
          properties: {
            id: `${ann.id}-collision`,
            type: 'invisible-collision-box',
            text: ann.text
          }
        });
      }
      
      // --- Add WebGL Point Features for DOM Annotations (for video export) ---
      // Removed in favor of 2D Canvas Compositor

      return acc;
    }, []).map(f => {
      const targetId = f.id ?? (f.properties ? f.properties.id : undefined);
      if (targetId && f.properties) {
        f.properties.featureId = targetId;
        f.id = targetId;
      }
      return f;
    });

    // Register SVG icons and labels for video export
    // Removed in favor of 2D Canvas Compositor
    baseFeaturesRef.current = features;
    activeFeaturesRef.current = JSON.parse(JSON.stringify(features));



    // Handle DOM markers for labels, measures, and circles
    const expectedMarkers = new Map<string, { lngLat: [number, number], el: HTMLElement, draggable?: boolean, onDragEnd?: (lngLat: [number, number]) => void }>();

    annotations.forEach(ann => {
      if (ann.type === 'label' && ann.coordinates) {
        const onClick = () => {
          if (activeTool !== 'none') {
            setSelectedAnnotationId(ann.id);
          }
          window.dispatchEvent(new CustomEvent('flyToLabel', { detail: ann.id }));
        };
        
        let el: HTMLElement;
        const contrastColor = getContrastYIQ(ann.color || '#ffffff');
        
        if (ann.template) {
          try {
            const baseTemplateName = getBaseTemplate(ann.template) || '';
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
            el = document.createElement('div'); // fallback
          }
        } else {
          el = document.createElement('div');
          el.className = 'custom-marker';
          el.innerHTML = `
            <div class="annotation-scale-wrapper" style="display: flex; flex-direction: column; align-items: center; transform-origin: bottom center;">
              <div class="custom-marker-plate" style="background-color: ${ann.color}; border-color: ${ann.color === '#000000' || ann.color === '#000' ? 'rgba(255,255,255,0.1)' : ann.color}">
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

        // Add double click listener to edit text in annotation mode (opens same modal as creation)
        el.addEventListener('dblclick', (e) => {
          e.stopPropagation();
          if (activeTool !== 'none') {
            setLabelPrompt({
              lngLat: ann.coordinates,
              initialText: ann.text || '',
              initialSecondary: ann.secondaryText || '',
              annotationId: ann.id
            });
          }
        });

        if (ann.id === selectedAnnotationId) {
          el.style.filter = 'drop-shadow(0 0 6px rgba(255,255,255,1)) drop-shadow(0 0 12px rgba(255,255,255,0.8))';
          el.style.zIndex = '1000';
          const content = el.querySelector('.custom-marker-plate') || el.querySelector('.backplate.primary');
          if (content) {
            (content as HTMLElement).style.outline = '2px dashed #ffffff';
            (content as HTMLElement).style.outlineOffset = '2px';
          }
        }
        const isSelected = ann.id === selectedAnnotationId;
        expectedMarkers.set(ann.id, {
          lngLat: ann.coordinates,
          el,
          draggable: isSelected && activeTool !== 'none',
          onDragEnd: (lngLat) => {
            setAnnotations(prev => prev.map(a => a.id === ann.id ? { ...a, coordinates: lngLat } : a));
          }
        });
      } else if (ann.type === 'highlight') {
        const onClick = () => {
          if (activeTool !== 'none') {
            setSelectedAnnotationId(ann.id);
          } else {
            window.dispatchEvent(new CustomEvent('flyToLabel', { detail: ann.id }));
          }
        };

        let el: HTMLElement;
        const contrastColor = getContrastYIQ(ann.color || '#000000');
        
        if (ann.template && !ann.polygonGeometry) {
          try {
            const baseTemplateName = getBaseTemplate(ann.template) || '';
            const handle = globalLabelManager.createLabel({
              id: ann.id,
              lngLat: ann.coordinates,
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
            el = document.createElement('div'); // fallback
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
                  <div class="custom-country-plate" style="background-color: ${ann.color};">
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
                  <div class="custom-highlight-marker" style="background-color: ${ann.color};">
                    <div class="custom-highlight-plate" style="background-color: ${ann.color};">
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

        // Add double click listener to edit text in annotation mode
        el.addEventListener('dblclick', async (e) => {
          e.stopPropagation();
          if (activeTool !== 'none') {
            const newText = await customPrompt(t('Enter new text:'), ann.text || '');
            if (newText !== null && setAnnotationsRef.current) {
              setAnnotationsRef.current(prev => prev.map(a => a.id === ann.id ? { ...a, text: newText } : a));
            }
          }
        });

        if (ann.id === selectedAnnotationId) {
          el.style.filter = 'drop-shadow(0 0 6px rgba(255,255,255,1)) drop-shadow(0 0 12px rgba(255,255,255,0.8))';
          el.style.zIndex = '1000';
          const content = el.querySelector('.custom-highlight-plate') || el.querySelector('.backplate.primary') || el;
          if (content) {
            (content as HTMLElement).style.outline = '2px dashed #ffffff';
            (content as HTMLElement).style.outlineOffset = '2px';
          }
        }
        
        // Use either centroid or the primary coordinates for marker placement
        const markerLngLat = ann.polygonGeometry && ann.polygonGeometry.type === 'Polygon' ? turf.centerOfMass(ann.polygonGeometry).geometry.coordinates as [number, number] : ann.coordinates;
        if (markerLngLat) {
          expectedMarkers.set(ann.id, { lngLat: markerLngLat, el });
        }
      } else if (ann.type === 'measure' && ann.coordinates) {
        let totalDistance = 0;
        const contrastColor = getContrastYIQ(ann.color || '#ffffff');
        ann.coordinates.forEach((coord: [number, number], i: number) => {
          if (i > 0) {
            totalDistance += turf.distance(ann.coordinates[i-1], coord, { units: 'kilometers' });
          }
          const el = document.createElement('div');
          el.className = 'label-marker-measure-point';
          el.style.width = '0px';
          el.style.height = '0px';
          el.style.position = 'relative';
          el.innerHTML = `
            <div style="position: absolute; left: 0; top: 0; transform: translate(-50%, -50%); transform-origin: center center;">
              <div class="annotation-scale-wrapper" style="transform-origin: center center; display: flex; align-items: center; justify-content: center;">
                <div class="custom-marker-flat" style="background-color: ${ann.color}; color: ${contrastColor};">
                  ${totalDistance.toFixed(2)} km
                </div>
              </div>
            </div>
          `;
          el.style.cursor = 'pointer';
          el.addEventListener('click', (e) => {
            e.stopPropagation();
            if (activeTool !== 'none') {
              setSelectedAnnotationId(ann.id);
            }
          });

          if (ann.id === selectedAnnotationId) {
            el.style.filter = 'drop-shadow(0 0 6px rgba(255,255,255,1)) drop-shadow(0 0 12px rgba(255,255,255,0.8))';
            el.style.zIndex = '1000';
            el.style.outline = '2px dashed #ffffff';
            el.style.outlineOffset = '2px';
          }
          expectedMarkers.set(`${ann.id}-measure-${i}`, { lngLat: coord, el });
        });
      } else if (ann.type === 'route' && ann.coordinates && ann.routeLegs) {
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
                  <div class="${innerClass}" style="background-color: ${ann.color}; color: ${contrastColor};">
                    ${innerHtml}
                  </div>
                </div>
              </div>
          `;
          
          el.style.cursor = 'pointer';
          el.addEventListener('click', (e) => {
            e.stopPropagation();
            if (activeTool !== 'none') {
              setSelectedAnnotationId(ann.id);
            }
          });

          if (ann.id === selectedAnnotationId) {
            el.style.filter = 'drop-shadow(0 0 6px rgba(255,255,255,1)) drop-shadow(0 0 12px rgba(255,255,255,0.8))';
            el.style.zIndex = '1000';
            el.style.outline = '2px dashed #ffffff';
            el.style.outlineOffset = '2px';
          }
          expectedMarkers.set(`${ann.id}-route-${i}`, { 
            lngLat: coord, 
            el,
            draggable: true,
            onDragEnd: (newLngLat: [number, number]) => handleRouteWaypointDragEnd(ann.id, i, newLngLat)
          });
        });
      } else if (ann.type === 'circle' && ann.coordinates?.[0]?.length > 0) {
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
                <div class="custom-marker-dot" style="background-color: ${ann.color};"></div>
              </div>
            </div>
          `;
          centerEl.style.cursor = 'pointer';
          centerEl.addEventListener('click', (e) => {
            e.stopPropagation();
            if (activeTool !== 'none') {
              setSelectedAnnotationId(ann.id);
            }
          });
          if (ann.id === selectedAnnotationId) {
            centerEl.style.filter = 'drop-shadow(0 0 6px rgba(255,255,255,1)) drop-shadow(0 0 12px rgba(255,255,255,0.8))';
            centerEl.style.zIndex = '1000';
            centerEl.style.outline = '2px dashed #ffffff';
            centerEl.style.outlineOffset = '2px';
          }
          expectedMarkers.set(`${ann.id}-circle-center`, {
            lngLat: center,
            el: centerEl,
            draggable: ann.id === selectedAnnotationId && activeTool !== 'none',
            onDragEnd: (newLngLat) => {
              if (setAnnotationsRef.current) {
                const circlePoly = createCirclePolygon(newLngLat, ann.radius || 0);
                if (circlePoly) {
                  setAnnotationsRef.current(prev => prev.map(a => 
                    a.id === ann.id ? { ...a, coordinates: circlePoly.geometry.coordinates } : a
                  ));
                }
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
                <div class="custom-marker-flat" style="background-color: ${ann.color}; color: ${contrastColor};">
                  ${(ann.radius || 0).toFixed(2)} km
                </div>
              </div>
            </div>
          `;
          labelEl.style.cursor = 'pointer';
          labelEl.addEventListener('click', (e) => {
            e.stopPropagation();
            if (activeTool !== 'none') {
              setSelectedAnnotationId(ann.id);
            }
          });
          labelEl.addEventListener('dblclick', async (e) => {
            e.stopPropagation();
            if (activeTool !== 'none') {
              const currentRadius = ann.radius?.toFixed(2) || '';
              const newRadiusStr = await customPrompt(t('Enter new radius in km:'), currentRadius);
              if (newRadiusStr !== null) {
                const newRadius = parseFloat(newRadiusStr);
                if (!isNaN(newRadius) && newRadius > 0 && setAnnotationsRef.current) {
                  const circlePoly = createCirclePolygon(center, newRadius);
                  if (circlePoly) {
                    setAnnotationsRef.current(prev => prev.map(a => 
                      a.id === ann.id ? { ...a, radius: newRadius, coordinates: circlePoly.geometry.coordinates } : a
                    ));
                  }
                }
              }
            }
          });
          labelEl.addEventListener('mousedown', (e) => e.stopPropagation());
          if (ann.id === selectedAnnotationId) {
            labelEl.style.filter = 'drop-shadow(0 0 6px rgba(255,255,255,1)) drop-shadow(0 0 12px rgba(255,255,255,0.8))';
            labelEl.style.zIndex = '1000';
            labelEl.style.outline = '2px dashed #ffffff';
            labelEl.style.outlineOffset = '2px';
          }
          expectedMarkers.set(`${ann.id}-circle-radius`, { lngLat: edge, el: labelEl });
        } catch (e) {
          console.error('Error generating circle markers', e);
        }
      } else if (ann.type === 'icon' && ann.coordinates) {
        const allIcons = settings.icons?.flatMap(cat => cat.icons) || [];
        const iconObj = allIcons.find(i => i.id === ann.iconId);
        if (iconObj) {
          const isCircular = !!ann.mediaUrl || !!ann.linkUrl;
          const el = document.createElement('div');
          el.className = 'label-marker-icon';
          el.style.width = '0px';
          el.style.height = '0px';
          el.style.position = 'relative';
          el.innerHTML = `
            <div style="position: absolute; left: 0; top: 0; transform: translate(-50%, -50%); transform-origin: center center;">
              <div class="annotation-scale-wrapper" style="transform-origin: center center; display: flex; align-items: center; justify-content: center;">
                <div class="icon-marker w-16 h-16 flex items-center justify-center p-2 icon-svg-wrapper ${isCircular ? 'rounded-full' : ''}" style="background-color: ${ann.color || '#ffffff'}; color: ${getContrastYIQ(ann.color || '#ffffff')};">
                  ${iconObj.svg}
                </div>
              </div>
            </div>
          `;
          el.style.cursor = 'pointer';
          
          el.addEventListener('click', (e) => {
            e.stopPropagation();
            if (activeTool !== 'none') {
              setSelectedAnnotationId(ann.id);
            } else if (onViewMedia && (ann.mediaUrl || ann.linkUrl)) {
              onViewMedia(ann);
            }
          });

          el.addEventListener('dblclick', async (e) => {
            e.stopPropagation();
            if (onEditIcon) {
              onEditIcon(ann);
            }
          });

          
          if (ann.id === selectedAnnotationId) {
            el.style.filter = 'drop-shadow(0 0 6px rgba(255,255,255,1)) drop-shadow(0 0 12px rgba(255,255,255,0.8))';
            el.style.zIndex = '1000';
            el.style.outline = '2px dashed #ffffff';
            el.style.outlineOffset = '2px';
          }
          const isSelected = ann.id === selectedAnnotationId;
          expectedMarkers.set(ann.id, {
            lngLat: ann.coordinates,
            el,
            draggable: isSelected && activeTool !== 'none',
            onDragEnd: (lngLat) => {
              setAnnotations(prev => prev.map(a => a.id === ann.id ? { ...a, coordinates: lngLat } : a));
            }
          });
        }
      }
    });

    // Always replace markers to ensure fresh event listeners and closures
    Object.keys(markersRef.current).forEach(id => {
      markersRef.current[id].remove();
      delete markersRef.current[id];
    });

    expectedMarkers.forEach((data, id) => {
      let anchor: any = 'center';
      let offset: [number, number] = [0, 0];
      
      if (data.el.dataset.anchorX && data.el.dataset.anchorY) {
        anchor = 'top-left';
        offset = [-parseFloat(data.el.dataset.anchorX), -parseFloat(data.el.dataset.anchorY)];
      } else if (data.el.classList.contains('custom-marker')) {
        anchor = 'bottom';
      }

      const marker = new maplibregl.Marker({ element: data.el, anchor, offset })
        .setLngLat(data.lngLat)
        .addTo(map!);
      
      if (data.draggable) {
        marker.setDraggable(true);
        if (data.onDragEnd) {
          marker.on('dragend', () => {
            const lngLat = marker.getLngLat();
            data.onDragEnd!([lngLat.lng, lngLat.lat]);
          });
        }
      }
      markersRef.current[id] = marker;
    });
  }, [annotations, activeTool, mapLoaded, selectedAnnotationId, settings.icons]);

  // Animation Loop for Reveals
  useEffect(() => {
    if (!map || !mapLoaded) return;
    
    let frameId: number;

    const duration = settings.animationDuration ?? 2000;
    const labelDuration = settings.labelAnimationDuration ?? 1000;
    const maxDuration = Math.max(duration, labelDuration);

    // Find triggers that need animation
    const overrideVisible = activeTool !== 'none';
    const activeTriggers = overrideVisible ? [] : Array.from(revealedTriggers).filter(t => (triggerProgressRef.current[t] ?? 0) < 1);
    const activeHiddenTriggers = overrideVisible ? [] : Array.from(hiddenTriggers).filter(t => (triggerProgressRef.current[t] ?? 0) < 1);
    const allActiveTriggers = [...activeTriggers, ...activeHiddenTriggers];
    
    const triggerExists = (id: string | undefined) => id ? annotations.some(a => a.id === id) : false;
    
    // First, sync feature-state and static opacities
    annotations.forEach(ann => {
      const hasRevealTrigger = !!ann.animationTriggerId && triggerExists(ann.animationTriggerId);
      const hasHideTrigger = !!ann.hideAnimationTriggerId && triggerExists(ann.hideAnimationTriggerId);
      const hasTriggers = hasRevealTrigger || hasHideTrigger;
      
      const isRevealTriggered = hasRevealTrigger && revealedTriggers.has(ann.animationTriggerId!);
      const isHideTriggered = hasHideTrigger && hiddenTriggers.has(ann.hideAnimationTriggerId!);
      
      let isRevealed = false;
      if (overrideVisible) {
        isRevealed = true;
      } else if (!hasTriggers) {
        isRevealed = true;
      } else {
        const revealTime = hasRevealTrigger ? (triggerTimestampsRef.current[ann.animationTriggerId!] || 0) : -1;
        const hideTime = hasHideTrigger ? (triggerTimestampsRef.current[ann.hideAnimationTriggerId!] || 0) : -1;
        
        if (isHideTriggered && isRevealTriggered) {
          if (hideTime > revealTime) isRevealed = activeHiddenTriggers.includes(ann.hideAnimationTriggerId!);
          else isRevealed = true;
        } else if (isHideTriggered) {
          isRevealed = activeHiddenTriggers.includes(ann.hideAnimationTriggerId!);
        } else if (isRevealTriggered) {
          isRevealed = true;
        } else if (hasHideTrigger && !hasRevealTrigger) {
          isRevealed = true; // start visible if only hide trigger exists
        }
      }

      // Feature-state for opacity fades
      map!.setFeatureState(
        { source: 'custom-annotations', id: ann.id },
        { hidden: !isRevealed }
      );

      // DOM Markers static opacity (only if NOT currently animating)
      const isActiveReveal = hasRevealTrigger && activeTriggers.includes(ann.animationTriggerId!);
      const isActiveHide = hasHideTrigger && activeHiddenTriggers.includes(ann.hideAnimationTriggerId!);
      
      if (!isActiveReveal && !isActiveHide) {
        const markerIds = [ann.id, `${ann.id}-circle-center`, `${ann.id}-circle-radius`];
        const noFadeIds: string[] = [];
        
        if (ann.type === 'measure' && ann.coordinates) ann.coordinates.forEach((_: any, i: number) => noFadeIds.push(`${ann.id}-measure-${i}`));
        if (ann.type === 'route' && ann.coordinates) ann.coordinates.forEach((_: any, i: number) => noFadeIds.push(`${ann.id}-route-${i}`));
        
        markerIds.forEach(id => {
          const marker = markersRef.current[id];
          if (marker) {
            const el = marker.getElement();
            if (ann.type === 'highlight' || ann.type === 'label') {
              el.style.transition = 'none';
              el.style.display = isRevealed ? 'block' : 'none';
              
              const isLabel = el.querySelector('.label-marker') !== null;
              const plateSel = isLabel ? '.backplate.primary' : '.custom-highlight-plate, .custom-country-plate';
              const textSel = isLabel ? '.text' : '.custom-highlight-text, .custom-country-text';
              
              const plate = el.querySelector(plateSel) as HTMLElement;
              const text = el.querySelector(textSel) as HTMLElement;
              const pointer = el.querySelector(isLabel ? '.pointer' : '.custom-marker-pointer') as HTMLElement;
              
              if (pointer) pointer.style.opacity = isRevealed ? '1' : '0';
              if (plate && text) {
                if (isRevealed) {
                   plate.style.clipPath = `inset(0 0% 0 0)`;
                   text.style.transform = `translateY(0%)`;
                } else {
                   if (isLabel) plate.style.clipPath = `inset(100% 0 0 0)`;
                   else plate.style.clipPath = `inset(0 100% 0 0)`;
                   text.style.transform = `translateY(100%)`;
                }
              }
            } else {
              el.style.transition = 'none';
            }
            el.style.opacity = isRevealed ? '1' : '0';
            el.style.display = isRevealed ? 'flex' : 'none';

            el.style.pointerEvents = isRevealed ? 'auto' : 'none';
          }
        });
        
        noFadeIds.forEach(id => {
          const marker = markersRef.current[id];
          if (marker) {
            const el = marker.getElement();
            el.style.transition = 'none';
            el.style.opacity = isRevealed ? '1' : '0';
            el.style.display = isRevealed ? 'flex' : 'none';
            el.style.pointerEvents = isRevealed ? 'auto' : 'none';
          }
        });
      }
    });

    let startTime: number;
    const animate = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const elapsed = timestamp - startTime;
      
      const progress = Math.min(1, elapsed / duration);
      const labelProgress = Math.min(1, elapsed / labelDuration);
      const loopProgress = Math.min(1, elapsed / maxDuration);
      
      allActiveTriggers.forEach(t => {
        triggerProgressRef.current[t] = loopProgress;
      });
      
      // Use the persistent activeFeatures array to avoid GC allocations
      const currentFeatures = activeFeaturesRef.current;
      
      annotations.forEach(ann => {
        const hasRevealTrigger = !!ann.animationTriggerId && triggerExists(ann.animationTriggerId);
        const hasHideTrigger = !!ann.hideAnimationTriggerId && triggerExists(ann.hideAnimationTriggerId);
        const hasTriggers = hasRevealTrigger || hasHideTrigger;
        
        const isRevealTriggered = hasRevealTrigger && revealedTriggers.has(ann.animationTriggerId!);
        const isHideTriggered = hasHideTrigger && hiddenTriggers.has(ann.hideAnimationTriggerId!);
        const revealTime = hasRevealTrigger ? (triggerTimestampsRef.current[ann.animationTriggerId!] || 0) : -1;
        const hideTime = hasHideTrigger ? (triggerTimestampsRef.current[ann.hideAnimationTriggerId!] || 0) : -1;
        
        let isRevealed = false;
        let annProgress = 0;
        let labelAnnProgress = 0;
        
        if (overrideVisible) {
          isRevealed = true;
          annProgress = 1;
          labelAnnProgress = 1;
        } else if (!hasTriggers) {
          isRevealed = true;
          annProgress = 1;
          labelAnnProgress = 1;
        } else {
          // If both triggered, the most recent wins
          if (isHideTriggered && isRevealTriggered) {
             if (hideTime > revealTime) {
                isRevealed = true;
                if (activeHiddenTriggers.includes(ann.hideAnimationTriggerId!)) {
                   annProgress = Math.max(0, 1 - progress);
                   labelAnnProgress = Math.max(0, 1 - labelProgress);
                } else {
                   annProgress = 0;
                   labelAnnProgress = 0;
                   isRevealed = false;
                }
             } else {
                isRevealed = true;
                if (activeTriggers.includes(ann.animationTriggerId!)) {
                    annProgress = progress;
                    labelAnnProgress = labelProgress;
                } else {
                   annProgress = 1;
                   labelAnnProgress = 1;
                }
             }
          } else if (isHideTriggered) {
             if (hasRevealTrigger && !isRevealTriggered) {
               isRevealed = false;
               annProgress = 0;
               labelAnnProgress = 0;
             } else {
               isRevealed = true;
               if (activeHiddenTriggers.includes(ann.hideAnimationTriggerId!)) {
                  annProgress = Math.max(0, 1 - progress);
                  labelAnnProgress = Math.max(0, 1 - labelProgress);
               } else {
                  annProgress = 0;
                  labelAnnProgress = 0;
                  isRevealed = false;
               }
             }
          } else if (isRevealTriggered) {
             isRevealed = true;
             if (activeTriggers.includes(ann.animationTriggerId!)) {
                annProgress = progress;
                labelAnnProgress = labelProgress;
             } else {
                annProgress = 1;
                labelAnnProgress = 1;
             }
          } else {
             if (hasRevealTrigger) {
               isRevealed = false;
               annProgress = 0;
               labelAnnProgress = 0;
             } else if (hasHideTrigger) {
               isRevealed = true;
               annProgress = 1;
               labelAnnProgress = 1;
             } else {
               isRevealed = true;
               annProgress = 1;
               labelAnnProgress = 1;
             }
          }
        }
        
        // Apply hidden property to all features of this annotation
        const featureIndices = currentFeatures.map((f: any, i: number) => (f.id === ann.id || f.properties?.id === ann.id || f.properties?.featureId === ann.id) ? i : -1).filter((i: number) => i !== -1);
        featureIndices.forEach((idx: number) => {
           currentFeatures[idx].properties!.hidden = !isRevealed;
           
           if (ann.type === 'polygon' || ann.type === 'highlight' || ann.type === 'circle') {
             const targetFillOpacity = currentFeatures[idx].properties!.fillOpacity ?? 0.5;
             currentFeatures[idx].properties!.currentOpacity = targetFillOpacity * annProgress;
             currentFeatures[idx].properties!.currentLineOpacity = annProgress;
           } else {
             currentFeatures[idx].properties!.currentLineOpacity = 1;
           }
        });
        
        // Write-on logic
        if ((ann.type === 'paint' || ann.type === 'measure' || ann.type === 'route') && ann.coordinates) {
          featureIndices.forEach((idx: number) => {
             const f = currentFeatures[idx];
             const baseF = baseFeaturesRef.current[idx];
             if (f.geometry.type === 'LineString' && baseF.geometry.type === 'LineString') {
               if (annProgress === 0) {
                 f.geometry.coordinates = [];
               } else if (annProgress < 1) {
                 const baseCoords = baseF.geometry.coordinates;
                 if (baseCoords.length >= 2) {
                   if (!cachedTurfDataRef.current[`${f.id}-line`]) {
                     const line = turf.lineString(baseCoords as any);
                     cachedTurfDataRef.current[`${f.id}-line`] = {
                       line,
                       dist: turf.length(line, { units: 'kilometers' })
                     };
                   }
                   const cache = cachedTurfDataRef.current[`${f.id}-line`];
                   const targetDist = cache.dist * annProgress;
                   if (targetDist > 0) {
                     const sliced = turf.lineSliceAlong(cache.line, 0, targetDist, { units: 'kilometers' });
                     f.geometry.coordinates = sliced.geometry.coordinates;
                   } else {
                     f.geometry.coordinates = [];
                   }
                 } else {
                   f.geometry.coordinates = [];
                 }
               } else {
                 f.geometry.coordinates = baseF.geometry.coordinates;
               }
             } else if (f.geometry.type === 'MultiLineString' && baseF.geometry.type === 'MultiLineString') {
               if (annProgress === 0) {
                 f.geometry.coordinates = [];
               } else if (annProgress < 1) {
                 const baseCoords = baseF.geometry.coordinates as [number, number][][];
                 const totalSegments = baseCoords.length;
                 const targetSegments = Math.max(1, Math.floor(totalSegments * annProgress));
                 f.geometry.coordinates = baseCoords.slice(0, targetSegments);
               } else {
                 f.geometry.coordinates = baseF.geometry.coordinates;
               }
             }
          });
        }

        // Arrow logic
        if (ann.type === 'arrow' && ann.coordinates && ann.coordinates.length === 2) {
           const p1 = ann.coordinates[0];
           const p2 = ann.coordinates[1];
           const shaftIdx = currentFeatures.findIndex((f: any) => f.properties?.featureId === ann.id && f.properties?._type === 'LineString');
           const headIdx = currentFeatures.findIndex((f: any) => f.properties?.featureId === ann.id && f.properties?._type === 'ArrowHead');
           
           if (annProgress === 0) {
             if (shaftIdx !== -1) (currentFeatures[shaftIdx].geometry as any).coordinates = [];
             if (headIdx !== -1) (currentFeatures[headIdx].geometry as any).coordinates = [];
           } else {
             const pCurr = [
               p1[0] + (p2[0] - p1[0]) * annProgress,
               p1[1] + (p2[1] - p1[1]) * annProgress
             ];
             const arrowFeats = createArrowFeatures(p1, pCurr as [number, number], ann.color || '#ffffff', ann.id);
             
             if (arrowFeats) {
               if (shaftIdx !== -1) currentFeatures[shaftIdx].geometry = arrowFeats.shaft.geometry;
               if (headIdx !== -1) {
                  currentFeatures[headIdx].geometry = arrowFeats.head.geometry;
                  currentFeatures[headIdx].properties!.bearing = arrowFeats.head.properties?.bearing;
               }
             }
           }
        }
        
        // Circle radial expansion
        if (ann.type === 'circle' && ann.radius && ann.coordinates) {
          const featureIdx = currentFeatures.findIndex((f: any) => f.id === ann.id || f.properties?.featureId === ann.id);
          if (featureIdx !== -1 && currentFeatures[featureIdx].geometry.type === 'Polygon') {
             if (annProgress === 0) {
               currentFeatures[featureIdx].geometry.coordinates = [];
             } else if (annProgress < 1) {
               if (!cachedTurfDataRef.current[`${ann.id}-full-poly`]) {
                 const center = turf.center(turf.polygon(ann.coordinates)).geometry.coordinates as [number, number];
                 cachedTurfDataRef.current[`${ann.id}-center`] = center;
                 cachedTurfDataRef.current[`${ann.id}-full-poly`] = createCirclePolygon(center, ann.radius);
               }
               const center = cachedTurfDataRef.current[`${ann.id}-center`];
               const fullPoly = cachedTurfDataRef.current[`${ann.id}-full-poly`];
               
               if (fullPoly && fullPoly.geometry.coordinates[0]) {
                 const scaledCoords = fullPoly.geometry.coordinates[0].map((coord: [number, number]) => [
                    center[0] + (coord[0] - center[0]) * annProgress,
                    center[1] + (coord[1] - center[1]) * annProgress
                 ]);
                 currentFeatures[featureIdx].geometry.coordinates = [scaledCoords];
               }
             } else {
               currentFeatures[featureIdx].geometry.coordinates = ann.coordinates;
             }
          }
        }
        
        // Update DOM Marker dynamic opacity during animation
        const isAnimatingReveal = hasRevealTrigger && activeTriggers.includes(ann.animationTriggerId!);
        const isAnimatingHide = hasHideTrigger && activeHiddenTriggers.includes(ann.hideAnimationTriggerId!);
        
        if (isAnimatingReveal || isAnimatingHide) {
          const markerIds = [ann.id];
          
          markerIds.forEach(id => {
            const marker = markersRef.current[id];
            if (marker) {
              const el = marker.getElement();
              let p = annProgress;
              if (ann.type === 'label' || ann.type === 'highlight' || ann.type === 'icon') {
                 p = labelAnnProgress;
              }
              
              if (ann.type === 'highlight' || ann.type === 'label') {
                el.style.transition = 'none';
                const isVisible = isRevealed && p > 0;
                
                el.style.opacity = isVisible ? '1' : '0';
                el.style.display = isVisible ? 'block' : 'none';
                el.style.pointerEvents = isVisible ? 'auto' : 'none';
                
                const isLabel = el.querySelector('.label-marker') !== null;
                const plateSel = isLabel ? '.backplate.primary' : '.custom-highlight-plate, .custom-country-plate';
                const textSel = isLabel ? '.text' : '.custom-highlight-text, .custom-country-text';
                
                const plate = el.querySelector(plateSel) as HTMLElement;
                const text = el.querySelector(textSel) as HTMLElement;
                const pointer = el.querySelector(isLabel ? '.pointer' : '.custom-marker-pointer') as HTMLElement;
                
                if (pointer) {
                   pointer.style.opacity = isVisible ? '1' : '0';
                }
                
                if (plate && text) {
                  if (p <= 0.5) {
                    const plateP = p * 2;
                    if (isLabel) {
                      plate.style.clipPath = `inset(${100 - plateP * 100}% 0 0 0)`;
                    } else {
                      plate.style.clipPath = `inset(0 ${100 - plateP * 100}% 0 0)`;
                    }
                    text.style.transform = `translateY(100%)`;
                  } else {
                    const textP = (p - 0.5) * 2;
                    plate.style.clipPath = `inset(0 0% 0 0)`;
                    text.style.transform = `translateY(${(1 - textP) * 100}%)`;
                  }
                }
              } else {
                el.style.transition = 'none';
                el.style.opacity = p.toString();
                el.style.display = p > 0 ? 'flex' : 'none';
                el.style.pointerEvents = p > 0.5 ? 'auto' : 'none';
              }
            }
          });
          
          if (ann.type === 'circle') {
            const centerMarker = markersRef.current[`${ann.id}-circle-center`];
            const radiusMarker = markersRef.current[`${ann.id}-circle-radius`];
            const isVisible = isRevealed && annProgress > 0;
            
            if (centerMarker) {
               centerMarker.getElement().style.transition = 'none';
               centerMarker.getElement().style.opacity = isVisible ? '1' : '0';
               centerMarker.getElement().style.display = isVisible ? 'flex' : 'none';
               centerMarker.getElement().style.pointerEvents = isVisible ? 'auto' : 'none';
            }
            if (radiusMarker) {
               radiusMarker.getElement().style.transition = 'none';
               radiusMarker.getElement().style.opacity = isVisible ? '1' : '0';
               radiusMarker.getElement().style.display = isVisible ? 'flex' : 'none';
               radiusMarker.getElement().style.pointerEvents = isVisible ? 'auto' : 'none';
               
               const featureIdx = currentFeatures.findIndex((f: any) => f.id === ann.id || f.properties?.featureId === ann.id);
               if (featureIdx !== -1 && currentFeatures[featureIdx].geometry.type === 'Polygon') {
                  const polyCoords = currentFeatures[featureIdx].geometry.coordinates;
                  if (polyCoords && polyCoords[0] && polyCoords[0][0]) {
                     radiusMarker.setLngLat(polyCoords[0][0] as [number, number]);
                  }
               }
            }
          }
          
          if (ann.type === 'measure' && ann.coordinates) {
             ann.coordinates.forEach((_: any, i: number) => {
               const marker = markersRef.current[`${ann.id}-measure-${i}`];
               if (marker) {
                  const threshold = ann.coordinates.length > 1 ? i / (ann.coordinates.length - 1) : 0;
                  const visible = isRevealed && annProgress > 0 && annProgress >= threshold;
                  marker.getElement().style.transition = 'none';
                  marker.getElement().style.opacity = visible ? '1' : '0';
                  marker.getElement().style.display = visible ? 'flex' : 'none';
                  marker.getElement().style.pointerEvents = visible ? 'auto' : 'none';
               }
             });
          }
          
          if (ann.type === 'route' && ann.coordinates) {
             ann.coordinates.forEach((_: any, i: number) => {
               const marker = markersRef.current[`${ann.id}-route-${i}`];
               if (marker) {
                  const threshold = ann.coordinates.length > 1 ? i / (ann.coordinates.length - 1) : 0;
                  const visible = isRevealed && annProgress > 0 && annProgress >= threshold;
                  marker.getElement().style.transition = 'none';
                  marker.getElement().style.opacity = visible ? '1' : '0';
                  marker.getElement().style.display = visible ? 'flex' : 'none';
                  marker.getElement().style.pointerEvents = visible ? 'auto' : 'none';
               }
             });
          }
        }
      });
      
      const source = map?.getSource('custom-annotations') as maplibregl.GeoJSONSource;
      if (source) {
          const validFeatures = currentFeatures.filter((f: any) => !f.properties?.hidden).map((f: any) => {
            const copy = { ...f, properties: { ...f.properties } };
            delete copy.properties.hidden;
            return copy;
          });
          
          source.setData({ type: 'FeatureCollection', features: validFeatures });

          // Extract pure LineString representations for the line source to avoid MapLibre v5 dropping mixed sources
          const lineSource = map.getSource('custom-lines-source') as maplibregl.GeoJSONSource;
          if (lineSource) {
            const lineFeatures: any[] = [];
            validFeatures.forEach((f: any) => {
              if (f.geometry.type === 'LineString' || f.geometry.type === 'MultiLineString') {
                lineFeatures.push(f);
              } else if (f.geometry.type === 'Polygon') {
                // MapLibre v5 line layers may require explicit LineStrings for polygons
                f.geometry.coordinates.forEach((ring: any, index: number) => {
                  lineFeatures.push({
                    type: 'Feature',
                    geometry: { type: 'LineString', coordinates: ring },
                    properties: { ...f.properties, id: `${f.properties.id}-ring-${index}` }
                  });
                });
              } else if (f.geometry.type === 'MultiPolygon') {
                f.geometry.coordinates.forEach((polygon: any, polyIdx: number) => {
                  polygon.forEach((ring: any, ringIdx: number) => {
                    lineFeatures.push({
                      type: 'Feature',
                      geometry: { type: 'LineString', coordinates: ring },
                      properties: { ...f.properties, id: `${f.properties.id}-poly-${polyIdx}-ring-${ringIdx}` }
                    });
                  });
                });
              }
            });
            lineSource.setData({ type: 'FeatureCollection', features: lineFeatures });
          }
      }

      if (progress < 1) {
        frameId = requestAnimationFrame(animate);
      } else {
        
        // Run one last time to ensure exact final positions if needed
        allActiveTriggers.forEach(t => {
          triggerProgressRef.current[t] = 1;
        });

        if (allActiveTriggers.length > 0) {
          setAnimationTick(prev => prev + 1);
        }
      }
    };
    
    // Start animation loop or run static evaluation
    if (allActiveTriggers.length > 0) {
      frameId = requestAnimationFrame(animate);
    } else {
      animate(performance.now());
    }
    
    return () => {
      if (frameId) cancelAnimationFrame(frameId);
    };
  }, [revealedTriggers, hiddenTriggers, annotations, mapLoaded, activeTool, animationTick, selectedAnnotationId, settings.icons]);

  // Update selected annotation filter
  useEffect(() => {
    if (!map || !map.getLayer('custom-selected-line')) return;
    map.setFilter('custom-selected-line', ['==', 'id', selectedAnnotationId || 'none']);
    if (map.getLayer('custom-selected-glow')) {
      map.setFilter('custom-selected-glow', ['==', 'id', selectedAnnotationId || 'none']);
    }
  }, [selectedAnnotationId]);
};
