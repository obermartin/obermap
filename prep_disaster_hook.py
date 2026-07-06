with open('frontend/src/components/MapboxMap.tsx', 'r') as f:
    content = f.read()

start_idx = content.find("  // Fetch geometry when selectedCycloneId changes")
end_idx = content.find("  // Dynamically update clip polygons to match screen-space of highlight DOM labels")

if start_idx != -1 and end_idx != -1:
    print("Found bounds!")
else:
    print("Could not find start or end bounds.")
