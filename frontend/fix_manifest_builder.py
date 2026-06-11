import re
import sys

with open('../label sources/manifest-builder.html', 'r') as f:
    html = f.read()

# 1. Extract pieces

# Template group
template_group_pattern = r'(<div class="group">\s*<div class="group-header">Template</div>.*?</div>\s*</div>)'
template_group_match = re.search(template_group_pattern, html, re.DOTALL)
template_group_html = template_group_match.group(1)

# Primary Backplate fields (height to paddingY)
primary_backplate_pattern = r'<div class="group-header">Primary backplate <span class="badge">required</span></div>\s*(<div class="field"><label>height</label>.*?<div class="field"><label>paddingY</label>.*?px</span></div></div>)'
primary_backplate_match = re.search(primary_backplate_pattern, html, re.DOTALL)
primary_backplate_fields = primary_backplate_match.group(1)

# Primary Typography fields
primary_typo_pattern = r'<div class="subgroup-header">Primary typography</div>\s*(<div class="field full"><label>fontFamily</label>.*?<div class="field"><label>textAlign</label>.*?</select></div>)'
primary_typo_match = re.search(primary_typo_pattern, html, re.DOTALL)
primary_typo_fields = primary_typo_match.group(1)

# Primary Pointer fields
primary_pointer_pattern = r'<div class="subgroup-header">Primary pointer</div>\s*(<div class="field"><label>width</label>.*? independentColor.*?</label>)'
primary_pointer_match = re.search(primary_pointer_pattern, html, re.DOTALL)
primary_pointer_fields = primary_pointer_match.group(1)

# Secondary Backplate fields
secondary_backplate_pattern = r'<div class="group-header">Secondary backplate</div>\s*(<div class="field"><label>height</label>.*?<div class="field"><label>gap</label>.*?px</span></div></div>)'
secondary_backplate_match = re.search(secondary_backplate_pattern, html, re.DOTALL)
secondary_backplate_fields = secondary_backplate_match.group(1)

# Secondary Typography fields
secondary_typo_pattern = r'<div class="subgroup-header">Secondary typography</div>\s*(<div class="field full"><label>fontFamily</label>.*?<div class="field"><label>textAlign</label>.*?</select></div>)'
secondary_typo_match = re.search(secondary_typo_pattern, html, re.DOTALL)
secondary_typo_fields = secondary_typo_match.group(1)


# 2. Modify HTML

# Remove old .form block completely
html = re.sub(r'<div class="form">.*?</div>\s*</div>\s*</div>\s*<!-- CENTER', '</div>\n\n  <!-- CENTER', html, flags=re.DOTALL)

# Insert Template group above dropzone
new_left = f"""<div class="form" style="padding: 20px 20px 0;">
      {template_group_html}
    </div>
    
    <div class="dropzone" id="dropzone">"""
html = html.replace('<div class="dropzone" id="dropzone">', new_left)

# Add .pill-swatch CSS
css_addition = """
  .pill-swatch {
    display: flex;
    width: 44px;
    height: 24px;
    border-radius: 9999px;
    overflow: hidden;
    border: 1px solid var(--border-strong);
  }
  .pill-swatch input[type="color"] {
    width: 50%;
    height: 100%;
    border: none;
    padding: 0;
    cursor: pointer;
    background: transparent;
  }
  .pill-swatch.single input[type="color"] { width: 100%; }
  .pill-swatch input[type="color"]::-webkit-color-swatch-wrapper { padding: 0; }
  .pill-swatch input[type="color"]::-webkit-color-swatch { border: none; border-radius: 0; }
"""
html = html.replace('/* Empty state */', css_addition + '\n  /* Empty state */')


