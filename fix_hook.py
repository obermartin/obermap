import re

with open('frontend/src/hooks/useAnnotationTools.ts', 'r') as f:
    content = f.read()

# We need to add the imports for utils
content = content.replace(
    "import { createCirclePolygon, calculateDistance, simplifyLine, transliterateToGerman, decodePolyline, parseWKT, haversineDistance } from '../utils/mapUtils';",
    "import { createCirclePolygon, calculateDistance, simplifyLine, transliterateToGerman, decodePolyline, parseWKT, haversineDistance, createArrowFeatures } from '../utils/mapUtils';\nimport { getContrastYIQ } from '../utils/colorUtils';"
)

# We need to add the missing props to UseAnnotationToolsProps
props_to_add = """
  isDrawing: React.MutableRefObject<boolean>;
  currentShapeCoords: React.MutableRefObject<[number, number][]>;
  circleCenter: React.MutableRefObject<[number, number] | null>;
  arrowStart: React.MutableRefObject<[number, number] | null>;
  pendingFetchesRef: React.MutableRefObject<number>;
  setActiveDistance: React.Dispatch<React.SetStateAction<number | null>>;
  updateActiveDrawing: (geojson: any) => void;
  clearActiveDrawMarkers: () => void;
"""
content = content.replace(
    "  currentDrawSessionRef: React.MutableRefObject<string | null>;\n}",
    "  currentDrawSessionRef: React.MutableRefObject<string | null>;" + props_to_add + "}"
)

# And add them to the destructuring
args_to_add = """
  isDrawing,
  currentShapeCoords,
  circleCenter,
  arrowStart,
  pendingFetchesRef,
  setActiveDistance,
  updateActiveDrawing,
  clearActiveDrawMarkers
"""
content = content.replace(
    "  currentDrawSessionRef\n}: UseAnnotationToolsProps",
    "  currentDrawSessionRef," + args_to_add + "}: UseAnnotationToolsProps"
)

# And replace `isDrawing.current` etc inside if they are missing? They are already `.current` where needed.

with open('frontend/src/hooks/useAnnotationTools.ts', 'w') as f:
    f.write(content)

print("Hook fixed.")
