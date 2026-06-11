import re

with open('frontend/src/labels/LabelMarkerManager.ts', 'r') as f:
    ts = f.read()

old_var = """          } else if (idx === 3) {
            cssVar = manifest.primary.pointer.independentColor
              ? "--pointer-fill"
              : "--primary-backplate-fill";
          }"""

new_var = """          } else if (idx === 3) {
            cssVar = manifest.primary.pointer.overrideColor
              ? "--pointer-fill"
              : "--primary-backplate-fill";
          }"""

if old_var in ts:
    ts = ts.replace(old_var, new_var)
    with open('frontend/src/labels/LabelMarkerManager.ts', 'w') as f:
        f.write(ts)
    print("Pointer var fixed")
else:
    print("Could not find old_var")
