with open('/Users/obermartin/Documents/CURRENT/BILD/OBERMAP2/frontend/src/components/MapContainer.tsx', 'r') as f:
    content = f.read()

old_str = "transform: translate(-50%, -50%) scale(var(--export-annotation-scale, 1));"
new_str = "transform: translate(-50%, -50%); zoom: var(--export-annotation-scale, 1);"

content = content.replace(old_str, new_str)

with open('/Users/obermartin/Documents/CURRENT/BILD/OBERMAP2/frontend/src/components/MapContainer.tsx', 'w') as f:
    f.write(content)
print("Replaced!")
