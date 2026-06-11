import re

with open('../label sources/manifest-builder.html', 'r') as f:
    html = f.read()

# 1. Change attachFrom dropdown to icon group (left/right alignment icons)
attach_from_svgs = """<div class="icon-toggle" id="pointerAttachFromGrp" data-target="pointerAttachFrom">
              <button class="active" data-val="left" title="Left"><svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><rect x="2" y="2" width="1.5" height="12"/><rect x="3.5" y="4" width="6" height="3"/><rect x="3.5" y="9" width="10" height="3"/></svg></button>
              <button data-val="right" title="Right"><svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><rect x="12.5" y="2" width="1.5" height="12"/><rect x="6.5" y="4" width="6" height="3"/><rect x="2.5" y="9" width="10" height="3"/></svg></button>
            </div>
            <input type="hidden" id="pointerAttachFrom" value="left">"""

attach_from_pattern = r'<div class="field"><label>attachFrom</label><select id="pointerAttachFrom"><option>left</option><option>right</option></select></div>'
attach_from_replacement = '<div class="field"><label>attachFrom</label>' + attach_from_svgs + '</div>'
html = html.replace(attach_from_pattern, attach_from_replacement)

# 2. Fix widths for typography numeric inputs
html = html.replace('width:44px;', 'width:60px;')
html = html.replace('width:50px;', 'width:60px;')

# 3. Change "Primary pointer" heading to "Pointer"
html = html.replace('<div class="group-header">Primary pointer</div>', '<div class="group-header">Pointer</div>')

with open('../label sources/manifest-builder.html', 'w') as f:
    f.write(html)
print("Done")
