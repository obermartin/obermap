import re

with open('frontend/src/components/MapboxMap.tsx', 'r') as f:
    mapbox = f.read()

# The start of the effect is "// Synchronize dynamic map layers"
start_str = "  // Synchronize dynamic map layers\n  useEffect(() => {"
start_idx = mapbox.find(start_str)

# Find the end of the effect
# It should end with something like "  }, [settings.layers, mapLoaded"
end_regex = r"  \}, \[settings\.layers, mapLoaded[\s\S]*?\]\);\n"
match = re.search(end_regex, mapbox[start_idx:])
if match:
    end_idx = start_idx + match.end()
    effect_block = mapbox[start_idx:end_idx]
    
    # We also need to find layerFadeTimeoutsRef
    ref_regex = r"  const layerFadeTimeoutsRef = useRef<Record<string, any>>\(\{\}\);\n"
    ref_match = re.search(ref_regex, mapbox)
    ref_block = ref_match.group(0) if ref_match else ""
    
    # Now build useLayerVisibility.ts
    hook_code = f"""import {{ useEffect, useRef }} from 'react';
import type {{ AppSettings }} from '../types';

export const useLayerVisibility = (
  map: maplibregl.Map | null,
  mapLoaded: boolean,
  settings: AppSettings,
  activeGeojsonLayerId: string | null
) => {{
{ref_block}
{effect_block.replace("mapRef.current", "map").replace("if (!map || !mapLoaded) return;", "if (!map || !mapLoaded) return;")}
}};
"""
    with open('frontend/src/hooks/useLayerVisibility.ts', 'w') as f:
        f.write(hook_code)
    
    print("Extracted to useLayerVisibility.ts")
    
    # Remove from MapboxMap.tsx
    new_mapbox = mapbox[:start_idx] + mapbox[end_idx:]
    if ref_block:
        new_mapbox = new_mapbox.replace(ref_block, "")
        
    # Insert hook call
    hook_call = "  useLayerVisibility(mapRef.current, mapLoaded, settings, activeGeojsonLayerId);\n"
    # Insert it right before mapLoaded state
    hook_insert_point = "  const [mapLoaded, setMapLoaded] = useState(false);\n"
    new_mapbox = new_mapbox.replace(hook_insert_point, hook_insert_point + hook_call)
    
    # Add import
    new_mapbox = new_mapbox.replace("import { useDisasterAlerts }", "import { useLayerVisibility } from '../hooks/useLayerVisibility';\nimport { useDisasterAlerts }")
    
    with open('frontend/src/components/MapboxMap.tsx', 'w') as f:
        f.write(new_mapbox)
    print("Updated MapboxMap.tsx")
else:
    print("Could not find the end of the useEffect block.")

