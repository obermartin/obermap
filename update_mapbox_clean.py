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

# We also need layerFadeTimeoutsRef, deepstateDataCacheRef, gdacsDataCacheRef
refs_to_move = [
    "  const layerFadeTimeoutsRef = useRef<Record<string, any>>({});\n",
    "  const deepstateDataCacheRef = useRef<{ [cacheKey: string]: any }>({});\n",
    "  const gdacsDataCacheRef = useRef<{ [cacheKey: string]: any }>({});\n"
]

hook_call = """  useLayerVisibility({
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
    getEffectiveLayerDates,
    weatherForecastLayerIdsRef,
    weatherForecastSourceIdsRef,
    lastActiveWeatherTimeRef,
    weatherAllValidTimesRef
  });\n"""

# Replace the block with the hook call
new_mapbox = mapbox[:start_idx] + hook_call + mapbox[end_idx:]

# Delete the refs
for ref in refs_to_move:
    new_mapbox = new_mapbox.replace(ref, "")

# Delete globals
global_str = "let globalDeepstateHistory: { id: number; createdAt: string }[] | null = null;\nlet globalDeepstateHistoryPromise: Promise<{ id: number; createdAt: string; }[] | null> | null = null;\n"
new_mapbox = new_mapbox.replace(global_str, "")

# Replace import
new_mapbox = new_mapbox.replace("import { useDisasterAlerts }", "import { useLayerVisibility } from '../hooks/useLayerVisibility';\nimport { useDisasterAlerts }")

with open('frontend/src/components/MapboxMap.tsx', 'w') as f:
    f.write(new_mapbox)

print("MapboxMap.tsx updated cleanly.")
