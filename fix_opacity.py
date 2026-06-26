import re

with open('frontend/src/components/MapContainer.tsx', 'r') as f:
    content = f.read()

content = content.replace(
    "const opacity = parseFloat(window.getComputedStyle(innerEl).opacity || window.getComputedStyle(el).opacity || '1');\n          ctx.globalAlpha = opacity;",
    "let opacity = parseFloat(window.getComputedStyle(innerEl).opacity || window.getComputedStyle(el).opacity || '1');\n          if (isNaN(opacity)) opacity = 1;\n          ctx.globalAlpha = opacity;"
)

with open('frontend/src/components/MapContainer.tsx', 'w') as f:
    f.write(content)
