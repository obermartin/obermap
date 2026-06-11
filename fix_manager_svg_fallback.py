import re

with open('frontend/src/labels/LabelMarkerManager.ts', 'r') as f:
    ts = f.read()

old_replaces = """    // Canvas drawImage ignores CSS variables in data URIs, so we explicitly replace them with literal values
    svg = svg.replace(/var\(--primary-backplate-fill,\s*([^)]+)\)/g, theme?.primaryBackplateFill || '$1');
    svg = svg.replace(/var\(--secondary-backplate-fill,\s*([^)]+)\)/g, theme?.secondaryBackplateFill || '$1');
    svg = svg.replace(/var\(--pointer-fill,\s*([^)]+)\)/g, theme?.pointerFill || theme?.primaryBackplateFill || '$1');
    svg = svg.replace(/var\(--primary-text-color,\s*([^)]+)\)/g, theme?.primaryTextColor || '$1');
    svg = svg.replace(/var\(--secondary-text-color,\s*([^)]+)\)/g, theme?.secondaryTextColor || '$1');"""

new_replaces = """    // Canvas drawImage ignores CSS variables in data URIs, so we explicitly replace them with literal values
    svg = svg.replace(/var\(--primary-backplate-fill,\s*([^)]+)\)/g, theme?.primaryBackplateFill || manifest.primary.color || '$1');
    svg = svg.replace(/var\(--secondary-backplate-fill,\s*([^)]+)\)/g, theme?.secondaryBackplateFill || manifest.secondary?.color || '$1');
    svg = svg.replace(/var\(--pointer-fill,\s*([^)]+)\)/g, theme?.pointerFill || manifest.primary.pointer.color || '$1');
    svg = svg.replace(/var\(--primary-text-color,\s*([^)]+)\)/g, theme?.primaryTextColor || manifest.primary.typography.color || '$1');
    svg = svg.replace(/var\(--secondary-text-color,\s*([^)]+)\)/g, theme?.secondaryTextColor || manifest.secondary?.typography?.color || '$1');"""

# Prettier might have formatted the code, let's use regex instead if needed
if old_replaces in ts:
    ts = ts.replace(old_replaces, new_replaces)
else:
    # Try regex approach
    ts = re.sub(
        r'svg = svg\.replace\([\s\S]*?theme\?\.secondaryTextColor \|\| "\$1",\n    \);',
        """    svg = svg.replace(
      /var\(--primary-backplate-fill,\s*([^)]+)\)/g,
      theme?.primaryBackplateFill || manifest.primary.color || "$1",
    );
    svg = svg.replace(
      /var\(--secondary-backplate-fill,\s*([^)]+)\)/g,
      theme?.secondaryBackplateFill || manifest.secondary?.color || "$1",
    );
    svg = svg.replace(
      /var\(--pointer-fill,\s*([^)]+)\)/g,
      theme?.pointerFill || manifest.primary.pointer.color || "$1",
    );
    svg = svg.replace(
      /var\(--primary-text-color,\s*([^)]+)\)/g,
      theme?.primaryTextColor || manifest.primary.typography.color || "$1",
    );
    svg = svg.replace(
      /var\(--secondary-text-color,\s*([^)]+)\)/g,
      theme?.secondaryTextColor || manifest.secondary?.typography?.color || "$1",
    );""",
        ts
    )

with open('frontend/src/labels/LabelMarkerManager.ts', 'w') as f:
    f.write(ts)

print("Manager SVG fallbacks fixed")
