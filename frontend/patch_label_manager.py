import re

with open('../frontend/src/labels/LabelMarkerManager.ts', 'r') as f:
    ts = f.read()

# Inside createLabel, after retrieving the template
create_label_logic = """
    if (!this.templates.has(opts.template)) {
      console.warn(`Template ${opts.template} not found`);
      return null;
    }
    const tpl = this.templates.get(opts.template)!;
    const man = tpl.manifest;

    const markerEl = document.createElement('div');
    markerEl.className = `label-marker label-marker-${opts.id}`;
    markerEl.dataset.template = opts.template;

    // Apply colors: 
    // 1. If overrideColor is true, use theme overrides or manifest default color.
    // 2. Text colors use theme overrides or manifest default typography color.
    if (man.primary.overrideColor) {
      markerEl.style.setProperty('--primary-backplate-fill', opts.theme?.primaryBackplateFill || man.primary.color || '#ffffff');
    }
    if (man.secondary?.overrideColor) {
      markerEl.style.setProperty('--secondary-backplate-fill', opts.theme?.secondaryBackplateFill || man.secondary.color || '#ffffff');
    }
    if (man.primary.pointer?.overrideColor) {
      markerEl.style.setProperty('--pointer-fill', opts.theme?.pointerFill || man.primary.pointer.color || '#ffffff');
    }

    markerEl.style.setProperty('--primary-text-color', opts.theme?.primaryTextColor || man.primary.typography.color || '#000000');
    if (man.secondary) {
      markerEl.style.setProperty('--secondary-text-color', opts.theme?.secondaryTextColor || man.secondary.typography.color || '#ffffff');
    }

    if (opts.theme?.accentFill) markerEl.style.setProperty('--accent-fill', opts.theme.accentFill);
"""
# Replace lines 341-357
ts = re.sub(r"    const markerEl = document\.createElement\('div'\);\n.*?\}\n", create_label_logic, ts, flags=re.DOTALL, count=1)

# In handle.setTheme, we should probably do a similar lookup if needed, but for now setTheme only overrides what's passed.
# Wait, setTheme doesn't have `tpl` easily accessible, but `markerEl.dataset.template` has it.
set_theme_logic = """
      setTheme: (theme: Partial<Theme>) => {
        opts.theme = { ...opts.theme, ...theme };
        const currentTpl = this.templates.get(markerEl.dataset.template || '');
        const man = currentTpl?.manifest;
        if (man) {
          if (man.primary.overrideColor && theme.primaryBackplateFill) markerEl.style.setProperty('--primary-backplate-fill', theme.primaryBackplateFill);
          if (man.secondary?.overrideColor && theme.secondaryBackplateFill) markerEl.style.setProperty('--secondary-backplate-fill', theme.secondaryBackplateFill);
          if (man.primary.pointer?.overrideColor && theme.pointerFill) markerEl.style.setProperty('--pointer-fill', theme.pointerFill);
          if (theme.primaryTextColor) markerEl.style.setProperty('--primary-text-color', theme.primaryTextColor);
          if (theme.secondaryTextColor) markerEl.style.setProperty('--secondary-text-color', theme.secondaryTextColor);
          if (theme.accentFill) markerEl.style.setProperty('--accent-fill', theme.accentFill);
        }
      },
"""
ts = re.sub(r'      setTheme: \(theme: Partial<Theme>\) => \{.*?\},\n', set_theme_logic.strip() + "\n", ts, flags=re.DOTALL)

with open('../frontend/src/labels/LabelMarkerManager.ts', 'w') as f:
    f.write(ts)

print("LabelMarkerManager patched")
