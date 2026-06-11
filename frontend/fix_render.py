import re

with open('../label sources/manifest-builder.html', 'r') as f:
    html = f.read()

html = html.replace(
    "    color: ${role === 'primary' ? state.theme.primaryTextColor : state.theme.secondaryTextColor};",
    "    color: ${config.typography.color};"
)

with open('../label sources/manifest-builder.html', 'w') as f:
    f.write(html)

print("Render fixed")
