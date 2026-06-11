import re

with open('frontend/src/components/MapContainer.tsx', 'r') as f:
    tsx = f.read()

old_code = """      if (templatesToLoad.size > 0) {
        globalLabelManager.loadTemplates(Array.from(templatesToLoad)).then(() => {
          setAnnotations(prev => [...prev]);
        });
      }"""

new_code = """      const missingTemplates = Array.from(templatesToLoad).filter(t => !globalLabelManager.templates.has(t));
      if (missingTemplates.length > 0) {
        globalLabelManager.loadTemplates(missingTemplates).then(() => {
          setAnnotations(prev => [...prev]);
        });
      }"""

if old_code in tsx:
    tsx = tsx.replace(old_code, new_code)
    with open('frontend/src/components/MapContainer.tsx', 'w') as f:
        f.write(tsx)
    print("Fixed MapContainer infinite loop")
else:
    print("Could not find old_code in MapContainer")
