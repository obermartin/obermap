import re

with open('../label sources/manifest-builder.html', 'r') as f:
    html = f.read()

# 1. Update JS to toggle secondaryTypoPanel
toggle_js = """
    const hasSecondary = manifest.kind === 'regular' || manifest.kind === 'both';
    document.getElementById('secondaryGroup').style.display = hasSecondary ? 'block' : 'none';
    const secTypo = document.getElementById('secondaryTypoPanel');
    if(secTypo) secTypo.style.display = hasSecondary ? 'block' : 'none';
    document.getElementById('previewSecondary').disabled = !hasSecondary;
"""
# Need to find the exact existing JS
html = re.sub(r"    document.getElementById\('secondaryGroup'\).style.display = (.*?);\n    document.getElementById\('previewSecondary'\).disabled = (.*?);\n", toggle_js.lstrip(), html)

# 2. Add Toggle switch CSS
toggle_css = """
/* Toggle Switch */
.toggle-switch {
  position: relative;
  display: inline-block;
  width: 28px;
  height: 16px;
}
.toggle-switch input {
  opacity: 0;
  width: 0;
  height: 0;
}
.toggle-slider {
  position: absolute;
  cursor: pointer;
  top: 0; left: 0; right: 0; bottom: 0;
  background-color: var(--border);
  transition: .4s;
  border-radius: 16px;
}
.toggle-slider:before {
  position: absolute;
  content: "";
  height: 12px;
  width: 12px;
  left: 2px;
  bottom: 2px;
  background-color: var(--text-muted);
  transition: .2s;
  border-radius: 50%;
}
input:checked + .toggle-slider {
  background-color: var(--accent);
}
input:checked + .toggle-slider:before {
  transform: translateX(12px);
  background-color: #000;
}

/* Circular Color Swatch */
.color-swatch-circle {
  padding: 0;
  width: 20px;
  height: 20px;
  border: none;
  background: transparent;
  cursor: pointer;
  border-radius: 50%;
  overflow: hidden;
}
.color-swatch-circle::-webkit-color-swatch-wrapper {
  padding: 0;
}
.color-swatch-circle::-webkit-color-swatch {
  border: none;
  border-radius: 50%;
}
"""
html = html.replace("</style>", toggle_css + "\n</style>")

# 3. Update the fields
# For Text Color line break: it is outside the flex wrapper right now. Let's move it inside!
# Primary typography flex wrapper ends at:
#             </div>
#             <input type="hidden" id="primaryTextAlign" value="center">
#           </div>
#           <div class="field" style="display: flex; align-items: center; justify-content: space-between;"><label style="margin-right:8px">text color</label><input type="color" id="primaryTextColor" value="#000000" style="padding:0; width: 32px; height: 24px; border: none; background: transparent; cursor: pointer; border-radius: 4px;"></div>
#         </div>

html = re.sub(
    r'            <input type="hidden" id="primaryTextAlign" value="center">\n          </div>\n          <div class="field" style="display: flex; align-items: center; justify-content: space-between;"><label style="margin-right:8px">text color</label><input type="color" id="primaryTextColor" value="#000000" style="padding:0; width: 32px; height: 24px; border: none; background: transparent; cursor: pointer; border-radius: 4px;"></div>',
    r'            <input type="hidden" id="primaryTextAlign" value="center">\n            <div class="field" style="margin:0; display:flex; align-items:center; gap:8px;"><label>text color</label><input type="color" id="primaryTextColor" value="#000000" class="color-swatch-circle"></div>\n          </div>',
    html
)

html = re.sub(
    r'            <input type="hidden" id="secondaryTextAlign" value="center">\n          </div>\n          <div class="field" style="display: flex; align-items: center; justify-content: space-between;"><label style="margin-right:8px">text color</label><input type="color" id="secondaryTextColor" value="#ffffff" style="padding:0; width: 32px; height: 24px; border: none; background: transparent; cursor: pointer; border-radius: 4px;"></div>',
    r'            <input type="hidden" id="secondaryTextAlign" value="center">\n            <div class="field" style="margin:0; display:flex; align-items:center; gap:8px;"><label>text color</label><input type="color" id="secondaryTextColor" value="#ffffff" class="color-swatch-circle"></div>\n          </div>',
    html
)

# 4. Update Override Color toggles
# Replace: <div class="field" style="display: flex; align-items: center; justify-content: space-between;"><label style="margin-right:8px">override color</label><div style="display:flex; align-items:center; gap:8px;"><input type="checkbox" id="X"><input type="color" id="Y" value="Z" style="..."></div></div>
# With: <div class="field" style="display: flex; align-items: center; gap:8px;"><label class="toggle-switch"><input type="checkbox" id="X"><span class="toggle-slider"></span></label><label style="flex:1">override color</label><input type="color" id="Y" value="Z" class="color-swatch-circle"></div>

def replace_override(match):
    id_chk = match.group(1)
    id_col = match.group(2)
    val_col = match.group(3)
    return f'<div class="field" style="display: flex; align-items: center; gap:8px;"><label class="toggle-switch"><input type="checkbox" id="{id_chk}"><span class="toggle-slider"></span></label><label style="flex:1">override color</label><input type="color" id="{id_col}" value="{val_col}" class="color-swatch-circle"></div>'

html = re.sub(
    r'<div class="field" style="display: flex; align-items: center; justify-content: space-between;"><label style="margin-right:8px">override color</label><div style="display:flex; align-items:center; gap:8px;"><input type="checkbox" id="([^"]+)"><input type="color" id="([^"]+)" value="([^"]+)"[^>]+></div></div>',
    replace_override,
    html
)

with open('../label sources/manifest-builder.html', 'w') as f:
    f.write(html)

print("UI tweaks applied")
