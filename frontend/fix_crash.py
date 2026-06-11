import re

with open('../label sources/manifest-builder.html', 'r') as f:
    html = f.read()

# Remove the themeSecondarySwatch line
html = html.replace("    document.getElementById('themeSecondarySwatch').style.display = disp;\n", "")

with open('../label sources/manifest-builder.html', 'w') as f:
    f.write(html)

print("Crash fixed")
