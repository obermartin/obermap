with open('../label sources/manifest-builder.html', 'r') as f:
    html = f.read()

# 1. Pass validKey to parseSvgDimensions
html = html.replace('const dims = parseSvgDimensions(text);', 'const dims = parseSvgDimensions(text, validKey);')

# 2. Update parseSvgDimensions definition
html = html.replace('function parseSvgDimensions(svgText) {', 'function parseSvgDimensions(svgText, validKey) {')

# 3. Add variable injection logic before XMLSerializer
injection_logic = """
  let cssVarName = '--primary-backplate-fill';
  if (validKey && validKey.startsWith('secondary')) {
    cssVarName = '--secondary-backplate-fill';
  } else if (validKey === 'primary_pointer') {
    cssVarName = '--pointer-fill';
  }

  const allEls = doc.querySelectorAll('*');
  allEls.forEach(el => {
    if (el.hasAttribute('fill')) {
      const fillVal = el.getAttribute('fill');
      if (fillVal && fillVal !== 'none' && !fillVal.startsWith('url(')) {
        el.setAttribute('fill', `var(${cssVarName}, ${fillVal})`);
      }
    }
  });

  // Serialize the normalized SVG back to a string
"""
html = html.replace('// Serialize the normalized SVG back to a string', injection_logic)

with open('../label sources/manifest-builder.html', 'w') as f:
    f.write(html)

print("Builder var injection updated")
