import { useEffect } from 'react';
import maplibregl from 'maplibre-gl';
import type { Annotation, AppSettings, ToolType } from '../../types';
import { animateLineDraw, animateArrow, animateCircle, animateMarkers } from './animationUtils';

interface UseAnnotationAnimationsProps {
  map: maplibregl.Map | null;
  mapLoaded: boolean;
  mapStyleLoaded: boolean;
  mapStyleTick: number;
  annotations: Annotation[];
  activeTool: ToolType;
  settings: AppSettings;
  revealedTriggers: Set<string>;
  hiddenTriggers: Set<string>;
  triggerProgressRef: React.MutableRefObject<Record<string, number>>;
  triggerTimestampsRef: React.MutableRefObject<Record<string, number>>;
  animationTick: number;
  setAnimationTick: React.Dispatch<React.SetStateAction<number>>;
  selectedAnnotationId: string | null;
  baseFeaturesRef: React.MutableRefObject<GeoJSON.Feature[]>;
  activeFeaturesRef: React.MutableRefObject<GeoJSON.Feature[]>;
  cachedTurfDataRef: React.MutableRefObject<{ [id: string]: any }>;
  markersRef: React.MutableRefObject<{ [id: string]: maplibregl.Marker }>;
}

export const useAnnotationAnimations = ({
  map,
  mapLoaded,
  mapStyleLoaded,
  mapStyleTick,
  annotations,
  activeTool,
  settings,
  revealedTriggers,
  hiddenTriggers,
  triggerProgressRef,
  triggerTimestampsRef,
  animationTick,
  setAnimationTick,
  selectedAnnotationId,
  baseFeaturesRef,
  activeFeaturesRef,
  cachedTurfDataRef,
  markersRef
}: UseAnnotationAnimationsProps) => {
  useEffect(() => {
    if (!map || !mapLoaded) return;
    
    let frameId: number;

    const duration = settings.animationDuration ?? 2000;
    const labelDuration = settings.labelAnimationDuration ?? 1000;
    const maxDuration = Math.max(duration, labelDuration);

    const overrideVisible = activeTool !== 'none';
    const activeTriggers = overrideVisible ? [] : Array.from(revealedTriggers).filter(t => (triggerProgressRef.current[t] ?? 0) < 1);
    const activeHiddenTriggers = overrideVisible ? [] : Array.from(hiddenTriggers).filter(t => (triggerProgressRef.current[t] ?? 0) < 1);
    const allActiveTriggers = [...activeTriggers, ...activeHiddenTriggers];
    
    const triggerExists = (id: string | undefined) => id ? annotations.some(a => a.id === id) : false;
    
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
          isRevealed = true; 
        }
      }

      if (mapStyleLoaded) {
        map.setFeatureState(
          { source: 'custom-annotations', id: ann.id },
          { hidden: !isRevealed }
        );
      }

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
        // Debug removed
        
        if (overrideVisible) {
          isRevealed = true;
          annProgress = 1;
          labelAnnProgress = 1;
        } else if (!hasTriggers) {
          isRevealed = true;
          annProgress = 1;
          labelAnnProgress = 1;
        } else {
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
        
        const featureIndices = currentFeatures.map((f: any, i: number) => (f.id === ann.id || f.properties?.id === ann.id) ? i : -1).filter((i: number) => i !== -1);
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
        
        if ((ann.type === 'paint' || ann.type === 'measure' || ann.type === 'route') && ann.coordinates) {
          animateLineDraw(ann, currentFeatures, baseFeaturesRef.current, cachedTurfDataRef.current, annProgress);
        }

        if (ann.type === 'arrow' && ann.coordinates && ann.coordinates.length === 2) {
           animateArrow(ann, currentFeatures, annProgress);
        }
        
        if (ann.type === 'circle' && ann.radius && ann.coordinates) {
           animateCircle(ann, currentFeatures, cachedTurfDataRef.current, annProgress);
        }
        
        const isAnimatingReveal = hasRevealTrigger && activeTriggers.includes(ann.animationTriggerId!);
        const isAnimatingHide = hasHideTrigger && activeHiddenTriggers.includes(ann.hideAnimationTriggerId!);
        
        if (isAnimatingReveal || isAnimatingHide) {
           animateMarkers(ann, markersRef, currentFeatures, annProgress, labelAnnProgress, isRevealed);
        }
      });
      
      const source = map?.getSource('custom-annotations') as maplibregl.GeoJSONSource;
      if (source) {
          const validFeatures = currentFeatures.filter((f: any) => !f.properties?.hidden).map((f: any) => {
            const copy = { ...f, properties: { ...f.properties } };
            delete copy.properties.hidden;
            return copy;
          });
          
          // Debug removed
          source.setData({ type: 'FeatureCollection', features: validFeatures });

          const lineSource = map.getSource('custom-lines-source') as maplibregl.GeoJSONSource;
          if (lineSource) {
            const lineFeatures: any[] = [];
            validFeatures.forEach((f: any) => {
              if (f.geometry.type === 'LineString' || f.geometry.type === 'MultiLineString') {
                lineFeatures.push(f);
              } else if (f.geometry.type === 'Polygon') {
                f.geometry.coordinates.forEach((ring: any) => {
                  lineFeatures.push({
                    type: 'Feature',
                    geometry: { type: 'LineString', coordinates: ring },
                    properties: { ...f.properties, id: f.properties.id }
                  });
                });
              } else if (f.geometry.type === 'MultiPolygon') {
                f.geometry.coordinates.forEach((polygon: any) => {
                  polygon.forEach((ring: any) => {
                    lineFeatures.push({
                      type: 'Feature',
                      geometry: { type: 'LineString', coordinates: ring },
                      properties: { ...f.properties, id: f.properties.id }
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
        allActiveTriggers.forEach(t => {
          triggerProgressRef.current[t] = 1;
        });

        if (allActiveTriggers.length > 0) {
          setAnimationTick(prev => prev + 1);
        }
      }
    };
    
    if (allActiveTriggers.length > 0) {
      frameId = requestAnimationFrame(animate);
    } else {
      animate(performance.now());
    }
    
    return () => {
      if (frameId) cancelAnimationFrame(frameId);
    };
  }, [revealedTriggers, hiddenTriggers, annotations, mapLoaded, mapStyleLoaded, mapStyleTick, activeTool, animationTick, selectedAnnotationId, settings.icons, map, settings.animationDuration, settings.labelAnimationDuration, triggerProgressRef, triggerTimestampsRef, baseFeaturesRef, activeFeaturesRef, cachedTurfDataRef, markersRef, setAnimationTick]);

  useEffect(() => {
    if (!map || !map.getLayer('custom-selected-line')) return;
    if (mapStyleLoaded) {
      map.setFilter('custom-selected-line', ['==', ['get', 'id'], selectedAnnotationId || 'none']);
      if (map.getLayer('custom-selected-glow')) {
        map.setFilter('custom-selected-glow', ['==', ['get', 'id'], selectedAnnotationId || 'none']);
      }
    }
  }, [selectedAnnotationId, map, mapStyleLoaded]);
};
