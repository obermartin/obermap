import re

with open('frontend/src/hooks/useLayerVisibility.ts', 'r') as f:
    hook = f.read()

# 1. Fix map = map
hook = hook.replace("    const map = map;\n", "")

# 2. Add annotations and windLastFetchRef to props
hook = hook.replace(
    "  settings: AppSettings;\n  activeTool: string | null;",
    "  settings: AppSettings;\n  annotations: any[];\n  activeTool: string | null;"
)

hook = hook.replace(
    "  weatherAllValidTimesRef: React.MutableRefObject<string[]>;\n}",
    "  weatherAllValidTimesRef: React.MutableRefObject<string[]>;\n  windLastFetchRef: React.MutableRefObject<number>;\n}"
)

hook = hook.replace(
    "    selectedCemsEarthquake, selectedCemsEarthquakeFeatures, getEffectiveLayerDates,",
    "    annotations, selectedCemsEarthquake, selectedCemsEarthquakeFeatures, getEffectiveLayerDates,"
)

hook = hook.replace(
    "    weatherForecastLayerIdsRef, weatherForecastSourceIdsRef, lastActiveWeatherTimeRef, weatherAllValidTimesRef",
    "    weatherForecastLayerIdsRef, weatherForecastSourceIdsRef, lastActiveWeatherTimeRef, weatherAllValidTimesRef, windLastFetchRef"
)

# 3. Fix implicit anys
hook = hook.replace("annotations.find(a => a.id", "annotations.find((a: any) => a.id")
hook = hook.replace("settings.layers.find(l => l.id", "settings.layers.find((l: any) => l.id")
hook = hook.replace("settings.layers.some(l =>", "settings.layers.some((l: any) =>")
hook = hook.replace("weatherForecastLayerIdsRef.current.forEach(id => {", "weatherForecastLayerIdsRef.current.forEach((id: string) => {")
hook = hook.replace("weatherForecastSourceIdsRef.current.forEach(id => {", "weatherForecastSourceIdsRef.current.forEach((id: string) => {")

with open('frontend/src/hooks/useLayerVisibility.ts', 'w') as f:
    f.write(hook)


# MapboxMap.tsx fixes
with open('frontend/src/components/MapboxMap.tsx', 'r') as f:
    mapbox = f.read()

mapbox = mapbox.replace("  const layerFadeTimeoutsRef = useRef<Record<string, any>>({});\n", "")
mapbox = mapbox.replace(
    "    weatherAllValidTimesRef\n  });",
    "    weatherAllValidTimesRef,\n    annotations,\n    windLastFetchRef\n  });"
)

with open('frontend/src/components/MapboxMap.tsx', 'w') as f:
    f.write(mapbox)

print("Fixes applied.")
