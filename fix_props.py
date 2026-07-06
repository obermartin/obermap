with open('frontend/src/hooks/useDisasterStream.ts', 'r') as f:
    text = f.read()

props_to_add = """  activeDrawMarkersRef: React.MutableRefObject<{ [id: string]: maplibregl.Marker }>;
  selectionMarkersRef: React.MutableRefObject<{ [id: string]: maplibregl.Marker }>;
"""

text = text.replace("  t: (key: string) => string;\n}", props_to_add + "  t: (key: string) => string;\n}")

destructure_to_add = """  activeDrawMarkersRef,
  selectionMarkersRef,
"""

text = text.replace("  t\n}: DisasterStreamProps)", destructure_to_add + "  t\n}: DisasterStreamProps)")

with open('frontend/src/hooks/useDisasterStream.ts', 'w') as f:
    f.write(text)

with open('frontend/src/components/MapboxMap.tsx', 'r') as f:
    mapbox = f.read()

pass_to_add = """    activeDrawMarkersRef,
    selectionMarkersRef,
"""

mapbox = mapbox.replace("    t\n  });", pass_to_add + "    t\n  });")

with open('frontend/src/components/MapboxMap.tsx', 'w') as f:
    f.write(mapbox)

print("Props added and passed successfully.")
