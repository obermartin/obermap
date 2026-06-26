import re

with open('frontend/src/components/MapContainer.tsx', 'r') as f:
    content = f.read()

# Inside the Canvas drawing loop, let's extract `ann` from `props.annotations`:
# The loop starts with `Object.entries(map1MarkersRef.current).forEach(([id, markerInfo]) => {`
# We'll inject `const ann = props.annotations.find(a => a.id === id);`
# And then replace `window.getComputedStyle(plate).backgroundColor` with `(ann ? ann.color : window.getComputedStyle(plate).backgroundColor)`

injection = """
        Object.entries(map1MarkersRef.current).forEach(([id, markerInfo]) => {
          const ann = props.annotations.find(a => a.id === id);
"""

content = content.replace(
    "Object.entries(map1MarkersRef.current).forEach(([id, markerInfo]) => {",
    injection
)

# For highlight marker dot:
content = content.replace(
    "ctx.fillStyle = window.getComputedStyle(innerEl).backgroundColor || '#000';",
    "ctx.fillStyle = (ann && ann.color) ? ann.color : (window.getComputedStyle(innerEl).backgroundColor || '#000');"
)

# For highlight marker plate:
content = content.replace(
    "ctx.fillStyle = window.getComputedStyle(plate).backgroundColor || '#000';",
    "ctx.fillStyle = (ann && ann.color) ? ann.color : (window.getComputedStyle(plate).backgroundColor || '#000');"
)

with open('frontend/src/components/MapContainer.tsx', 'w') as f:
    f.write(content)
