import re

with open('frontend/src/components/MapboxMap.tsx', 'r') as f:
    text = f.read()

with open('block__Dynamically_update_clip_polygons_to_match_screen-space_of_highlight_DOM_labels.txt', 'r') as f:
    block1 = f.read()

with open('block__Handle_flyTo_from_label_click.txt', 'r') as f:
    block2 = f.read()

# Replace block1 with the hook call
hook_call = """  useDOMMarkers({
    map: mapRef.current,
    mapLoaded,
    annotations,
    activeTool
  });"""

text = text.replace(block1, hook_call)
text = text.replace(block2, "")

# Add import
text = text.replace(
    "import { useAnnotationsStream } from '../hooks/useAnnotationsStream';",
    "import { useAnnotationsStream } from '../hooks/useAnnotationsStream';\nimport { useDOMMarkers } from '../hooks/useDOMMarkers';"
)

with open('frontend/src/components/MapboxMap.tsx', 'w') as f:
    f.write(text)


hook_content = f"""import {{ useEffect }} from 'react';
import maplibregl from 'maplibre-gl';
import type {{ Annotation, ToolType }} from '../types';

export interface DOMMarkersProps {{
  map: maplibregl.Map | null;
  mapLoaded: boolean;
  annotations: Annotation[];
  activeTool: ToolType;
}}

export const useDOMMarkers = ({{
  map,
  mapLoaded,
  annotations,
  activeTool
}}: DOMMarkersProps) => {{

{block1.replace('mapRef.current', 'map')}

{block2.replace('mapRef.current', 'map')}

}};
"""

with open('frontend/src/hooks/useDOMMarkers.ts', 'w') as f:
    f.write(hook_content)

print("Generated useDOMMarkers.ts!")
