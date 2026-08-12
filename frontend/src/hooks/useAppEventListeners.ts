import { useEffect } from 'react';
import type { Annotation, AppSettings } from '../types';
import { customAlert } from '../utils/dialogService';
import { globalLabelManager } from '../labels/LabelMarkerManager';

export const useAppEventListeners = (
  currentColor: string,
  selectedAnnotationId: string | null,
  settingsRef: React.MutableRefObject<AppSettings>,
  setSettings: React.Dispatch<React.SetStateAction<AppSettings>>,
  setAnnotations: React.Dispatch<React.SetStateAction<Annotation[]>>
) => {
  useEffect(() => {
    const handleViewCaptured = (async (e: Event) => {
      const customEvent = e as CustomEvent<AppSettings['defaultView']>;
      setSettings(prev => ({ ...prev, defaultView: customEvent.detail }));
      await customAlert('Default map view captured!');
    }) as EventListener;
    window.addEventListener('viewCaptured', handleViewCaptured);

    const handleViewCapturedForPosition = ((e: Event) => {
      const customEvent = e as CustomEvent<AppSettings['defaultView']>;
      setAnnotations(prev => {
        const positionCount = prev.filter(a => a.type === 'label' && a.text?.startsWith('POSITION ')).length + 1;
        return [...prev, {
          id: `position-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
          type: 'label',
          color: currentColor,
          text: `POSITION ${positionCount}`,
          view: customEvent.detail
        }];
      });
    }) as EventListener;
    window.addEventListener('viewCapturedForPosition', handleViewCapturedForPosition);

    const handleViewCapturedForUpdate = ((e: Event) => {
      const customEvent = e as CustomEvent<{ id: string, view: AppSettings['defaultView'] }>;
      const { id, view } = customEvent.detail;
      setAnnotations(prev => prev.map(a => a.id === id ? { ...a, view } : a));
    }) as EventListener;
    window.addEventListener('viewCapturedForUpdate', handleViewCapturedForUpdate);

    const handleViewCapturedForDefaultUpdate = ((e: Event) => {
      const customEvent = e as CustomEvent<AppSettings['defaultView']>;
      setSettings(prev => ({ ...prev, defaultView: customEvent.detail }));
    }) as EventListener;
    window.addEventListener('viewCapturedForDefaultUpdate', handleViewCapturedForDefaultUpdate);

    const handleUpdateAnimationTrigger = ((e: Event) => {
      const customEvent = e as CustomEvent<{ targetId: string, triggerId: string, clearHideTrigger?: boolean }>;
      const { targetId, triggerId, clearHideTrigger } = customEvent.detail;
      setAnnotations(prev => prev.map(a => {
        if (a.id === targetId) {
          const isAlreadySet = a.animationTriggerId === triggerId;
          const nextTriggerId = isAlreadySet ? undefined : triggerId;
          const update = { ...a, animationTriggerId: nextTriggerId };
          if (clearHideTrigger && nextTriggerId !== undefined) update.hideAnimationTriggerId = undefined;
          return update;
        }
        return a;
      }));
    }) as EventListener;
    window.addEventListener('updateAnimationTrigger', handleUpdateAnimationTrigger);

    const handleUpdateHideAnimationTrigger = ((e: Event) => {
      const customEvent = e as CustomEvent<{ targetId: string, triggerId: string, clearRevealTrigger?: boolean }>;
      const { targetId, triggerId, clearRevealTrigger } = customEvent.detail;
      setAnnotations(prev => prev.map(a => {
        if (a.id === targetId) {
          const isAlreadySet = a.hideAnimationTriggerId === triggerId;
          const nextTriggerId = isAlreadySet ? undefined : triggerId;
          const update = { ...a, hideAnimationTriggerId: nextTriggerId };
          if (clearRevealTrigger && nextTriggerId !== undefined) update.animationTriggerId = undefined;
          return update;
        }
        return a;
      }));
    }) as EventListener;
    window.addEventListener('updateHideAnimationTrigger', handleUpdateHideAnimationTrigger);

    const handleUpdateCropKeyframe = ((e: Event) => {
      const customEvent = e as CustomEvent<{ targetId: string, format: 'landscape' | 'portrait' | 'square' }>;
      const { targetId, format } = customEvent.detail;
      const currentSettings = settingsRef.current;
      const currentCropSetting = currentSettings.exportCropSettings?.[format] || { scale: 1, offsetX: 0, offsetY: 0 };
      
      if (targetId === 'overview') {
        setSettings(prev => {
          const currentCropSettings = prev.defaultView.cropSettings || {};
          const hasKeyframe = !!currentCropSettings[format];
          const newCropSettings = { ...currentCropSettings };
          if (hasKeyframe) {
            delete newCropSettings[format];
          } else {
            newCropSettings[format] = { ...currentCropSetting };
          }
          return {
            ...prev,
            defaultView: { ...prev.defaultView, cropSettings: newCropSettings }
          };
        });
      } else {
        setAnnotations(prev => prev.map(a => {
          if (a.id === targetId) {
            const currentCropSettings = a.cropSettings || {};
            const hasKeyframe = !!currentCropSettings[format];
            const newCropSettings = { ...currentCropSettings };
            if (hasKeyframe) {
              delete newCropSettings[format];
            } else {
              newCropSettings[format] = { ...currentCropSetting };
            }
            return { ...a, cropSettings: newCropSettings };
          }
          return a;
        }));
      }
    }) as EventListener;
    window.addEventListener('updateCropKeyframe', handleUpdateCropKeyframe);

    const handleUpdateTemplate = ((e: Event) => {
      const { type, template } = (e as CustomEvent).detail;
      const currentSettings = settingsRef.current;
      const variation = currentSettings.labelTemplates?.variations?.find(v => v.id === template);
      const actualTemplate = variation ? variation.baseTemplate : template;
      const tplDefForTheme = currentSettings.labelTemplates?.availableTemplates?.find((t: any) => t.id === actualTemplate);
      const manForTheme = (tplDefForTheme as any)?.manifest || globalLabelManager.templates.get(actualTemplate || '')?.manifest;
      const actualTheme = {
        ...(currentSettings.labelTemplates?.theme || {}),
        ...(manForTheme?.primary?.color ? { primaryBackplateFill: manForTheme.primary.color } : {}),
        ...(manForTheme?.primary?.pointer?.color ? { pointerFill: manForTheme.primary.pointer.color } : {}),
        ...(manForTheme?.primary?.typography?.color ? { primaryTextColor: manForTheme.primary.typography.color } : {}),
        ...(manForTheme?.secondary?.color ? { secondaryBackplateFill: manForTheme.secondary.color } : {}),
        ...(manForTheme?.secondary?.typography?.color ? { secondaryTextColor: manForTheme.secondary.typography.color } : {}),
        ...(currentSettings.labelTemplates?.savedThemes?.[template || ''] || {})
      };
      setAnnotations(prev => prev.map(a => {
        if (a.id === selectedAnnotationId) {
          if ((type === 'regular' && a.type === 'label') || (type === 'highlight' && a.type === 'highlight') || (type === 'headline' && a.type === 'headline')) {
            return { ...a, template: actualTemplate, theme: { ...(a.theme || {}), ...actualTheme } };
          }
        }
        return a;
      }));
    }) as EventListener;
    window.addEventListener('updateSelectedLabelTemplate', handleUpdateTemplate);

    const handleUpdateTheme = ((e: Event) => {
      const { key, value } = (e as CustomEvent).detail;
      setAnnotations(prev => prev.map(a => {
        if (a.id === selectedAnnotationId && (a.type === 'label' || a.type === 'highlight' || a.type === 'headline')) {
          return { ...a, theme: { ...(a.theme || {}), [key]: value } };
        }
        return a;
      }));
    }) as EventListener;
    window.addEventListener('updateSelectedLabelTheme', handleUpdateTheme);

    return () => {
      window.removeEventListener('viewCaptured', handleViewCaptured);
      window.removeEventListener('viewCapturedForPosition', handleViewCapturedForPosition);
      window.removeEventListener('viewCapturedForUpdate', handleViewCapturedForUpdate);
      window.removeEventListener('viewCapturedForDefaultUpdate', handleViewCapturedForDefaultUpdate);
      window.removeEventListener('updateAnimationTrigger', handleUpdateAnimationTrigger);
      window.removeEventListener('updateHideAnimationTrigger', handleUpdateHideAnimationTrigger);
      window.removeEventListener('updateSelectedLabelTemplate', handleUpdateTemplate);
      window.removeEventListener('updateSelectedLabelTheme', handleUpdateTheme);
      window.removeEventListener('updateCropKeyframe', handleUpdateCropKeyframe);
    };
  }, [currentColor, selectedAnnotationId]);
};
