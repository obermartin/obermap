import re

with open('src/components/LayerSidebar.tsx', 'r') as f:
    code = f.read()

code = code.replace(
    '(settings.terrainExaggeration ?? 1.5)',
    '(settings.terrainExaggeration ?? 1)'
)

with open('src/components/LayerSidebar.tsx', 'w') as f:
    f.write(code)

with open('src/components/MapContainer.tsx', 'r') as f:
    code = f.read()

code = code.replace(
    'settings.terrainExaggeration || 1.5',
    'settings.terrainExaggeration ?? 1'
)

with open('src/components/MapContainer.tsx', 'w') as f:
    f.write(code)

print("Exaggeration default changed to 1")
