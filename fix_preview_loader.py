import re

with open('frontend/src/components/LayerSidebar.tsx', 'r') as f:
    tsx = f.read()

tsx = re.sub(
    r'(const p = manager\.getPreviewHtml\([\s\S]*?\);)\s*const tpl = manager\.templates\.get\(templateName\);',
    r'\1\n        if (!p) throw new Error("Preview html is null");\n        const tpl = manager.templates.get(templateName);',
    tsx
)

with open('frontend/src/components/LayerSidebar.tsx', 'w') as f:
    f.write(tsx)
print("Fixed loader")
