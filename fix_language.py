import os

file_path = '/Users/obermartin/Documents/CURRENT/BILD/OBERMAP2/frontend/src/components/LayerSidebar.tsx'

with open(file_path, 'r') as f:
    content = f.read()

content = content.replace(
    "{language === 'de' ? 'SKALIERUNG' : 'SCALING'}",
    "{t('SCALING')}"
)

with open(file_path, 'w') as f:
    f.write(content)

