import re

with open('frontend/src/components/MapboxMap.tsx', 'r') as f:
    mapbox = f.read()

mmsi_start = mapbox.find("  const getMmsiFlagHtml = (mmsi: string | number) => {")
mmsi_end = mapbox.find("  };\n\n  const clearActiveDrawMarkers = () => {", mmsi_start) + 4

mmsi_func = mapbox[mmsi_start:mmsi_end].strip()

# Remove from MapboxMap
new_mapbox = mapbox[:mmsi_start] + mapbox[mmsi_end:]
with open('frontend/src/components/MapboxMap.tsx', 'w') as f:
    f.write(new_mapbox)

# Add to mapUtils.ts
mmsi_func_export = mmsi_func.replace("const getMmsiFlagHtml", "export const getMmsiFlagHtml")
with open('frontend/src/utils/mapUtils.ts', 'a') as f:
    f.write("\n" + mmsi_func_export + "\n")

# Update useAisStream.ts
with open('frontend/src/hooks/useAisStream.ts', 'r') as f:
    ais = f.read()

ais = ais.replace("import type { AppSettings } from '../types';", "import type { AppSettings } from '../types';\nimport { getMmsiFlagHtml } from '../utils/mapUtils';")
ais = ais.replace("    const map = map;\n", "")

with open('frontend/src/hooks/useAisStream.ts', 'w') as f:
    f.write(ais)

print("Moved getMmsiFlagHtml successfully.")