# Replace middle column preview header
old_preview_header_pattern = r'<div class="preview-header">.*?</div>\s*<div class="preview-area"'
new_preview_header = f"""<div class="preview-header-container" style="background: var(--panel); border-bottom: 1px solid var(--border);">
      <div class="preview-header" style="border-bottom:none">
        <div class="label">Preview text</div>
        <input type="text" id="previewPrimary" value="Berlin Hbf" placeholder="primary text">
        <input type="text" id="previewSecondary" value="STATION" placeholder="secondary text" disabled>
        <div style="margin-left:auto; display:flex; gap:8px;" class="theme-controls-new">
          <div class="pill-swatch">
             <input type="color" id="themePrimaryFill" value="#ffffff" title="Primary Fill">
             <input type="color" id="themePrimaryText" value="#1a1a1a" title="Primary Text">
          </div>
          <div class="pill-swatch" id="themeSecondarySwatch" style="display:none">
             <input type="color" id="themeSecondaryFill" value="#1a1a1a" title="Secondary Fill">
             <input type="color" id="themeSecondaryText" value="#ffffff" title="Secondary Text">
          </div>
          <div class="pill-swatch single">
             <input type="color" id="themePointer" value="#ffffff" title="Pointer Fill">
          </div>
        </div>
      </div>
      <div class="typography-panels" style="display: flex; border-top: 1px solid var(--border);">
        <div class="typo-panel form" style="flex:1; padding: 12px 20px; border-right: 1px solid var(--border); padding-bottom: 12px;">
          <div class="subgroup-header" style="margin-top:0">Primary typography</div>
          {primary_typo_fields}
        </div>
        <div class="typo-panel form" id="secondaryTypoPanel" style="flex:1; padding: 12px 20px; display:none; padding-bottom: 12px;">
          <div class="subgroup-header" style="margin-top:0">Secondary typography</div>
          {secondary_typo_fields}
        </div>
      </div>
    </div>
    <div class="preview-area" """
html = re.sub(old_preview_header_pattern, new_preview_header, html, flags=re.DOTALL)

# Insert Right column form
new_right = f"""<!-- RIGHT: JSON output + validation -->
  <div class="col right">
    <div class="form" style="padding-top:20px; padding-bottom:20px;">
      <div class="group" style="border-top:none; padding-top:0;">
        <div class="group-header">Primary backplate <span class="badge">required</span></div>
        {primary_backplate_fields}

        <div class="subgroup-header" style="margin-top:16px;">Primary pointer</div>
        {primary_pointer_fields}
      </div>
      <div class="group" id="secondaryGroup" style="display:none">
        <div class="group-header">Secondary backplate</div>
        {secondary_backplate_fields}
      </div>
    </div>
    
    <div class="output-section" style="padding-top:0;">"""
html = html.replace('<!-- RIGHT: JSON output + validation -->\n  <div class="col right">\n    <div class="output-section">', new_right)


# JS updates
# Replace secondaryGroup toggles to also toggle the new containers
js_toggle_1 = "document.getElementById('secondaryGroup').style.display = manifest.kind === 'regular' ? 'block' : 'none';"
new_js_toggle_1 = """const disp = manifest.kind === 'regular' ? 'block' : 'none';
    document.getElementById('secondaryGroup').style.display = disp;
    document.getElementById('themeSecondarySwatch').style.display = disp;
    document.getElementById('secondaryTypoPanel').style.display = disp;"""
html = html.replace(js_toggle_1, new_js_toggle_1)

js_toggle_2 = "document.getElementById('secondaryGroup').style.display = state.kind === 'regular' ? 'block' : 'none';"
new_js_toggle_2 = """const disp = state.kind === 'regular' ? 'block' : 'none';
    document.getElementById('secondaryGroup').style.display = disp;
    document.getElementById('themeSecondarySwatch').style.display = disp;
    document.getElementById('secondaryTypoPanel').style.display = disp;"""
html = html.replace(js_toggle_2, new_js_toggle_2)

with open('../label sources/manifest-builder.html', 'w') as f:
    f.write(html)
print("Done")
