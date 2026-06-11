import re

with open('../label sources/manifest-builder.html', 'r') as f:
    html = f.read()

# 1. Update font family for body to Roboto
html = html.replace('font-family: ui-monospace, "JetBrains Mono", "SF Mono", "Cascadia Code", Consolas, monospace;', "font-family: 'Roboto', Arial, sans-serif;")

# Keep preview text inputs monospace or custom if they were?
# The request said: "everything that is not a text field should use the Roboto font (fall back to Arial)"
# In CSS:
# .field input[type="text"], .preview-header input[type="text"]
# They inherit font. Let's explicitly set font-family for text inputs to monospace to preserve developer feel.
css_addition = """
  input[type="text"] { font-family: ui-monospace, monospace; }
  .swatch-group { display: flex; flex-direction: column; align-items: center; gap: 4px; }
  .swatch-label { font-size: 9px; color: var(--text-faint); text-transform: uppercase; letter-spacing: 0.5px; }
  .icon-toggle { display: flex; border: 1px solid var(--border-strong); border-radius: 4px; overflow: hidden; height: 24px; align-self: center;}
  .icon-toggle button { background: transparent; border: none; padding: 0 8px; color: var(--text-dim); font-size: 11px; cursor: pointer; border-radius: 0; }
  .icon-toggle button.active { background: var(--border-strong); color: var(--text); }
  .icon-toggle button:hover:not(.active) { background: var(--panel-2); }
"""
html = html.replace('/* Empty state */', css_addition + '\n  /* Empty state */')

# 2. Update Color Swatches
old_swatches_pattern = r'<div style="margin-left:auto; display:flex; gap:8px;" class="theme-controls-new">.*?</div>\s*</div>\s*<div class="typography-panels"'
new_swatches = """<div style="margin-left:auto; display:flex; gap:16px; align-items:center;" class="theme-controls-new">
          <div class="swatch-group">
            <span class="swatch-label">Primary</span>
            <div class="pill-swatch">
               <input type="color" id="themePrimaryFill" value="#ffffff" title="Primary Fill">
               <input type="color" id="themePrimaryText" value="#1a1a1a" title="Primary Text">
            </div>
          </div>
          <div class="swatch-group" id="themeSecondarySwatch" style="display:none">
            <span class="swatch-label">Secondary</span>
            <div class="pill-swatch">
               <input type="color" id="themeSecondaryFill" value="#1a1a1a" title="Secondary Fill">
               <input type="color" id="themeSecondaryText" value="#ffffff" title="Secondary Text">
            </div>
          </div>
          <div class="swatch-group">
            <span class="swatch-label">Pointer</span>
            <div class="pill-swatch single">
               <input type="color" id="themePointer" value="#ffffff" title="Pointer Fill">
            </div>
          </div>
          <div class="swatch-group">
            <span class="swatch-label">Accent</span>
            <div class="pill-swatch single">
               <input type="color" id="themeAccent" value="#d4ff3f" title="Accent Fill">
            </div>
          </div>
        </div>
      </div>
      <div class="typography-panels\""""
html = re.sub(old_swatches_pattern, new_swatches, html, flags=re.DOTALL)


