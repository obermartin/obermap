import re

with open('../frontend/src/labels/LabelMarkerManager.ts', 'r') as f:
    ts = f.read()

# Fix 1: Type 'null' is not assignable to type 'LabelHandle'
ts = ts.replace("      console.warn(`Template ${opts.template} not found`);\n      return null;", "      throw new Error(`Template ${opts.template} not found`);")

# Fix 2: Property 'overrideColor' does not exist on type 'Pointer'
# Actually, the interface might be named something else. Let's search for "export interface" in LabelMarkerManager.ts
# Let's just look at the exact file contents instead of blindly regexing, to fix 3 and 4.
