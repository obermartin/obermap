import re

with open('../label sources/manifest-builder.html', 'r') as f:
    html = f.read()

# 1. Update kind toggle to include 'both'
kind_toggle_pattern = r'<div class="kind-toggle">\s*<button class="active" data-kind="highlight">Highlight</button>\s*<button data-kind="regular">Regular</button>\s*</div>'
kind_toggle_replacement = """<div class="kind-toggle">
            <button class="active" data-kind="highlight">Highlight</button>
            <button data-kind="regular">Regular</button>
            <button data-kind="both">Both</button>
          </div>"""
html = re.sub(kind_toggle_pattern, kind_toggle_replacement, html)

# Update kind logic
html = html.replace("const disp = state.kind === 'regular' ? 'block' : 'none';", "const disp = state.kind !== 'highlight' ? 'block' : 'none';")
html = html.replace("manifest.kind === 'highlight' || manifest.kind === 'regular'", "manifest.kind === 'highlight' || manifest.kind === 'regular' || manifest.kind === 'both'")
html = html.replace("const disp = manifest.kind === 'regular' ? 'block' : 'none';", "const disp = manifest.kind !== 'highlight' ? 'block' : 'none';")
html = html.replace("if (state.kind === 'regular') {", "if (state.kind !== 'highlight') {")
html = html.replace("if (manifest.kind === 'regular') {", "if (manifest.kind !== 'highlight') {")
html = html.replace("const secondary = manifest.kind === 'regular' && secondaryText.trim()", "const secondary = manifest.kind !== 'highlight' && secondaryText.trim()")

# 2. Update pointer attachFrom logic
# For bottom / top
html = html.replace(
    "pointerLeft = primaryOffsetX + (pt.attachFrom === 'right' ? primary.width - pt.attachOffset - pt.tipX : pt.attachOffset - pt.tipX);",
    "pointerLeft = primaryOffsetX + (pt.attachFrom === 'right' ? primary.width - pt.attachOffset - pt.tipX : pt.attachFrom === 'center' ? (primary.width / 2) - pt.tipX : pt.attachOffset - pt.tipX);"
)

# For left / right
html = html.replace(
    "pointerTop = primaryOffsetY + (pt.attachFrom === 'bottom' ? primary.height - pt.attachOffset - pt.tipY : pt.attachOffset - pt.tipY);",
    "pointerTop = primaryOffsetY + (pt.attachFrom === 'bottom' ? primary.height - pt.attachOffset - pt.tipY : pt.attachFrom === 'center' ? (primary.height / 2) - pt.tipY : pt.attachOffset - pt.tipY);"
)


with open('../label sources/manifest-builder.html', 'w') as f:
    f.write(html)
print("Done")
