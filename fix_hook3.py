import re

with open('frontend/src/hooks/useAnnotationTools.ts', 'r') as f:
    content = f.read()

# Replace missing imports
content = content.replace("import { Annotation, ToolType, StrokeType, RouteMode, MapLayer, AppSettings } from '../types';", "import { Annotation, ToolType, StrokeType, RouteMode, AppSettings } from '../types';\nimport maplibregl from 'maplibre-gl';")

# Fix types in UseAnnotationToolsProps
props_to_fix = {
    "selectedCycloneIdRef: React.MutableRefObject<string | null>;": "selectedCycloneIdRef: React.MutableRefObject<{ id: string, ep: string } | null>;",
    "setSelectedCycloneIdState: (id: string | null) => void;": "setSelectedCycloneIdState: (id: { id: string, ep: string } | null) => void;",
    
    "selectedEarthquakeRef: React.MutableRefObject<string | null>;": "selectedEarthquakeRef: React.MutableRefObject<{ id: string, ep: string, geomUrl: string, coordinates: [number, number], properties: any } | null>;",
    "setSelectedEarthquakeState: (id: string | null) => void;": "setSelectedEarthquakeState: (id: { id: string, ep: string, geomUrl: string, coordinates: [number, number], properties: any } | null) => void;",
    
    "selectedVolcanoRef: React.MutableRefObject<string | null>;": "selectedVolcanoRef: React.MutableRefObject<{ id: string, ep: string, geomUrl: string, coordinates: [number, number], properties: any } | null>;",
    "setSelectedVolcanoState: (id: string | null) => void;": "setSelectedVolcanoState: (id: { id: string, ep: string, geomUrl: string, coordinates: [number, number], properties: any } | null) => void;",
    
    "selectedCemsEarthquakeRef: React.MutableRefObject<string | null>;": "selectedCemsEarthquakeRef: React.MutableRefObject<{ id: string, code: string, properties: any, coordinates: [number, number] } | null>;",
    "setSelectedCemsEarthquakeState: (id: string | null) => void;": "setSelectedCemsEarthquakeState: (id: { id: string, code: string, properties: any, coordinates: [number, number] } | null) => void;",
    
    "setLabelPrompt: (pos: [number, number] | null) => void;": "setLabelPrompt: React.Dispatch<React.SetStateAction<{ lngLat: [number, number], initialText?: string, initialSecondary?: string } | null>>;",
    "setHeadlinePrompt: (pos: [number, number] | null) => void;": "setHeadlinePrompt: React.Dispatch<React.SetStateAction<{ id?: string; initialPrimary?: string; initialSecondary?: string } | null>> | undefined;",

    "vesselPopupRef: React.MutableRefObject<maplibregl.Popup>;": "vesselPopupRef: React.MutableRefObject<maplibregl.Popup | null>;"
}

for old, new_type in props_to_fix.items():
    content = content.replace(old, new_type)

# Fix TS2353: Object literal may only specify known properties, and 'lngLat' does not exist in type '[number, number]'.
content = content.replace("setLabelPrompt({ lngLat: e.lngLat.toArray() as [number, number] });", "setLabelPrompt({ lngLat: e.lngLat.toArray() as [number, number] });")

# I'll just write a regex to replace setLabelPrompt(...) calls if needed.
# Oh, line 421: setLabelPrompt({ lngLat: e.lngLat.toArray() as [number, number] }); -> This should be fine now that setLabelPrompt is correctly typed.
# line 426: setHeadlinePrompt({}); -> setHeadlinePrompt({}); is allowed since id etc are optional

with open('frontend/src/hooks/useAnnotationTools.ts', 'w') as f:
    f.write(content)

print("Hook fixed 3.")
