import re

with open('frontend/src/components/LayerSidebar.tsx', 'r') as f:
    tsx = f.read()

old_style = """  const style: any = {};
  if (theme && manifest) {
    if (manifest.primary?.overrideColor)
      style["--primary-backplate-fill"] = theme.primaryBackplateFill;
    if (manifest.secondary?.overrideColor)
      style["--secondary-backplate-fill"] = theme.secondaryBackplateFill;
    if (manifest.primary?.pointer?.overrideColor)
      style["--pointer-fill"] = theme.pointerFill;
    style["--primary-text-color"] = theme.primaryTextColor;
    style["--secondary-text-color"] = theme.secondaryTextColor;
    if (theme.accentFill) style["--accent-fill"] = theme.accentFill;
  }"""

new_style = """  const style: any = {};
  if (theme && manifest) {
    if (manifest.primary?.overrideColor)
      style["--primary-backplate-fill"] = theme.primaryBackplateFill || manifest.primary.color;
    if (manifest.secondary?.overrideColor)
      style["--secondary-backplate-fill"] = theme.secondaryBackplateFill || manifest.secondary.color;
    if (manifest.primary?.pointer?.overrideColor)
      style["--pointer-fill"] = theme.pointerFill || manifest.primary.pointer.color;
    style["--primary-text-color"] = theme.primaryTextColor || manifest.primary?.typography?.color;
    style["--secondary-text-color"] = theme.secondaryTextColor || manifest.secondary?.typography?.color;
    if (theme.accentFill) style["--accent-fill"] = theme.accentFill;
  }"""

if old_style in tsx:
    tsx = tsx.replace(old_style, new_style)
    with open('frontend/src/components/LayerSidebar.tsx', 'w') as f:
        f.write(tsx)
    print("Preview styles fixed")
else:
    print("Could not find old_style")
