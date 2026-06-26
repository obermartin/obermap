import os

file_path = '/Users/obermartin/Documents/CURRENT/BILD/OBERMAP2/frontend/src/components/MapContainer.tsx'

with open(file_path, 'r') as f:
    content = f.read()

# Basemap scale
content = content.replace(
    'const scale = (isExporting || settings.exportScalePreview) ? (settings.exportBasemapScale ?? 1.0) * (imageExportScale || 1.0) : 1.0;',
    'const scale = (settings.exportBasemapScale ?? 1.0) * (imageExportScale || 1.0);'
)

# Annotation scale
content = content.replace(
    'const domScale = (isExporting || settings.exportScalePreview) ? (settings.exportAnnotationScale ?? 1.0) : 1.0;',
    'const domScale = (settings.exportAnnotationScale ?? 1.0);'
)

with open(file_path, 'w') as f:
    f.write(content)

print("Updated MapContainer.tsx")
