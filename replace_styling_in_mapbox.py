with open('frontend/src/components/MapboxMap.tsx', 'r') as f:
    text = f.read()

with open('block_settings.txt', 'r') as f:
    transitions = f.read()

with open('block_Density.txt', 'r') as f:
    density = f.read()

with open('block_Environment.txt', 'r') as f:
    terrain = f.read()

with open('block_Styling.txt', 'r') as f:
    water = f.read()

# Replace blocks with empty string
text = text.replace(transitions, "")
text = text.replace(density, "")
text = text.replace(terrain, "")
text = text.replace(water, "")

# Add import
import_statement = "import { useMapStyling } from '../hooks/useMapStyling';\n"
text = text.replace("import { useDisasterStream } from '../hooks/useDisasterStream';", import_statement + "import { useDisasterStream } from '../hooks/useDisasterStream';")

# Call the hook inside MapboxMap
hook_call = """
  useMapStyling({
    map: mapRef.current,
    mapLoaded,
    settings,
    styleLoadedTick,
    originalFiltersRef
  });
"""

text = text.replace("  useDisasterStream({", hook_call + "  useDisasterStream({")

with open('frontend/src/components/MapboxMap.tsx', 'w') as f:
    f.write(text)

print("Refactored MapboxMap.tsx to use useMapStyling.")
