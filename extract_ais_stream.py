import re

with open('frontend/src/components/MapboxMap.tsx', 'r') as f:
    mapbox = f.read()

start_str = "  // Polling for vessels\n  useEffect(() => {"
start_idx = mapbox.find(start_str)

end_dep = "  }, [settings.layers, mapLoaded, settings.aisstreamCredentials]);\n"
end_idx = mapbox.find(end_dep, start_idx) + len(end_dep)

effect_block = mapbox[start_idx:end_idx]

# Extract refs to move
refs_to_move = [
    "  const wsRef = useRef<WebSocket | null>(null);\n",
]

clean_effect_block = effect_block.replace("mapRef.current", "map")
clean_effect_block = clean_effect_block.replace("  // Polling for vessels\n", "")

hook_content = """import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import type { AppSettings } from '../types';

export interface AisStreamProps {
  map: maplibregl.Map | null;
  mapLoaded: boolean;
  settings: AppSettings;
  vesselsRef: React.MutableRefObject<Map<string, any>>;
  activeVesselMmsiRef: React.MutableRefObject<string | null>;
  vesselPopupRef: React.MutableRefObject<maplibregl.Popup | null>;
}

export const useAisStream = (props: AisStreamProps) => {
  const {
    map, mapLoaded, settings, vesselsRef, activeVesselMmsiRef, vesselPopupRef
  } = props;

  const wsRef = useRef<WebSocket | null>(null);

""" + clean_effect_block + """
};
"""

with open('frontend/src/hooks/useAisStream.ts', 'w') as f:
    f.write(hook_content)

# Remove from MapboxMap.tsx
new_mapbox = mapbox[:start_idx] + mapbox[end_idx:]

for ref in refs_to_move:
    new_mapbox = new_mapbox.replace(ref, "")

hook_call = """  useAisStream({
    map: mapRef.current,
    mapLoaded,
    settings,
    vesselsRef,
    activeVesselMmsiRef,
    vesselPopupRef
  });\n"""

# Insert hook call right after useLayerVisibility
insert_marker = "    windLastFetchRef\n  });\n"
insert_idx = new_mapbox.find(insert_marker)
if insert_idx != -1:
    new_mapbox = new_mapbox[:insert_idx + len(insert_marker)] + "\n" + hook_call + new_mapbox[insert_idx + len(insert_marker):]
else:
    print("WARNING: Could not find insert_marker for hook call")

new_mapbox = new_mapbox.replace("import { useLayerVisibility }", "import { useAisStream } from '../hooks/useAisStream';\nimport { useLayerVisibility }")

with open('frontend/src/components/MapboxMap.tsx', 'w') as f:
    f.write(new_mapbox)

print("Extraction script completed.")
