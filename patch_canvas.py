import re

with open('frontend/src/components/MapContainer.tsx', 'r') as f:
    content = f.read()

# Replace innerEl.style.opacity || el.style.opacity || '1'
content = content.replace(
    "const opacity = parseFloat(innerEl.style.opacity || el.style.opacity || '1');",
    "const opacity = parseFloat(window.getComputedStyle(innerEl).opacity || window.getComputedStyle(el).opacity || '1');"
)

# Replace all element.style.color or element.style.backgroundColor with getComputedStyle
content = re.sub(r'([a-zA-Z0-9_]+)\.style\.backgroundColor', r'window.getComputedStyle(\1).backgroundColor', content)
content = re.sub(r'([a-zA-Z0-9_]+)\.style\.borderColor', r'window.getComputedStyle(\1).borderColor', content)
content = re.sub(r'([a-zA-Z0-9_]+)\.style\.color', r'window.getComputedStyle(\1).color', content)
content = re.sub(r'([a-zA-Z0-9_]+)\.style\.clipPath', r'window.getComputedStyle(\1).clipPath', content)
content = re.sub(r'([a-zA-Z0-9_]+)\.style\.transform', r'window.getComputedStyle(\1).transform', content)

with open('frontend/src/components/MapContainer.tsx', 'w') as f:
    f.write(content)
