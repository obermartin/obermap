import re

with open('../frontend/src/components/LayerSidebar.tsx', 'r') as f:
    tsx = f.read()

# I previously wrote:
# const tplDef = workspaceData?.labelTemplates?.templates?.find((t: any) => t.id === item.templateId);
# I will replace it with:
# const tplDef = settings.labelTemplates?.availableTemplates?.find((t: any) => t.id === item.baseTemplate);

tsx = tsx.replace(
    'const tplDef = workspaceData?.labelTemplates?.templates?.find((t: any) => t.id === item.templateId);',
    'const tplDef = settings.labelTemplates?.availableTemplates?.find((t: any) => t.id === item.baseTemplate);'
)

with open('../frontend/src/components/LayerSidebar.tsx', 'w') as f:
    f.write(tsx)

print("LayerSidebar fixed template lookup")
