import { useEffect } from 'react';
import type { Annotation } from '../../types';
import maplibregl from 'maplibre-gl';

export const useMapAnimationEvents = (
  mapRef: React.MutableRefObject<maplibregl.Map | null>,
  triggerProgressRef: React.MutableRefObject<Record<string, number>>,
  triggerTimestampsRef: React.MutableRefObject<Record<string, number>>,
  setRevealedTriggers: React.Dispatch<React.SetStateAction<Set<string>>>,
  setHiddenTriggers: React.Dispatch<React.SetStateAction<Set<string>>>
) => {
  useEffect(() => {
    const handleFlyTo = ((e: CustomEvent<{ viewId: string, view: Annotation['view'] }>) => {
      const { viewId, view } = e.detail;
      if (view && mapRef.current) {
        if (viewId === 'overview') {
          triggerProgressRef.current = {};
          triggerTimestampsRef.current = {};
          setRevealedTriggers(new Set());
          setHiddenTriggers(new Set());
        } else {
          triggerProgressRef.current[viewId] = 0;
          triggerTimestampsRef.current[viewId] = Date.now();
          setRevealedTriggers(prev => {
            const next = new Set(prev);
            next.add(viewId);
            return next;
          });
          setHiddenTriggers(prev => {
            const next = new Set(prev);
            next.add(viewId);
            return next;
          });
        }
        
        mapRef.current.flyTo({
          center: view.center,
          zoom: view.zoom,
          pitch: view.pitch,
          bearing: view.bearing,
          duration: 2000,
          essential: true
        });

        if (view.elevation !== undefined) {
          mapRef.current.once('moveend', () => {
            const currentCenter = mapRef.current?.getCenter();
            if (currentCenter) {
              const dist = Math.sqrt(Math.pow(currentCenter.lng - view.center[0], 2) + Math.pow(currentCenter.lat - view.center[1], 2));
              if (dist < 0.1) {
                mapRef.current?.jumpTo({
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
      }
    }) as EventListener;
    window.addEventListener('flyToView', handleFlyTo);

    const handleUpdateAnimationTrigger = ((e: CustomEvent<{ triggerId: string }>) => {
      const { triggerId } = e.detail;
      triggerProgressRef.current[triggerId] = 0;
      triggerTimestampsRef.current[triggerId] = Date.now();
      setRevealedTriggers(prev => {
        const next = new Set(prev);
        next.add(triggerId);
        return next;
      });
      setHiddenTriggers(prev => {
        const next = new Set(prev);
        next.delete(triggerId);
        return next;
      });
    }) as EventListener;
    window.addEventListener('updateAnimationTrigger', handleUpdateAnimationTrigger);

    const handleUpdateHideAnimationTrigger = ((e: CustomEvent<{ triggerId: string }>) => {
      const { triggerId } = e.detail;
      triggerProgressRef.current[triggerId] = 0;
      triggerTimestampsRef.current[triggerId] = Date.now();
      setHiddenTriggers(prev => {
        const next = new Set(prev);
        next.add(triggerId);
        return next;
      });
      setRevealedTriggers(prev => {
        const next = new Set(prev);
        next.delete(triggerId);
        return next;
      });
    }) as EventListener;
    window.addEventListener('updateHideAnimationTrigger', handleUpdateHideAnimationTrigger);

    const handleActivateExportTrigger = ((e: CustomEvent<{ triggerId: string }>) => {
      const { triggerId } = e.detail;
      triggerProgressRef.current[triggerId] = 0;
      triggerTimestampsRef.current[triggerId] = Date.now();
      setRevealedTriggers(prev => {
        const next = new Set(prev);
        next.add(triggerId);
        return next;
      });
      setHiddenTriggers(prev => {
        const next = new Set(prev);
        next.add(triggerId);
        return next;
      });
    }) as EventListener;
    window.addEventListener('activateExportTrigger', handleActivateExportTrigger);

    const handleUpdateBothTriggers = ((e: CustomEvent<{ triggerId: string }>) => {
      const { triggerId } = e.detail;
      triggerProgressRef.current[triggerId] = 0;
      triggerTimestampsRef.current[triggerId] = Date.now();
      setRevealedTriggers(prev => {
        const next = new Set(prev);
        next.add(triggerId);
        return next;
      });
      setHiddenTriggers(prev => {
        const next = new Set(prev);
        next.add(triggerId);
        return next;
      });
    }) as EventListener;
    window.addEventListener('updateBothTriggers', handleUpdateBothTriggers);

    const handleResetAnimationTriggers = () => {
      triggerProgressRef.current = {};
      triggerTimestampsRef.current = {};
      setRevealedTriggers(new Set());
      setHiddenTriggers(new Set());
    };
    window.addEventListener('resetAnimationTriggers', handleResetAnimationTriggers);

    return () => {
      window.removeEventListener('flyToView', handleFlyTo);
      window.removeEventListener('updateAnimationTrigger', handleUpdateAnimationTrigger);
      window.removeEventListener('updateHideAnimationTrigger', handleUpdateHideAnimationTrigger);
      window.removeEventListener('activateExportTrigger', handleActivateExportTrigger);
      window.removeEventListener('updateBothTriggers', handleUpdateBothTriggers);
      window.removeEventListener('resetAnimationTriggers', handleResetAnimationTriggers);
    };
  }, []);
};
