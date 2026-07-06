with open('frontend/src/components/MapboxMap.tsx', 'r') as f:
    mapbox = f.read()

# Add mapContainer to useMapStyling
mapbox = mapbox.replace(
    "  useMapStyling({\n    map: mapRef.current,",
    "  useMapStyling({\n    mapContainer,\n    map: mapRef.current,"
)

# Add upgradeLegacyFilter to import from mapUtils
mapbox = mapbox.replace(
    "import { createCirclePolygon, calculateDistance, createArrowFeatures, parseWKT, haversineDistance, safeFetchCemsJson } from '../utils/mapUtils';",
    "import { createCirclePolygon, calculateDistance, createArrowFeatures, parseWKT, haversineDistance, safeFetchCemsJson, upgradeLegacyFilter } from '../utils/mapUtils';"
)

with open('frontend/src/components/MapboxMap.tsx', 'w') as f:
    f.write(mapbox)

with open('frontend/src/hooks/useMapStyling.ts', 'r') as f:
    hook = f.read()

# Add mapContainer to MapStylingProps
hook = hook.replace(
    "  map: maplibregl.Map | null;",
    "  mapContainer: React.RefObject<HTMLDivElement>;\n  map: maplibregl.Map | null;"
)

# Add mapContainer to destructuring
hook = hook.replace(
    "export const useMapStyling = ({\n  map: mapProp,",
    "export const useMapStyling = ({\n  mapContainer,\n  map: mapProp,"
)

# Import upgradeLegacyFilter
hook = hook.replace(
    "import type { AppSettings } from '../types';",
    "import type { AppSettings } from '../types';\nimport { upgradeLegacyFilter } from '../utils/mapUtils';"
)

with open('frontend/src/hooks/useMapStyling.ts', 'w') as f:
    f.write(hook)

print("Fixed useMapStyling imports and props.")
