import re

with open('frontend/src/components/MapContainer.tsx', 'r') as f:
    tsx = f.read()

old_theme1 = "theme: ann.theme || { primaryBackplateFill: ann.color, primaryTextColor: contrastColor },"
new_theme1 = """theme: ann.theme || { 
                primaryBackplateFill: globalLabelManager.templates.get(ann.template || '')?.manifest?.primary?.color || ann.color,
                primaryTextColor: globalLabelManager.templates.get(ann.template || '')?.manifest?.primary?.typography?.color || contrastColor,
                pointerFill: globalLabelManager.templates.get(ann.template || '')?.manifest?.primary?.pointer?.color,
                secondaryBackplateFill: globalLabelManager.templates.get(ann.template || '')?.manifest?.secondary?.color
              },"""

if old_theme1 in tsx:
    tsx = tsx.replace(old_theme1, new_theme1)
    with open('frontend/src/components/MapContainer.tsx', 'w') as f:
        f.write(tsx)
    print("MapContainer themes fixed")
else:
    print("WARNING: Could not find old_theme1")
