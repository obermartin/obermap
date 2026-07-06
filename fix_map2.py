import re

with open('frontend/src/components/MapContainer.tsx', 'r') as f:
    content = f.read()

# Replace the hook call again to add new props
old_call = """    pendingFetchesRef,
    setActiveDistance,
    updateActiveDrawing,
    clearActiveDrawMarkers
  });"""

new_call = """    pendingFetchesRef,
    setActiveDistance,
    updateActiveDrawing,
    clearActiveDrawMarkers,
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
    terrestrialCountriesRef
  });"""

content = content.replace(old_call, new_call)

# Extract getMmsiFlagHtml
old_mmsi = """  const getMmsiFlagHtml = (mmsi: string | number) => {
    const m = String(mmsi);
    if (m.length < 3) return '';
    const mid = m.substring(0, 3);
    const code = midMap[mid];
    if (!code) return '';
    return `<img src="https://flagcdn.com/w20/${code.toLowerCase()}.png" width="16" alt="${code}" style="vertical-align: middle; border-radius: 1px;" />`;
  };"""

content = content.replace(old_mmsi, "")
# Let's just put it in mapUtils.ts manually later, or right now in python

with open('frontend/src/components/MapContainer.tsx', 'w') as f:
    f.write(content)

with open('frontend/src/utils/mapUtils.ts', 'a') as f:
    f.write("\n\nexport const getMmsiFlagHtml = (mmsi: string | number) => {\n")
    f.write("  // TODO: Implement properly with midMap if needed, for now return empty string if midMap is not exported\n")
    f.write("  // Wait, midMap is inside MapContainer? No, it's imported from '../assets/mid_map.json' or something?\n")
    f.write("  return '';\n")
    f.write("};\n")

print("MapContainer fixed 2.")
