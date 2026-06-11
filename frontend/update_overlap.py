import re

# 1. Update manifest-builder.html
with open('../label sources/manifest-builder.html', 'r') as f:
    html = f.read()

# Remove min="0" from secondaryGap
html = html.replace('<input type="number" id="secondaryGap" value="4" min="0">', '<input type="number" id="secondaryGap" value="4">')

# Add zIndex to secondary.el
html = html.replace("secondary.el.style.position = 'absolute';", "secondary.el.style.position = 'absolute';\n    secondary.el.style.zIndex = '2';")

with open('../label sources/manifest-builder.html', 'w') as f:
    f.write(html)


# 2. Update LabelMarkerManager.ts
with open('../frontend/src/labels/LabelMarkerManager.ts', 'r') as f:
    ts = f.read()

# Add z-index: 2 to secondary backplates
ts = ts.replace(
    '<div class="backplate secondary" style="position: absolute;',
    '<div class="backplate secondary" style="position: absolute; z-index: 2;'
)

with open('../frontend/src/labels/LabelMarkerManager.ts', 'w') as f:
    f.write(ts)

print("Overlap updates applied")
