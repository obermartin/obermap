with open('frontend/src/components/MapboxMap.tsx', 'r') as f:
    text = f.read()

# remove the invalid props
text = text.replace("    mapStyleKey,\n", "")
text = text.replace("    forceRemount,\n", "")
text = text.replace("    t\n  });", "  });")

with open('frontend/src/components/MapboxMap.tsx', 'w') as f:
    f.write(text)

with open('frontend/src/hooks/useMapInitialization.ts', 'r') as f:
    hook = f.read()

import re

# remove from MapInitializationProps
hook = re.sub(r'  mapStyleKey: number;\n', '', hook)
hook = re.sub(r'  forceRemount: number;\n', '', hook)
hook = re.sub(r'  t: any;\n', '', hook)

# remove from destructured args
hook = re.sub(r'  mapStyleKey,\n', '', hook)
hook = re.sub(r'  forceRemount,\n', '', hook)
hook = re.sub(r'  t\n}: MapInitializationProps\)', '}: MapInitializationProps)', hook)

with open('frontend/src/hooks/useMapInitialization.ts', 'w') as f:
    f.write(hook)

print("Fixed useMapInitialization props!")
