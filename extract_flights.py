import re

with open('frontend/src/components/MapboxMap.tsx', 'r') as f:
    content = f.read()

# Add import
import_stmt = "import { useFlightStream } from '../hooks/useFlightStream';\n"
if "useFlightStream" not in content:
    content = content.replace("import { useAisStream }", import_stmt + "import { useAisStream }")
    content = content.replace("import { getMmsiFlagHtml }", "import { getMmsiFlagHtml, getFlagHtml }")

# Remove getFlagHtml
start_idx = content.find("  const getFlagHtml = (countryName: string) => {")
if start_idx != -1:
    end_str = "/>`;\n  };\n"
    end_idx = content.find(end_str, start_idx) + len(end_str)
    # also remove empty lines
    while content[end_idx] == '\n':
        end_idx += 1
    content = content[:start_idx] + content[end_idx:]

# Remove flights logic
start_str = "  const flightsLayer = settings.layers.find(l => l.type === 'flights');\n  const triggerExistsForFlights ="
start_idx = content.find(start_str)

end_str = "  }, [selectedAircraftId, mapLoaded, settings.openSkyCredentials]);\n"
end_idx = content.find(end_str, start_idx)

if end_idx != -1:
    end_idx += len(end_str)

hook_call = """
  const { deckOverlayRef } = useFlightStream({
    map: mapRef.current,
    mapLoaded,
    settings,
    activeTool,
    revealedTriggers,
    hiddenTriggers,
    annotations,
    selectedAircraftId,
    selectedAircraftMetaRef,
    selectedFlightTrackRef,
    aircraftPopupRef,
    t
  });
"""

if start_idx != -1 and end_idx != -1:
    content = content[:start_idx] + hook_call + content[end_idx:]
else:
    print("FAILED TO FIND START OR END IDX FOR FLIGHTS LOGIC!")

# Let's also remove refs
content = re.sub(r"  const openSkyTokenRef = useRef.*?\n", "", content)
content = re.sub(r"  const flightHistoryRef = useRef.*?\n", "", content)
content = re.sub(r"  const updateDeckGLRef = useRef.*?\n", "", content)
content = re.sub(r"  const deckOverlayRef = useRef<MapboxOverlay \| null>\(null\);\n", "", content)

# Remove unused DeckGL imports
content = re.sub(r"import \{ MapboxOverlay \} from '@deck\.gl/mapbox';\n", "", content)
content = re.sub(r"import \{ ScenegraphLayer \} from '@deck\.gl/mesh-layers';\n", "", content)
content = re.sub(r"import \{ PathLayer, IconLayer, TextLayer \} from '@deck\.gl/layers';\n", "", content)

with open('frontend/src/components/MapboxMap.tsx', 'w') as f:
    f.write(content)
