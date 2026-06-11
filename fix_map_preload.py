import re

with open('frontend/src/components/MapContainer.tsx', 'r') as f:
    tsx = f.read()

old_useEffect = """  useEffect(() => {
    if (settings.labelTemplates) {
      const templatesToLoad: string[] = [];
      const getBaseTemplate = (variationId?: string) => {
        const v = settings.labelTemplates?.variations?.find(v => v.id === variationId);
        return v ? v.baseTemplate : variationId;
      };
      
      const regBase = getBaseTemplate(settings.labelTemplates.regularLabelTemplate);
      const highBase = getBaseTemplate(settings.labelTemplates.highlightLabelTemplate);
      if (regBase) templatesToLoad.push(regBase);
      if (highBase) templatesToLoad.push(highBase);
      if (templatesToLoad.length > 0) {
        globalLabelManager.loadTemplates(templatesToLoad).then(() => {
          setAnnotations(prev => [...prev]);
        });
      }
    }
  }, [settings.labelTemplates, setAnnotations]);"""

new_useEffect = """  useEffect(() => {
    if (settings.labelTemplates) {
      const templatesToLoad = new Set<string>();
      const getBaseTemplate = (variationId?: string) => {
        const v = settings.labelTemplates?.variations?.find(v => v.id === variationId);
        return v ? v.baseTemplate : variationId;
      };
      
      const regBase = getBaseTemplate(settings.labelTemplates.regularLabelTemplate);
      const highBase = getBaseTemplate(settings.labelTemplates.highlightLabelTemplate);
      if (regBase) templatesToLoad.add(regBase);
      if (highBase) templatesToLoad.add(highBase);
      
      // Also preload templates used by existing annotations
      annotations.forEach(a => {
        if (a.template) {
           const base = getBaseTemplate(a.template);
           if (base) templatesToLoad.add(base);
        }
      });
      
      if (templatesToLoad.size > 0) {
        globalLabelManager.loadTemplates(Array.from(templatesToLoad)).then(() => {
          setAnnotations(prev => [...prev]);
        });
      }
    }
  }, [settings.labelTemplates, annotations.length, setAnnotations]);"""

if old_useEffect in tsx:
    tsx = tsx.replace(old_useEffect, new_useEffect)
    with open('frontend/src/components/MapContainer.tsx', 'w') as f:
        f.write(tsx)
    print("Fixed MapContainer preload")
else:
    print("Could not find old_useEffect in MapContainer")