# 3. Update Typography Panels
def build_typo_panel(prefix):
    fs_val = 14 if prefix == 'primary' else 11
    fw_val = 600 if prefix == 'primary' else 500
    color_val = 'var(--primary-text-color, #1a1a1a)' if prefix == 'primary' else 'var(--secondary-text-color, #ffffff)'
    ls_val = '0' if prefix == 'primary' else '0.3'
    lh_val = '1.2' if prefix == 'primary' else '1.3'
    tt_active_none = 'class="active"' if prefix == 'primary' else ''
    tt_active_up = '' if prefix == 'primary' else 'class="active"'
    tt_val = 'none' if prefix == 'primary' else 'uppercase'

    return f"""<div class="field full" style="margin-bottom:8px;"><label>fontFamily</label><input type="text" id="{prefix}FontFamily" value="Inter"></div>
          <div style="display:flex; gap:12px; flex-wrap:wrap; margin-bottom:8px; align-items:flex-end;">
            <div class="field" style="margin:0;"><label>size</label><div class="value-wrap"><input type="number" id="{prefix}FontSize" value="{fs_val}" min="1" style="width:44px;"><span class="unit">px</span></div></div>
            <div class="field" style="margin:0;"><label>weight</label><div class="value-wrap"><input type="number" id="{prefix}FontWeight" value="{fw_val}" min="100" max="900" step="100" style="width:50px;"></div></div>
            <div class="field" style="margin:0;"><label>height</label><div class="value-wrap"><input type="number" id="{prefix}LineHeight" value="{lh_val}" step="0.1" style="width:44px;"></div></div>
            <div class="field" style="margin:0;"><label>spacing</label><div class="value-wrap"><input type="number" id="{prefix}LetterSpacing" value="{ls_val}" step="0.1" style="width:44px;"><span class="unit">px</span></div></div>
            <div class="icon-toggle" id="{prefix}TextTransformGrp" data-target="{prefix}TextTransform">
              <button {tt_active_none} data-val="none" title="None">A</button>
              <button {tt_active_up} data-val="uppercase" title="Uppercase">AA</button>
              <button data-val="lowercase" title="Lowercase">aa</button>
              <button data-val="capitalize" title="Title Case">Aa</button>
            </div>
            <input type="hidden" id="{prefix}TextTransform" value="{tt_val}">
            <div class="icon-toggle" id="{prefix}TextAlignGrp" data-target="{prefix}TextAlign">
              <button data-val="left" title="Left">⫷</button>
              <button class="active" data-val="center" title="Center">≣</button>
              <button data-val="right" title="Right">⫸</button>
            </div>
            <input type="hidden" id="{prefix}TextAlign" value="center">
          </div>
          <div class="field full"><label>color</label><input type="text" id="{prefix}Color" value="{color_val}"></div>"""

primary_typo_html = build_typo_panel('primary')
secondary_typo_html = build_typo_panel('secondary')

# Replace existing primary typography panel content
primary_typo_pattern = r'<div class="typo-panel form" style="flex:1; padding: 12px 20px; border-right: 1px solid var\(--border\); padding-bottom: 12px;">\s*<div class="subgroup-header" style="margin-top:0">Primary typography</div>.*?</div>\s*<div class="typo-panel form" id="secondaryTypoPanel"'
new_primary_typo = f"""<div class="typo-panel form" style="flex:1; padding: 12px 20px; border-right: 1px solid var(--border); padding-bottom: 12px;">
          <div class="subgroup-header" style="margin-top:0; margin-bottom:12px;">Primary typography</div>
          {primary_typo_html}
        </div>
        <div class="typo-panel form" id="secondaryTypoPanel\""""
html = re.sub(primary_typo_pattern, new_primary_typo, html, flags=re.DOTALL)

# Replace existing secondary typography panel content
secondary_typo_pattern = r'<div class="typo-panel form" id="secondaryTypoPanel" style="flex:1; padding: 12px 20px; display:none; padding-bottom: 12px;">\s*<div class="subgroup-header" style="margin-top:0">Secondary typography</div>.*?</div>\s*</div>\s*</div>\s*<div class="preview-area"'
new_secondary_typo = f"""<div class="typo-panel form" id="secondaryTypoPanel" style="flex:1; padding: 12px 20px; display:none; padding-bottom: 12px;">
          <div class="subgroup-header" style="margin-top:0; margin-bottom:12px;">Secondary typography</div>
          {secondary_typo_html}
        </div>
      </div>
    </div>
    <div class="preview-area\""""
html = re.sub(secondary_typo_pattern, new_secondary_typo, html, flags=re.DOTALL)


# 4. Add JS logic for the icon toggles and accent color swatch
js_addition = """
document.querySelectorAll('.icon-toggle button').forEach(btn => {
  btn.addEventListener('click', (e) => {
    const parent = e.target.closest('.icon-toggle');
    parent.querySelectorAll('button').forEach(b => b.classList.remove('active'));
    e.target.classList.add('active');
    const targetId = parent.getAttribute('data-target');
    document.getElementById(targetId).value = e.target.getAttribute('data-val');
    renderPreview();
  });
});
"""
# insert before renderPreview calls
html = html.replace('function renderPreview() {', js_addition + '\nfunction renderPreview() {')

# Also, add themeAccent to the state theme
if 'accentFill:' not in html:
    html = html.replace("pointerFill: '#ffffff',", "pointerFill: '#ffffff',\n    accentFill: '#d4ff3f',")

with open('../label sources/manifest-builder.html', 'w') as f:
    f.write(html)
