import { useEffect, useCallback } from 'react';
import type { AppSettings, Annotation } from '../types';
import { globalLabelManager } from '../labels/LabelMarkerManager';

interface UseLabelTemplatesProps {
  settings: AppSettings;
  annotations: Annotation[];
  setAnnotations: React.Dispatch<React.SetStateAction<Annotation[]>>;
}

export const useLabelTemplates = ({
  settings,
  annotations,
  setAnnotations
}: UseLabelTemplatesProps) => {

  const getBaseTemplate = useCallback((id?: string) => {
    if (!id) return null;
    const v = settings.labelTemplates?.variations?.find(v => v.id === id);
    return v ? v.baseTemplate : id;
  }, [settings.labelTemplates?.variations]);

  useEffect(() => {
    if (settings.labelTemplates) {
      const templatesToLoad = new Set<string>();
      const regBase = getBaseTemplate(settings.labelTemplates.regularLabelTemplate);
      const highBase = getBaseTemplate(settings.labelTemplates.highlightLabelTemplate);
      if (regBase) templatesToLoad.add(regBase);
      if (highBase) templatesToLoad.add(highBase);
      
      annotations.forEach(a => {
        if (a.template) {
          const base = getBaseTemplate(a.template);
          if (base) templatesToLoad.add(base);
        }
      });
      
      const missingTemplates = Array.from(templatesToLoad).filter(t => !globalLabelManager.templates.has(t));
      if (missingTemplates.length > 0) {
        globalLabelManager.loadTemplates(missingTemplates).then(() => {
          setAnnotations(prev => [...prev]);
        });
      }
    }
  }, [settings.labelTemplates, annotations, setAnnotations, getBaseTemplate]);

  return { getBaseTemplate };
};
