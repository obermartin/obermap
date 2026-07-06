import os

with open('block_settings.txt', 'r') as f:
    transitions = f.read()

with open('block_Density.txt', 'r') as f:
    density = f.read()

with open('block_Environment.txt', 'r') as f:
    terrain = f.read()

with open('block_Styling.txt', 'r') as f:
    water = f.read()

hook_content = f"""import {{ useEffect, useRef }} from 'react';
import maplibregl from 'maplibre-gl';
import type {{ AppSettings }} from '../types';

export interface MapStylingProps {{
  map: maplibregl.Map | null;
  mapLoaded: boolean;
  settings: AppSettings;
  styleLoadedTick: number;
  originalFiltersRef: React.MutableRefObject<{{ [layerId: string]: any }}>;
}}

export const useMapStyling = ({{
  map: mapProp,
  mapLoaded,
  settings,
  styleLoadedTick,
  originalFiltersRef
}}: MapStylingProps) => {{
  const initialTerrainLoaded = useRef(false);

  // Use a local ref wrapper since the original blocks use `mapRef.current`
  const mapRef = useRef<maplibregl.Map | null>(mapProp);
  useEffect(() => {{
    mapRef.current = mapProp;
  }}, [mapProp]);

{transitions}

{density}

{terrain}

{water}
}};
"""

with open('frontend/src/hooks/useMapStyling.ts', 'w') as f:
    f.write(hook_content)

print("Created useMapStyling.ts")
