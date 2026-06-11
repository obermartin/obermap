import re

with open('frontend/src/labels/LabelMarkerManager.ts', 'r') as f:
    ts = f.read()

# Chunk 1
old_1 = "function normalizeSvg(svgString: string, cssVarName: string): string {"
new_1 = "function normalizeSvg(svgString: string, cssVarName: string | null): string {"
if old_1 in ts:
    ts = ts.replace(old_1, new_1)
    print("Replaced chunk 1")

# Chunk 2
old_2 = """    if (fillVal && fillVal !== "none" && !fillVal.startsWith("url(")) {
      el.setAttribute("fill", `var(${cssVarName}, ${fillVal})`);
    }"""
new_2 = """    if (fillVal && fillVal !== "none" && !fillVal.startsWith("url(")) {
      if (cssVarName) {
        el.setAttribute("fill", `var(${cssVarName}, ${fillVal})`);
      } else {
        el.setAttribute("fill", fillVal);
      }
    }"""
if old_2 in ts:
    ts = ts.replace(old_2, new_2)
    print("Replaced chunk 2")

# Chunk 3
old_3 = """        if (manifest.kind !== "highlight") {
          const stray = await fetch(`${base}/secondary_pointer.svg${cb}`);
          if (stray.ok)
            console.warn(
              `Template "${name}" contains secondary_pointer.svg. Secondary backplates never have pointers. This file is ignored.`,
            );
        }"""
new_3 = """        if (manifest.kind !== "highlight") {
          const stray = await fetch(`${base}/secondary_pointer.svg${cb}`);
          if (stray.ok && stray.headers.get("content-type")?.includes("svg"))
            console.warn(
              `Template "${name}" contains secondary_pointer.svg. Secondary backplates never have pointers. This file is ignored.`,
            );
        }"""
if old_3 in ts:
    ts = ts.replace(old_3, new_3)
    print("Replaced chunk 3")

# Chunk 4
old_4 = """        const normalizedFetches = fetches.map((svgString, idx) => {
          let cssVar = "--primary-backplate-fill";
          if (manifest.kind !== "highlight" && idx >= 4) {
            cssVar = "--secondary-backplate-fill";
          } else if (idx === 3) {
            cssVar = manifest.primary.pointer.overrideColor
              ? "--pointer-fill"
              : "--primary-backplate-fill";
          }
          return normalizeSvg(svgString, cssVar);"""
new_4 = """        const normalizedFetches = fetches.map((svgString, idx) => {
          let cssVar: string | null = "--primary-backplate-fill";
          if (manifest.kind !== "highlight" && idx >= 4) {
            cssVar = manifest.secondary?.overrideColor ? "--secondary-backplate-fill" : null;
          } else if (idx === 3) {
            cssVar = manifest.primary.pointer?.overrideColor ? "--pointer-fill" : null;
          } else {
            cssVar = manifest.primary?.overrideColor ? "--primary-backplate-fill" : null;
          }
          return normalizeSvg(svgString, cssVar);"""
if old_4 in ts:
    ts = ts.replace(old_4, new_4)
    print("Replaced chunk 4")

with open('frontend/src/labels/LabelMarkerManager.ts', 'w') as f:
    f.write(ts)
print("Finished writing LabelMarkerManager.ts")
