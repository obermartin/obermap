import re

with open('frontend/src/components/MapboxMap.tsx', 'r') as f:
    mapbox = f.read()

# 1. Remove unused return vars
mapbox = mapbox.replace("selectedEarthquakeUsgsDyfi10km,\n", "")
mapbox = mapbox.replace("selectedEarthquakeUsgsDyfi1km,\n", "")
mapbox = mapbox.replace("selectedEarthquakeUsgsLandslide,\n", "")
mapbox = mapbox.replace("selectedEarthquakeUsgsLiquefaction,\n", "")

# 2. Add safeFetchCemsJson to mapUtils import
mapbox = mapbox.replace("import { createCirclePolygon, calculateDistance, createArrowFeatures, parseWKT, haversineDistance } from '../utils/mapUtils';", "import { createCirclePolygon, calculateDistance, createArrowFeatures, parseWKT, haversineDistance, safeFetchCemsJson } from '../utils/mapUtils';")

# 3. Fix weatherToggleRef
mapbox = mapbox.replace("const weatherToggleRef = useRef<boolean>(false);", "const weatherToggleRef = useRef<HTMLDivElement>(null);")

with open('frontend/src/components/MapboxMap.tsx', 'w') as f:
    f.write(mapbox)

print("Fixed final issues.")
