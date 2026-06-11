import re

with open('../frontend/src/labels/LabelMarkerManager.ts', 'r') as f:
    ts = f.read()

ts = re.sub(r'      console\.warn\(`Template \$\{opts\.template\} not found`\);\n      return null;', r'      throw new Error(`Template ${opts.template} not found`);', ts)

with open('../frontend/src/labels/LabelMarkerManager.ts', 'w') as f:
    f.write(ts)

print("Fixed return null")
