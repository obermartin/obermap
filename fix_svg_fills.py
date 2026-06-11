import re

with open('label sources/manifest-builder.html', 'r') as f:
    html = f.read()

# Fix manifest-builder.html
old_builder = """        const allEls = doc.querySelectorAll("*");
        allEls.forEach((el) => {
          if (el.hasAttribute("fill")) {
            const fillVal = el.getAttribute("fill");
            if (fillVal && fillVal !== "none" && !fillVal.startsWith("url(")) {
              el.setAttribute("fill", `var(${cssVarName}, ${fillVal})`);
            }
          }
        });"""

new_builder = """        const allEls = doc.querySelectorAll("*");
        allEls.forEach((el) => {
          let fillVal = el.getAttribute("fill");
          if (el.style && el.style.fill) {
            fillVal = el.style.fill;
            el.style.removeProperty("fill");
          }
          if (fillVal && fillVal !== "none" && !fillVal.startsWith("url(")) {
            el.setAttribute("fill", `var(${cssVarName}, ${fillVal})`);
          }
        });"""

html = html.replace(old_builder, new_builder)
with open('label sources/manifest-builder.html', 'w') as f:
    f.write(html)


with open('frontend/src/labels/LabelMarkerManager.ts', 'r') as f:
    ts = f.read()

# Fix LabelMarkerManager.ts
old_manager = """    if (el.hasAttribute('fill')) {
      const fillVal = el.getAttribute('fill');
      if (fillVal && fillVal !== 'none' && !fillVal.startsWith('url(')) {
        el.setAttribute('fill', `var(${cssVarName}, ${fillVal})`);
      }
    }"""

new_manager = """    let fillVal = el.getAttribute('fill');
    if (el.style && el.style.fill) {
      fillVal = el.style.fill;
      el.style.removeProperty('fill');
    }
    if (fillVal && fillVal !== 'none' && !fillVal.startsWith('url(')) {
      el.setAttribute('fill', `var(${cssVarName}, ${fillVal})`);
    }"""

ts = ts.replace(old_manager, new_manager)
with open('frontend/src/labels/LabelMarkerManager.ts', 'w') as f:
    f.write(ts)

print("SVG fill handling fixed")
