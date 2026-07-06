import re

with open('frontend/src/components/MapContainer.tsx', 'r') as f:
    content = f.read()

# Replace the hook call
old_call = """  useAnnotationTools({
    mapRef,
    mapLoaded,
    activeTool,
    currentColor,
    currentStrokeType,
    currentFillOpacity,
    annotations,
    setAnnotations,
    activeGeojsonLayerId,
    setActiveGeojsonLayerId,
    setSelectedGeojsonFeatureId,
    selectedAircraftId,
    settings,
    selectedIconId,
    routeMode,
    activeDrawMarkersRef,
    currentDrawSessionRef
  });"""

new_call = """  useAnnotationTools({
    mapRef,
    mapLoaded,
    activeTool,
    currentColor,
    currentStrokeType,
    currentFillOpacity,
    annotations,
    setAnnotations,
    activeGeojsonLayerId,
    setActiveGeojsonLayerId,
    setSelectedGeojsonFeatureId,
    selectedAircraftId,
    settings,
    selectedIconId,
    routeMode,
    activeDrawMarkersRef,
    currentDrawSessionRef,
    isDrawing,
    currentShapeCoords,
    circleCenter,
    arrowStart,
    pendingFetchesRef,
    setActiveDistance,
    updateActiveDrawing,
    clearActiveDrawMarkers
  });"""

content = content.replace(old_call, new_call)

# Also replace `getContrastYIQ` since we extracted it
content = content.replace(
"""function getContrastYIQ(hexcolor: string) {
  if (!hexcolor) return '#ffffff';
  if (hexcolor.startsWith('#')) hexcolor = hexcolor.slice(1);
  if (hexcolor.length === 3) hexcolor = hexcolor.split('').map(c => c + c).join('');
  const r = parseInt(hexcolor.substr(0, 2), 16) || 0;
  const g = parseInt(hexcolor.substr(2, 2), 16) || 0;
  const b = parseInt(hexcolor.substr(4, 2), 16) || 0;
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 128 ? '#000000' : '#ffffff';
}""",
"import { getContrastYIQ } from '../utils/colorUtils';"
)

with open('frontend/src/components/MapContainer.tsx', 'w') as f:
    f.write(content)

print("MapContainer fixed.")
