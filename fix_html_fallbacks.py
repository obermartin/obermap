import re

with open('frontend/src/labels/LabelMarkerManager.ts', 'r') as f:
    ts = f.read()

# Fix setTheme
old_set_theme = """        const man = currentTpl?.manifest;
        if (man) {
          if (man.primary.overrideColor && theme.primaryBackplateFill)
            markerEl.style.setProperty(
              "--primary-backplate-fill",
              theme.primaryBackplateFill,
            );
          if (man.secondary?.overrideColor && theme.secondaryBackplateFill)
            markerEl.style.setProperty(
              "--secondary-backplate-fill",
              theme.secondaryBackplateFill,
            );
          if (man.primary.pointer?.overrideColor && theme.pointerFill)
            markerEl.style.setProperty("--pointer-fill", theme.pointerFill);
          if (theme.primaryTextColor)
            markerEl.style.setProperty(
              "--primary-text-color",
              theme.primaryTextColor,
            );
          if (theme.secondaryTextColor)
            markerEl.style.setProperty(
              "--secondary-text-color",
              theme.secondaryTextColor,
            );
          if (theme.accentFill)
            markerEl.style.setProperty("--accent-fill", theme.accentFill);
        }"""

new_set_theme = """        const man = currentTpl?.manifest;
        if (man) {
          if (man.primary.overrideColor)
            markerEl.style.setProperty(
              "--primary-backplate-fill",
              theme.primaryBackplateFill || man.primary.color || "#ffffff"
            );
          if (man.secondary?.overrideColor)
            markerEl.style.setProperty(
              "--secondary-backplate-fill",
              theme.secondaryBackplateFill || man.secondary.color || "#ffffff"
            );
          if (man.primary.pointer?.overrideColor)
            markerEl.style.setProperty(
              "--pointer-fill",
              theme.pointerFill || man.primary.pointer.color || "#ffffff"
            );
          
          markerEl.style.setProperty(
            "--primary-text-color",
            theme.primaryTextColor || man.primary.typography.color || "#000000"
          );
          
          if (man.secondary) {
            markerEl.style.setProperty(
              "--secondary-text-color",
              theme.secondaryTextColor || man.secondary.typography.color || "#000000"
            );
          }
          
          if (theme.accentFill)
            markerEl.style.setProperty("--accent-fill", theme.accentFill);
        }"""

if old_set_theme in ts:
    ts = ts.replace(old_set_theme, new_set_theme)
else:
    print("WARNING: Could not find old_set_theme")


# Fix buildTemplateHtml
old_style = """      <style>
        :root {
          --primary-backplate-fill: ${theme?.primaryBackplateFill || "#ffffff"};
          --secondary-backplate-fill: ${theme?.secondaryBackplateFill || "#ffffff"};
          --pointer-fill: ${theme?.pointerFill || theme?.primaryBackplateFill || "#ffffff"};
          --primary-text-color: ${theme?.primaryTextColor || "#000000"};
          --secondary-text-color: ${theme?.secondaryTextColor || "#000000"};
          --accent-fill: ${theme?.accentFill || "#000000"};
        }
      </style>"""

new_style = """      <style>
        :root {
          --primary-backplate-fill: ${theme?.primaryBackplateFill || manifest?.primary?.color || "#ffffff"};
          --secondary-backplate-fill: ${theme?.secondaryBackplateFill || manifest?.secondary?.color || "#ffffff"};
          --pointer-fill: ${theme?.pointerFill || manifest?.primary?.pointer?.color || "#ffffff"};
          --primary-text-color: ${theme?.primaryTextColor || manifest?.primary?.typography?.color || "#000000"};
          --secondary-text-color: ${theme?.secondaryTextColor || manifest?.secondary?.typography?.color || "#000000"};
          --accent-fill: ${theme?.accentFill || "#000000"};
        }
      </style>"""

if old_style in ts:
    ts = ts.replace(old_style, new_style)
else:
    print("WARNING: Could not find old_style")

with open('frontend/src/labels/LabelMarkerManager.ts', 'w') as f:
    f.write(ts)

print("HTML fallbacks fixed")
