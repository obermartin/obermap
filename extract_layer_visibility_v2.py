import re

with open('frontend/src/components/MapboxMap.tsx', 'r') as f:
    mapbox = f.read()

# Start string
start_str = "  // Synchronize dynamic map layers\n  useEffect(() => {"
start_idx = mapbox.find(start_str)

# Find the specific end dependency array
end_dep = "selectedCemsEarthquake, selectedCemsEarthquakeFeatures]);\n"
end_idx = mapbox.find(end_dep, start_idx) + len(end_dep)

effect_block = mapbox[start_idx:end_idx]

# We also need layerFadeTimeoutsRef, deepstateDataCacheRef, gdacsDataCacheRef, globalDeepstateHistory, globalDeepstateHistoryPromise
refs_to_move = [
    "  const layerFadeTimeoutsRef = useRef<Record<string, any>>({});\n",
    "  const deepstateDataCacheRef = useRef<{ [cacheKey: string]: any }>({});\n",
    "  const gdacsDataCacheRef = useRef<{ [cacheKey: string]: any }>({});\n"
]

globals_to_move = """
let globalDeepstateHistory: { id: number; createdAt: string }[] | null = null;
let globalDeepstateHistoryPromise: Promise<{ id: number; createdAt: string; }[] | null> | null = null;
"""

clean_effect_block = effect_block.replace("mapRef.current", "map")
clean_effect_block = clean_effect_block.replace("  // Synchronize dynamic map layers\n", "")

hook_content = f"""import {{ useEffect, useRef }} from 'react';
import type {{ AppSettings }} from '../types';
import {{ parseWKT }} from '../utils/mapUtils';

{globals_to_move}

export interface LayerVisibilityProps {{
  map: maplibregl.Map | null;
  mapLoaded: boolean;
  settings: AppSettings;
  activeTool: string | null;
  revealedTriggers: Set<string>;
  hiddenTriggers: Set<string>;
  selectedAircraftId: string | null;
  selectedVesselMmsi: string | null;
  selectedWeatherTime: string | null;
  weatherValidTimes: string[];
  selectedEarthquake: any;
  selectedVolcano: any;
  selectedEarthquakeShakemap: any;
  selectedVolcanoPolygon: any;
  selectedCemsEarthquake: any;
  selectedCemsEarthquakeFeatures: any;
  getEffectiveLayerDates: (l: any) => {{ start: string, end: string }};
}}

export const useLayerVisibility = (props: LayerVisibilityProps) => {{
  const {{
    map, mapLoaded, settings, activeTool, revealedTriggers, hiddenTriggers,
    selectedAircraftId, selectedVesselMmsi, selectedWeatherTime, weatherValidTimes,
    selectedEarthquake, selectedVolcano, selectedEarthquakeShakemap, selectedVolcanoPolygon,
    selectedCemsEarthquake, selectedCemsEarthquakeFeatures, getEffectiveLayerDates
  }} = props;

  const layerFadeTimeoutsRef = useRef<Record<string, any>>({{}});
  const deepstateDataCacheRef = useRef<{{ [cacheKey: string]: any }}>({{}});
  const gdacsDataCacheRef = useRef<{{ [cacheKey: string]: any }}>({{}});

{clean_effect_block}
}};
"""

with open('frontend/src/hooks/useLayerVisibility.ts', 'w') as f:
    f.write(hook_content)

# Remove from MapboxMap.tsx
new_mapbox = mapbox[:start_idx] + mapbox[end_idx:]

for ref in refs_to_move:
    new_mapbox = new_mapbox.replace(ref, "")

# Remove globals
new_mapbox = new_mapbox.replace("let globalDeepstateHistory: { id: number; createdAt: string }[] | null = null;\nlet globalDeepstateHistoryPromise: Promise<{ id: number; createdAt: string; }[] | null> | null = null;\n", "")

hook_call = """
  useLayerVisibility({
    map: mapRef.current,
    mapLoaded,
    settings,
    activeTool,
    revealedTriggers,
    hiddenTriggers,
    selectedAircraftId,
    selectedVesselMmsi,
    selectedWeatherTime,
    weatherValidTimes,
    selectedEarthquake,
    selectedVolcano,
    selectedEarthquakeShakemap,
    selectedVolcanoPolygon,
    selectedCemsEarthquake,
    selectedCemsEarthquakeFeatures,
    getEffectiveLayerDates
  });
"""

# Insert hook call right after useDisasterAlerts call
hook_insert_point = "} = useDisasterAlerts(mapRef.current, mapLoaded, settings);\n"
new_mapbox = new_mapbox.replace(hook_insert_point, hook_insert_point + hook_call)

new_mapbox = new_mapbox.replace("import { useDisasterAlerts }", "import { useLayerVisibility } from '../hooks/useLayerVisibility';\nimport { useDisasterAlerts }")

with open('frontend/src/components/MapboxMap.tsx', 'w') as f:
    f.write(new_mapbox)

print("Extraction successful.")
