import re

with open('frontend/src/components/MapContainer.tsx', 'r') as f:
    lines = f.readlines()

# The massive useEffect starts at line 7121 and ends at 8392. 
# (Indices are 0-based: 7120 to 8391)
start_idx = 7120
end_idx = 8392

use_effect_lines = lines[start_idx:end_idx]

hook_file_content = f"""import React, {{ useEffect, useRef }} from 'react';
import maplibregl from 'maplibre-gl';
import * as turf from '@turf/turf';
import {{ Annotation, ToolType, StrokeType, RouteMode, MapLayer, AppSettings }} from '../types';
import {{ customAlert, customPrompt }} from '../utils/dialogService';
import {{ createCirclePolygon, calculateDistance, simplifyLine, transliterateToGerman, decodePolyline, parseWKT, haversineDistance }} from '../utils/mapUtils';

interface UseAnnotationToolsProps {{
  mapRef: React.MutableRefObject<maplibregl.Map | null>;
  mapLoaded: boolean;
  activeTool: ToolType | null;
  currentColor: string;
  currentStrokeType: StrokeType;
  currentFillOpacity: number;
  annotations: Annotation[];
  setAnnotations: React.Dispatch<React.SetStateAction<Annotation[]>>;
  activeGeojsonLayerId: string | null;
  setActiveGeojsonLayerId: (id: string | null) => void;
  setSelectedGeojsonFeatureId: (id: string | number | null) => void;
  selectedAircraftId: string | null;
  settings: AppSettings;
  selectedIconId: string;
  routeMode: RouteMode;
  activeDrawMarkersRef: React.MutableRefObject<maplibregl.Marker[]>;
  currentDrawSessionRef: React.MutableRefObject<string | null>;
}}

export function useAnnotationTools({{
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
}}: UseAnnotationToolsProps) {{
  const routeClickTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const routeGeometryRef = useRef<any>(null);
  const routeLegsRef = useRef<{{ distance: number; duration: number }}[]>([]);
  const routeSegmentsRef = useRef<{{ [idx: number]: [number, number][] }}>({{}});
  const routeLegsSegmentsRef = useRef<{{ [idx: number]: {{ distance: number, duration: number }} }}>({{}});

{"".join(use_effect_lines)}
}}
"""

with open('frontend/src/hooks/useAnnotationTools.ts', 'w') as f:
    f.write(hook_file_content)

# Now remove the useEffect lines from MapContainer.tsx
# And the refs
# Also insert the hook call

new_lines = []
skip_refs = [
  "const routeClickTimeoutRef",
  "const routeGeometryRef",
  "const routeLegsRef",
  "const routeSegmentsRef",
  "const routeLegsSegmentsRef"
]

hook_call = """
  useAnnotationTools({
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
  });
"""

import_stmt = "import { useAnnotationTools } from '../hooks/useAnnotationTools';\n"
added_import = False

for i, line in enumerate(lines):
    if i >= start_idx and i < end_idx:
        if i == start_idx:
            new_lines.append(hook_call)
        continue
        
    if any(line.strip().startswith(ref) for ref in skip_refs):
        continue
        
    if line.startswith('import { CropOverlay }') and not added_import:
        new_lines.append(import_stmt)
        added_import = True
        
    new_lines.append(line)

with open('frontend/src/components/MapContainer.tsx', 'w') as f:
    f.writelines(new_lines)

print("Extraction complete.")
