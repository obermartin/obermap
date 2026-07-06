with open('frontend/src/components/MapboxMap.tsx', 'r') as f:
    text = f.read()

# I will find the useFlightStream invocation and useLayerVisibility invocation and remove the unwanted props.
# The unwanted props string:
unwanted = """    selectedEarthquakeShakemap,
    selectedCemsEarthquakeFeatures,
    activeCemsWildfireFeatures,
    setActiveCemsWildfireFeatures,
    activeCemsFloodFeatures,
    setActiveCemsFloodFeatures,
    selectedVolcanoPolygon,
    activeDrawMarkersRef,
    selectionMarkersRef,"""

import re
# We only want to keep the unwanted props in useDisasterStream.
# We can just use string replacements on the specific hooks by splitting the file on "useDisasterStream({"

parts = text.split("useDisasterStream({")
# Parts[0] contains useLayerVisibility and useFlightStream!
parts[0] = parts[0].replace(unwanted + "\n", "")

text = "useDisasterStream({".join(parts)

with open('frontend/src/components/MapboxMap.tsx', 'w') as f:
    f.write(text)

print("Cleaned up unwanted props.")
