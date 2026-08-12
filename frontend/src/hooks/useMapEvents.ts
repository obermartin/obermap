import { useEffect } from 'react';
import type { Annotation, AppSettings } from '../types';

interface UseMapEventsProps {
  isSecondary?: boolean;
  mapRef: React.MutableRefObject<maplibregl.Map | null>;
  currentColor: string;
  labelPrompt: { lngLat: [number, number], initialText?: string, initialSecondary?: string, annotationId?: string } | null;
  setLabelPrompt: React.Dispatch<React.SetStateAction<{ lngLat: [number, number], initialText?: string, initialSecondary?: string, annotationId?: string } | null>>;
  setHeadlinePrompt?: React.Dispatch<React.SetStateAction<{ id?: string, initialPrimary?: string, initialSecondary?: string } | null>>;
  settingsRef: React.MutableRefObject<AppSettings>;
  setAnnotations: React.Dispatch<React.SetStateAction<Annotation[]>>;
}

export function useMapEvents({
  isSecondary,
  mapRef,
  currentColor,
  labelPrompt,
  setLabelPrompt,
  setHeadlinePrompt,
  settingsRef,
  setAnnotations
}: UseMapEventsProps) {
  useEffect(() => {
    if (isSecondary) return;
    const handleSaveLabel = ((e: CustomEvent<{ text: string, secondaryText?: string }>) => {
      const { text, secondaryText } = e.detail;
      const map = mapRef.current;
      if (text && labelPrompt && map) {
        if (labelPrompt.annotationId) {
          // Edit existing label
          setAnnotations(prev => prev.map(a => a.id === labelPrompt.annotationId ? { ...a, text, secondaryText } : a));
        } else {
          // Create new label
          const selectedId = settingsRef.current?.labelTemplates?.regularLabelTemplate;
          const variation = settingsRef.current?.labelTemplates?.variations?.find(v => v.id === selectedId);
          const actualTemplate = variation ? variation.baseTemplate : selectedId;
          const actualTheme = settingsRef.current?.labelTemplates?.savedThemes?.[selectedId || ''];
          const newId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
          const newLabel: Annotation = {
            id: newId,
            type: 'label',
            color: currentColor,
            text,
            secondaryText,
            template: actualTemplate,
            theme: actualTheme,
            coordinates: labelPrompt.lngLat,
            animationTriggerId: newId,
            view: {
              center: [map.getCenter().lng, map.getCenter().lat],
              zoom: map.getZoom(),
              pitch: map.getPitch(),
              bearing: map.getBearing(),
              elevation: map.queryTerrainElevation([map.getCenter().lng, map.getCenter().lat]) || 0
            }
          };
          setAnnotations(prev => [...prev, newLabel]);
        }
        setLabelPrompt(null);
      }
    }) as EventListener;
    window.addEventListener('saveLabel', handleSaveLabel);
    return () => window.removeEventListener('saveLabel', handleSaveLabel);
  }, [isSecondary, labelPrompt, currentColor, setAnnotations, setLabelPrompt, mapRef, settingsRef]);

  useEffect(() => {
    if (isSecondary) return;
    const handleHide = () => {
      if (mapRef.current) {
        settingsRef.current.layers.forEach(l => {
          if (l.type === 'gdacs_earthquakes' || l.type === 'cems_rapid_mapping') {
            try {
              mapRef.current!.setFilter(`dynamic-layer-${l.id}`, ['==', '1', '2']);
              if (mapRef.current!.getLayer(`dynamic-layer-${l.id}-label`)) {
                mapRef.current!.setFilter(`dynamic-layer-${l.id}-label`, ['==', '1', '2']);
              }
            } catch(e) {}
          }
        });
      }
    };
    
    const handleRestore = () => {
      if (mapRef.current) {
        settingsRef.current.layers.forEach(l => {
          if (l.type === 'gdacs_earthquakes' || l.type === 'cems_rapid_mapping') {
            const baseLayerId = `dynamic-layer-${l.id}`;
            const labelLayerId = `${baseLayerId}-label`;
            try {
              mapRef.current!.setFilter(baseLayerId, null);
              if (mapRef.current!.getLayer(labelLayerId)) mapRef.current!.setFilter(labelLayerId, null);
            } catch(e) {}
          }
        });
      }
    };
    
    window.addEventListener('hideEarthquakeDotsForExport', handleHide);
    window.addEventListener('restoreEarthquakeDotsForExport', handleRestore);
    return () => {
      window.removeEventListener('hideEarthquakeDotsForExport', handleHide);
      window.removeEventListener('restoreEarthquakeDotsForExport', handleRestore);
    };
  }, [isSecondary, mapRef, settingsRef]);

  useEffect(() => {
    if (isSecondary) return;
    const handleSaveHeadline = ((e: CustomEvent<{ text: string, secondaryText?: string, id?: string }>) => {
      const { text, secondaryText, id } = e.detail;
      if (id) {
        setAnnotations(prev => prev.map(a => a.id === id ? { ...a, text, secondaryText } : a));
      } else {
        const map = mapRef.current;
        const selectedId = settingsRef.current?.labelTemplates?.headlineTemplate || settingsRef.current?.labelTemplates?.regularLabelTemplate;
        const variation = settingsRef.current?.labelTemplates?.variations?.find(v => v.id === selectedId);
        const actualTemplate = variation ? variation.baseTemplate : selectedId;
        const actualTheme = settingsRef.current?.labelTemplates?.savedThemes?.[selectedId || ''] || settingsRef.current?.labelTemplates?.theme;

        const newId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
        setAnnotations(prev => [...prev, {
          id: newId,
          type: 'headline',
          color: currentColor,
          text,
          secondaryText,
          template: actualTemplate,
          theme: actualTheme,
          screenPosition: { x: window.innerWidth / 2 - 200, y: 100 },
          view: map ? {
            center: [map.getCenter().lng, map.getCenter().lat],
            zoom: map.getZoom(),
            pitch: map.getPitch(),
            bearing: map.getBearing(),
            elevation: map.queryTerrainElevation([map.getCenter().lng, map.getCenter().lat]) || 0
          } : undefined
        }]);
      }
      setHeadlinePrompt?.(null);
    }) as EventListener;
    window.addEventListener('saveHeadline', handleSaveHeadline);
    return () => window.removeEventListener('saveHeadline', handleSaveHeadline);
  }, [isSecondary, currentColor, setAnnotations, setHeadlinePrompt, mapRef, settingsRef]);

  useEffect(() => {
    if (isSecondary) return;
    const handleDropIcon = ((e: CustomEvent<{ clientX: number, clientY: number, iconId: string, color: string }>) => {
      if (!mapRef.current) return;
      const lngLat = mapRef.current.unproject([e.detail.clientX, e.detail.clientY]);
      setAnnotations(prev => [...prev, {
        id: `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
        type: 'icon',
        iconId: e.detail.iconId,
        color: e.detail.color,
        coordinates: [lngLat.lng, lngLat.lat]
      }]);
    }) as EventListener;
    window.addEventListener('requestDropIcon', handleDropIcon);
    return () => window.removeEventListener('requestDropIcon', handleDropIcon);
  }, [isSecondary, setAnnotations, mapRef]);
}
