import re

# Fix useAnnotationTools.ts
with open('frontend/src/hooks/useAnnotationTools.ts', 'r') as f:
    hook = f.read()

hook = hook.replace("import maplibregl from 'maplibre-gl';\nimport maplibregl from 'maplibre-gl';", "import maplibregl from 'maplibre-gl';")
hook = hook.replace("import { Annotation, ToolType, StrokeType, RouteMode, AppSettings } from '../types';", "import type { Annotation, ToolType, StrokeType, RouteMode, AppSettings } from '../types';")
hook = hook.replace("currentDrawSessionRef: React.MutableRefObject<string | null>;", "currentDrawSessionRef: React.MutableRefObject<number>;")
hook = hook.replace("selectedIconId: string;", "selectedIconId: string | undefined;")
hook = hook.replace("routeMode: RouteMode;", "routeMode: RouteMode | undefined;")
hook = hook.replace("currentStrokeType: StrokeType;", "currentStrokeType: StrokeType | undefined;")
hook = hook.replace("currentFillOpacity: number;", "currentFillOpacity: number | undefined;")
hook = hook.replace("currentDrawSessionRef.current += 1", "currentDrawSessionRef.current = (currentDrawSessionRef.current || 0) + 1")

with open('frontend/src/hooks/useAnnotationTools.ts', 'w') as f:
    f.write(hook)

# Fix MapContainer.tsx
with open('frontend/src/components/MapContainer.tsx', 'r') as f:
    map_code = f.read()

map_code = map_code.replace("import { createCirclePolygon, calculateDistance, simplifyLine, transliterateToGerman, createArrowFeatures, decodePolyline, parseWKT, haversineDistance } from '../utils/mapUtils';", "import { createCirclePolygon, calculateDistance, createArrowFeatures, decodePolyline, parseWKT, haversineDistance } from '../utils/mapUtils';")
map_code = map_code.replace("import anyAscii from 'any-ascii';", "")

with open('frontend/src/components/MapContainer.tsx', 'w') as f:
    f.write(map_code)

print("Final fix done.")
