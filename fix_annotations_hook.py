import re

# 1. Update MapboxMap.tsx (export getContrastYIQ, add missing props to useAnnotationsStream call)
with open('frontend/src/components/MapboxMap.tsx', 'r') as f:
    text = f.read()

# export getContrastYIQ
text = text.replace("function getContrastYIQ", "export function getContrastYIQ")

# Add missing props to the hook call
hook_call_old = """  useAnnotationsStream({
    map: mapRef.current,
    mapLoaded,
    annotations,
    setAnnotations,
    selectedAnnotationId,
    setSelectedAnnotationId,
    revealedTriggers,
    hiddenTriggers,
    triggerProgressRef,
    triggerTimestampsRef,
    animationTick,
    setAnimationTick
  });"""

hook_call_new = """  useAnnotationsStream({
    map: mapRef.current,
    mapLoaded,
    annotations,
    setAnnotations,
    selectedAnnotationId,
    setSelectedAnnotationId,
    revealedTriggers,
    hiddenTriggers,
    triggerProgressRef,
    triggerTimestampsRef,
    animationTick,
    setAnimationTick,
    activeTool,
    settings,
    t,
    getBaseTemplate,
    handleRouteWaypointDragEnd
  });"""

text = text.replace(hook_call_old, hook_call_new)

with open('frontend/src/components/MapboxMap.tsx', 'w') as f:
    f.write(text)


# 2. Update useAnnotationsStream.ts
with open('frontend/src/hooks/useAnnotationsStream.ts', 'r') as f:
    hook = f.read()

# Add imports
imports = """import { createCirclePolygon, calculateDistance, createArrowFeatures } from '../utils/mapUtils';
import { customPrompt } from '../utils/dialogService';
import { globalLabelManager } from '../labels/LabelMarkerManager';
import { getContrastYIQ } from '../components/MapboxMap';
import type { AppSettings, ToolType } from '../types';
"""
hook = hook.replace("import type { Annotation } from '../types';", "import type { Annotation } from '../types';\n" + imports)

# Update Props interface
props_old = """  animationTick: number;
  setAnimationTick: React.Dispatch<React.SetStateAction<number>>;
}"""
props_new = """  animationTick: number;
  setAnimationTick: React.Dispatch<React.SetStateAction<number>>;
  activeTool: ToolType;
  settings: AppSettings;
  t: any;
  getBaseTemplate: (id?: string) => any;
  handleRouteWaypointDragEnd: (annId: string, wpIdx: number, newLngLat: [number, number]) => Promise<void>;
}"""
hook = hook.replace(props_old, props_new)

# Update hook arguments
args_old = """  animationTick,
  setAnimationTick
}: AnnotationsStreamProps) => {"""
args_new = """  animationTick,
  setAnimationTick,
  activeTool,
  settings,
  t,
  getBaseTemplate,
  handleRouteWaypointDragEnd
}: AnnotationsStreamProps) => {"""
hook = hook.replace(args_old, args_new)

# Replace mapRef.current with map
hook = hook.replace("mapRef.current", "map")

# In some places, it might say "if (!mapRef) return;" but wait, I just replaced mapRef.current with map.
# If there are any bare "mapRef" variables, I should replace them with "map" as well if they refer to the map instance.
# Let's just use re.sub for mapRef\b
hook = re.sub(r'\bmapRef\b', 'map', hook)

with open('frontend/src/hooks/useAnnotationsStream.ts', 'w') as f:
    f.write(hook)

print("Fixed useAnnotationsStream.ts!")
