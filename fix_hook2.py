import re

with open('frontend/src/hooks/useAnnotationTools.ts', 'r') as f:
    content = f.read()

# Add anyAscii import
content = content.replace("import { getContrastYIQ } from '../utils/colorUtils';", "import { getContrastYIQ } from '../utils/colorUtils';\nimport anyAscii from 'any-ascii';\nimport { getMmsiFlagHtml } from '../utils/mapUtils';")

# Add missing props
props_to_add = """
  setSelectedAircraftId: (id: string | null) => void;
  selectedCycloneIdRef: React.MutableRefObject<string | null>;
  setSelectedCycloneIdState: (id: string | null) => void;
  selectedEarthquakeRef: React.MutableRefObject<string | null>;
  setSelectedEarthquakeState: (id: string | null) => void;
  selectedVolcanoRef: React.MutableRefObject<string | null>;
  setSelectedVolcanoState: (id: string | null) => void;
  selectedCemsEarthquakeRef: React.MutableRefObject<string | null>;
  setSelectedCemsEarthquakeState: (id: string | null) => void;
  activeVesselMmsiRef: React.MutableRefObject<string | null>;
  vesselPopupRef: React.MutableRefObject<maplibregl.Popup>;
  vesselsRef: React.MutableRefObject<any>;
  setSelectedAnnotationId: (id: string | null) => void;
  setLabelPrompt: (pos: [number, number] | null) => void;
  setHeadlinePrompt: (pos: [number, number] | null) => void;
  terrestrialCountriesRef: React.MutableRefObject<any>;
"""
content = content.replace(
    "  clearActiveDrawMarkers: () => void;\n}",
    "  clearActiveDrawMarkers: () => void;" + props_to_add + "}"
)

# Add to destructuring
args_to_add = """
  setSelectedAircraftId,
  selectedCycloneIdRef,
  setSelectedCycloneIdState,
  selectedEarthquakeRef,
  setSelectedEarthquakeState,
  selectedVolcanoRef,
  setSelectedVolcanoState,
  selectedCemsEarthquakeRef,
  setSelectedCemsEarthquakeState,
  activeVesselMmsiRef,
  vesselPopupRef,
  vesselsRef,
  setSelectedAnnotationId,
  setLabelPrompt,
  setHeadlinePrompt,
  terrestrialCountriesRef,
"""
content = content.replace(
    "  clearActiveDrawMarkers\n}: UseAnnotationToolsProps",
    args_to_add + "  clearActiveDrawMarkers\n}: UseAnnotationToolsProps"
)

# Fix map indexing errors: TS7015: Element implicitly has an 'any' type because index expression is not of type 'number'.
# activeDrawMarkersRef.current[`measure-${...}`] is object type
content = content.replace("activeDrawMarkersRef: React.MutableRefObject<maplibregl.Marker[]>;", "activeDrawMarkersRef: React.MutableRefObject<{[key: string]: maplibregl.Marker}>;")

with open('frontend/src/hooks/useAnnotationTools.ts', 'w') as f:
    f.write(content)

print("Hook fixed 2.")
