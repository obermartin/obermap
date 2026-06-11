import re

with open('frontend/src/components/LayerSidebar.tsx', 'r') as f:
    tsx = f.read()

old_theme = """                    const currentTheme =
                      settings.labelTemplates?.savedThemes?.[item.id] ||
                      settings.labelTemplates?.theme ||
                      {};"""

new_theme = """                    const tplDefForTheme = settings.labelTemplates?.availableTemplates?.find((t: any) => t.id === item.baseTemplate);
                    const manForTheme = (tplDefForTheme as any)?.manifest;
                    const currentTheme = {
                      ...(settings.labelTemplates?.theme || {}),
                      ...(manForTheme?.primary?.color ? { primaryBackplateFill: manForTheme.primary.color } : {}),
                      ...(manForTheme?.primary?.pointer?.color ? { pointerFill: manForTheme.primary.pointer.color } : {}),
                      ...(manForTheme?.primary?.typography?.color ? { primaryTextColor: manForTheme.primary.typography.color } : {}),
                      ...(manForTheme?.secondary?.color ? { secondaryBackplateFill: manForTheme.secondary.color } : {}),
                      ...(manForTheme?.secondary?.typography?.color ? { secondaryTextColor: manForTheme.secondary.typography.color } : {}),
                      ...(settings.labelTemplates?.savedThemes?.[item.id] || {})
                    };"""

if old_theme in tsx:
    tsx = tsx.replace(old_theme, new_theme)
    with open('frontend/src/components/LayerSidebar.tsx', 'w') as f:
        f.write(tsx)
    print("Sidebar theme merge fixed")
else:
    print("Could not find old_theme")
