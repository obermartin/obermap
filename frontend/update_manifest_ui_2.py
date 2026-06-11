import re

with open('../label sources/manifest-builder.html', 'r') as f:
    html = f.read()

# 1. Remove horizontal line above "Template"
# The form has <div class="group">. We can add style="border-top:none; padding-top:0;" to it.
html = re.sub(
    r'<div class="form" style="padding: 20px 20px 0;">\s*<div class="group">',
    '<div class="form" style="padding: 20px 20px 0;">\n      <div class="group" style="border-top:none; padding-top:0;">',
    html
)

# 2. Remove "name" setting
name_setting_pattern = r'<div class="field full">\s*<label>name</label>\s*<input type="text" id="name" value="my-template">\s*<div class="help-text">.*?</div>\s*</div>'
html = re.sub(name_setting_pattern, '', html, flags=re.DOTALL)

# 3. Change all "left/center/right" alignment dropdowns to SVG icon groups
align_svgs = """<div class="icon-toggle" id="{id}Grp" data-target="{id}">
              <button data-val="left" title="Left"><svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><rect x="2" y="2" width="1.5" height="12"/><rect x="3.5" y="4" width="6" height="3"/><rect x="3.5" y="9" width="10" height="3"/></svg></button>
              <button class="active" data-val="center" title="Center"><svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><rect x="7.25" y="2" width="1.5" height="12"/><rect x="5" y="4" width="6" height="3"/><rect x="2" y="9" width="12" height="3"/></svg></button>
              <button data-val="right" title="Right"><svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><rect x="12.5" y="2" width="1.5" height="12"/><rect x="6.5" y="4" width="6" height="3"/><rect x="2.5" y="9" width="10" height="3"/></svg></button>
            </div>
            <input type="hidden" id="{id}" value="center">"""

# For secondaryAlign
secondary_align_pattern = r'<div class="field"><label>align</label><select id="secondaryAlign"><option>center</option><option>left</option><option>right</option></select></div>'
secondary_align_replacement = '<div class="field"><label>align</label>' + align_svgs.replace('{id}', 'secondaryAlign') + '</div>'
html = html.replace(secondary_align_pattern, secondary_align_replacement)


# 4. Remove "independentcolor" checkbox
independent_color_pattern = r'<label class="checkbox-field"><input type="checkbox" id="pointerIndependentColor"> independentColor \(pointer uses --pointer-fill\)</label>'
html = re.sub(independent_color_pattern, '<input type="hidden" id="pointerIndependentColor" value="false">', html)


# 5. Style primary pointer heading like backplate
pointer_heading_pattern = r'<div class="subgroup-header" style="margin-top:16px;">Primary pointer</div>'
pointer_heading_replacement = '</div><div class="group"><div class="group-header">Primary pointer</div>'
html = html.replace(pointer_heading_pattern, pointer_heading_replacement)


# 6. Change pointer attachEdge dropdown to icon group
attach_edge_svgs = """<div class="icon-toggle" id="pointerAttachEdgeGrp" data-target="pointerAttachEdge">
              <button class="active" data-val="bottom" title="Bottom"><svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><rect x="3" y="2" width="10" height="8"/><polygon points="6,10 10,10 8,14"/></svg></button>
              <button data-val="top" title="Top"><svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><rect x="3" y="6" width="10" height="8"/><polygon points="6,6 10,6 8,2"/></svg></button>
              <button data-val="left" title="Left"><svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><rect x="6" y="3" width="8" height="10"/><polygon points="6,6 6,10 2,8"/></svg></button>
              <button data-val="right" title="Right"><svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><rect x="2" y="3" width="8" height="10"/><polygon points="10,6 10,10 14,8"/></svg></button>
            </div>
            <input type="hidden" id="pointerAttachEdge" value="bottom">"""

attach_edge_pattern = r'<div class="field"><label>attachEdge</label><select id="pointerAttachEdge"><option>bottom</option><option>top</option><option>left</option><option>right</option></select></div>'
attach_edge_replacement = '<div class="field"><label>edge</label>' + attach_edge_svgs + '</div>'
html = html.replace(attach_edge_pattern, attach_edge_replacement)


# 7. Change secondary backplate position dropdown to icon group
position_svgs = """<div class="icon-toggle" id="secondaryPositionGrp" data-target="secondaryPosition">
              <button class="active" data-val="below" title="Below"><svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><rect x="4" y="2" width="8" height="6" opacity="0.3"/><rect x="3" y="10" width="10" height="4"/></svg></button>
              <button data-val="above" title="Above"><svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><rect x="3" y="2" width="10" height="4"/><rect x="4" y="8" width="8" height="6" opacity="0.3"/></svg></button>
            </div>
            <input type="hidden" id="secondaryPosition" value="below">"""

position_pattern = r'<div class="field"><label>position</label><select id="secondaryPosition"><option>below</option><option>above</option></select></div>'
position_replacement = '<div class="field"><label>position</label>' + position_svgs + '</div>'
html = html.replace(position_pattern, position_replacement)


# Update JS for reading independentColor from hidden input or if it's completely gone:
# Actually we can just leave it as an input type="hidden", but checkbox uses .checked. 
# Let's change the JS to read boolean false directly.
js_independent_color_pattern = r"independentColor: document\.getElementById\('pointerIndependentColor'\)\.checked,"
html = re.sub(js_independent_color_pattern, "independentColor: false,", html)


with open('../label sources/manifest-builder.html', 'w') as f:
    f.write(html)
print("Done")
