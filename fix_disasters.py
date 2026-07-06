import re

with open('frontend/src/components/MapboxMap.tsx', 'r') as f:
    content = f.read()

# 1. Add back the refs to MapboxMap.tsx
refs = """
  const selectedEarthquakeRef = useRef(selectedEarthquake);
  const selectedCemsEarthquakeRef = useRef(selectedCemsEarthquake);
  const selectedVolcanoRef = useRef(selectedVolcano);
  const cemsFeatureCacheRef = useRef<Record<string, any>>({});
  const allCemsActivationsRef = useRef<any[]>([]);

  useEffect(() => {
    selectedEarthquakeRef.current = selectedEarthquake;
  }, [selectedEarthquake]);

  useEffect(() => {
    selectedCemsEarthquakeRef.current = selectedCemsEarthquake;
  }, [selectedCemsEarthquake]);

  useEffect(() => {
    selectedVolcanoRef.current = selectedVolcano;
  }, [selectedVolcano]);
"""

# Insert right after the hook call
hook_end = "} = useDisasterAlerts(mapRef.current, mapLoaded, settings);\n"
if hook_end in content:
    content = content.replace(hook_end, hook_end + refs)
    print("Added refs back to MapboxMap.")
else:
    print("Could not find hook_end in MapboxMap.")

with open('frontend/src/components/MapboxMap.tsx', 'w') as f:
    f.write(content)

# 2. Fix useDisasterAlerts.ts
with open('frontend/src/hooks/useDisasterAlerts.ts', 'r') as f:
    hook_content = f.read()

# Add useRef
hook_content = hook_content.replace("import { useState, useEffect } from 'react';", "import { useState, useEffect, useRef } from 'react';")

# Add safeFetchCemsJson if not present
if "safeFetchCemsJson" not in hook_content and "parseWKT" in hook_content:
    # Need to import safeFetchCemsJson from mapUtils
    hook_content = hook_content.replace("import { parseWKT, haversineDistance } from '../utils/mapUtils';", "import { parseWKT, haversineDistance, safeFetchCemsJson } from '../utils/mapUtils';")

with open('frontend/src/hooks/useDisasterAlerts.ts', 'w') as f:
    f.write(hook_content)

print("Fixed useDisasterAlerts.ts")
