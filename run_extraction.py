import re

with open('frontend/src/components/MapboxMap.tsx', 'r') as f:
    content = f.read()

# 1. State Block
state_block_regex = r"(  const \[selectedEarthquake, setSelectedEarthquakeState\] = useState[\s\S]*?const \[selectedVolcanoPolygon, setSelectedVolcanoPolygon\] = useState<any>\(null\);\n)"
match = re.search(state_block_regex, content)
state_block = match.group(1) if match else ""

# 2. CEMS Features Effect
cems_features_regex = r"(  useEffect\(\(\) => \{\n    if \(\!selectedCemsEarthquake\) \{[\s\S]*?\}, \[selectedCemsEarthquake\]\);\n)"
match = re.search(cems_features_regex, content)
cems_features_block = match.group(1) if match else ""

# 3. Big Effect Block
big_block_regex = r"(  useEffect\(\(\) => \{\n    if \(\!selectedEarthquake\) \{\n      setSelectedEarthquakeShakemap\(null\);[\s\S]*?return \(\) => \{ isSubscribed = false; \};\n  \}, \[selectedVolcano\]\);\n)"
match = re.search(big_block_regex, content)
big_block = match.group(1) if match else ""

hook_code = f"""import {{ useState, useEffect }} from 'react';
import type {{ AppSettings }} from '../types';
import {{ parseWKT, haversineDistance }} from '../utils/mapUtils';

export const useDisasterAlerts = (
  map: maplibregl.Map | null,
  mapLoaded: boolean,
  settings: AppSettings
) => {{
{state_block}

{cems_features_block}

{big_block}

  return {{
    selectedEarthquake,
    setSelectedEarthquakeState,
    selectedEarthquakeShakemap,
    selectedEarthquakeUsgsDyfi10km,
    selectedEarthquakeUsgsDyfi1km,
    selectedEarthquakeUsgsLandslide,
    selectedEarthquakeUsgsLiquefaction,
    selectedCemsEarthquake,
    setSelectedCemsEarthquakeState,
    selectedCemsEarthquakeFeatures,
    activeCemsWildfireFeatures,
    setActiveCemsWildfireFeatures,
    activeCemsFloodFeatures,
    setActiveCemsFloodFeatures,
    selectedVolcano,
    setSelectedVolcanoState,
    selectedVolcanoPolygon,
  }};
}};
"""

with open('frontend/src/hooks/useDisasterAlerts.ts', 'w') as f:
    f.write(hook_code)

# Remove from MapboxMap
new_content = content.replace(state_block, "")
new_content = new_content.replace(cems_features_block, "")
new_content = new_content.replace(big_block, "")

# We need to insert the hook call in MapboxMap
hook_call = """
  const {
    selectedEarthquake,
    setSelectedEarthquakeState,
    selectedEarthquakeShakemap,
    selectedEarthquakeUsgsDyfi10km,
    selectedEarthquakeUsgsDyfi1km,
    selectedEarthquakeUsgsLandslide,
    selectedEarthquakeUsgsLiquefaction,
    selectedCemsEarthquake,
    setSelectedCemsEarthquakeState,
    selectedCemsEarthquakeFeatures,
    activeCemsWildfireFeatures,
    setActiveCemsWildfireFeatures,
    activeCemsFloodFeatures,
    setActiveCemsFloodFeatures,
    selectedVolcano,
    setSelectedVolcanoState,
    selectedVolcanoPolygon,
  } = useDisasterAlerts(mapRef.current, mapLoaded, settings);
"""
# Insert after mapLoaded state
new_content = new_content.replace("  const [mapLoaded, setMapLoaded] = useState(false);\n", "  const [mapLoaded, setMapLoaded] = useState(false);\n" + hook_call)

# Add import
new_content = new_content.replace("import { useVideoExport } from '../hooks/useVideoExport';", "import { useVideoExport } from '../hooks/useVideoExport';\nimport { useDisasterAlerts } from '../hooks/useDisasterAlerts';")

with open('frontend/src/components/MapboxMap.tsx', 'w') as f:
    f.write(new_content)

print("Extraction script completed.")
