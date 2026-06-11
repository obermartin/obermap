import re

with open('frontend/src/App.tsx', 'r') as f:
    tsx = f.read()

old_theme = """      const actualTheme = settings.labelTemplates?.savedThemes?.[template || ''] || settings.labelTemplates?.theme;
      setAnnotations(prev => prev.map(a => {"""

new_theme = """      const tplDefForTheme = settings.labelTemplates?.availableTemplates?.find((t: any) => t.id === actualTemplate);
      const manForTheme = (tplDefForTheme as any)?.manifest;
      const actualTheme = {
        ...(settings.labelTemplates?.theme || {}),
        ...(manForTheme?.primary?.color ? { primaryBackplateFill: manForTheme.primary.color } : {}),
        ...(manForTheme?.primary?.pointer?.color ? { pointerFill: manForTheme.primary.pointer.color } : {}),
        ...(manForTheme?.primary?.typography?.color ? { primaryTextColor: manForTheme.primary.typography.color } : {}),
        ...(manForTheme?.secondary?.color ? { secondaryBackplateFill: manForTheme.secondary.color } : {}),
        ...(manForTheme?.secondary?.typography?.color ? { secondaryTextColor: manForTheme.secondary.typography.color } : {}),
        ...(settings.labelTemplates?.savedThemes?.[template || ''] || {})
      };
      setAnnotations(prev => prev.map(a => {"""

if old_theme in tsx:
    tsx = tsx.replace(old_theme, new_theme)
    with open('frontend/src/App.tsx', 'w') as f:
        f.write(tsx)
    print("App theme merge fixed")
else:
    print("Could not find old_theme")
