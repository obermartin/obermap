import re

with open('label sources/manifest-builder.html', 'r') as f:
    html = f.read()

# Remove these CSS variables from :root
defaults = """    /* Defaults used by the live preview */
    --primary-backplate-fill: #ffffff;
    --primary-text-color: #1a1a1a;
    --secondary-backplate-fill: #1a1a1a;
    --secondary-text-color: #ffffff;
    --pointer-fill: var(--primary-backplate-fill);
    --accent-fill: #d4ff3f;"""
html = html.replace(defaults, "")

with open('label sources/manifest-builder.html', 'w') as f:
    f.write(html)

print("Builder CSS defaults removed")
