import re

with open('frontend/src/components/MapContainer.tsx', 'r') as f:
    tsx = f.read()

old_useEffect = """  useEffect(() => {
    if (settings.labelTemplates) {
      const templatesToLoad: string[] = [];
      const getBaseTemplate = (id?: string) => {
        if (!id) return null;
        const v = settings.labelTemplates?.variations?.find(v => v.id === id);
        return v ? v.baseTemplate : id;
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
      const getBaseTemplate = (id?: string) => {
        if (!id) return null;
        const v = settings.labelTemplates?.variations?.find(v => v.id === id);
        return v ? v.baseTemplate : id;
      };
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
      
      if (templatesToLoad.size > 0) {
        globalLabelManager.loadTemplates(Array.from(templatesToLoad)).then(() => {
          setAnnotations(prev => [...prev]);
        });
      }
    }
  }, [settings.labelTemplates, annotations, setAnnotations]);"""

if old_useEffect in tsx:
    tsx = tsx.replace(old_useEffect, new_useEffect)
    with open('frontend/src/components/MapContainer.tsx', 'w') as f:
        f.write(tsx)
    print("Fixed MapContainer preload")
else:
    print("Could not find old_useEffect in MapContainer")
