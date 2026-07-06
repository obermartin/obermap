import re

with open('frontend/src/components/MapboxMap.tsx', 'r') as f:
    text = f.read()

with open('init_block_full.txt', 'r') as f:
    init_block = f.read()

# Replace block in MapboxMap.tsx
hook_call = """  useMapInitialization({
    mapContainer,
    mapRef,
    settings,
    settingsRef,
    setMapLoaded,
    setStyleLoadedTick,
    setRevealedTriggers,
    setHiddenTriggers,
    onMapInit,
    setSettings,
    originalFiltersRef,
    currentColorRef,
    setAnnotationsRef,
    triggerProgressRef,
    triggerTimestampsRef,
    mapStyleKey,
    forceRemount,
    t
  });"""

text = text.replace(init_block, hook_call)

# also remove module-level variable from MapboxMap.tsx
text = text.replace("let omProtocolRegistered = false;\n", "")

# also remove import MapboxGeocoder
text = text.replace("import MapboxGeocoder from '@mapbox/mapbox-gl-geocoder';\n", "")

# also add useMapInitialization import
text = text.replace(
    "import { useMapStyling } from '../hooks/useMapStyling';",
    "import { useMapStyling } from '../hooks/useMapStyling';\nimport { useMapInitialization } from '../hooks/useMapInitialization';"
)

with open('frontend/src/components/MapboxMap.tsx', 'w') as f:
    f.write(text)

# Create useMapInitialization.ts
hook_content = f"""import {{ useEffect }} from 'react';
import maplibregl from 'maplibre-gl';
import MapboxGeocoder from '@mapbox/mapbox-gl-geocoder';
import type {{ AppSettings, Annotation }} from '../types';
import excludedCitiesData from '../assets/excluded-cities.json';
import {{ omProtocol }} from '../utils/omProtocol';

let omProtocolRegistered = false;

export interface MapInitializationProps {{
  mapContainer: React.RefObject<HTMLDivElement | null>;
  mapRef: React.MutableRefObject<maplibregl.Map | null>;
  settings: AppSettings;
  settingsRef: React.MutableRefObject<AppSettings>;
  setMapLoaded: (v: boolean) => void;
  setStyleLoadedTick: React.Dispatch<React.SetStateAction<number>>;
  setRevealedTriggers: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  setHiddenTriggers: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  onMapInit?: (map: maplibregl.Map) => void;
  setSettings?: React.Dispatch<React.SetStateAction<AppSettings>>;
  originalFiltersRef: React.MutableRefObject<{{ [layerId: string]: any }}>;
  currentColorRef: React.MutableRefObject<string>;
  setAnnotationsRef: React.MutableRefObject<React.Dispatch<React.SetStateAction<Annotation[]>>>;
  triggerProgressRef: React.MutableRefObject<Record<string, number>>;
  triggerTimestampsRef: React.MutableRefObject<Record<string, number>>;
  mapStyleKey: number;
  forceRemount: number;
  t: any;
}}

export const useMapInitialization = ({{
  mapContainer,
  mapRef,
  settings,
  settingsRef,
  setMapLoaded,
  setStyleLoadedTick,
  setRevealedTriggers,
  setHiddenTriggers,
  onMapInit,
  setSettings,
  originalFiltersRef,
  currentColorRef,
  setAnnotationsRef,
  triggerProgressRef,
  triggerTimestampsRef,
  mapStyleKey,
  forceRemount,
  t
}}: MapInitializationProps) => {{
{init_block}
}};
"""

with open('frontend/src/hooks/useMapInitialization.ts', 'w') as f:
    f.write(hook_content)

print("Extracted Map Initialization into useMapInitialization.ts")
