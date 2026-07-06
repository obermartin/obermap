import re

with open('frontend/src/components/MapboxMap.tsx', 'r') as f:
    content = f.read()

# 1. State hooks
state_block_regex = r"  const \[selectedEarthquake, setSelectedEarthquakeState\][\s\S]*?const \[selectedVolcanoPolygon, setSelectedVolcanoPolygon\] = useState<any>\(null\);\n"
state_match = re.search(state_block_regex, content)
state_block = state_match.group(0) if state_match else ""

# 2. Ref hooks
ref_block_regex = r"  const selectedEarthquakeRef = useRef\(selectedEarthquake\);\n  const selectedCemsEarthquakeRef = useRef\(selectedCemsEarthquake\);\n  const selectedVolcanoRef = useRef\(selectedVolcano\);\n"
ref_match = re.search(ref_block_regex, content)
ref_block = ref_match.group(0) if ref_match else ""

# 3. Ref useEffects
ref_effect_regex = r"  useEffect\(\(\) => \{\n    selectedEarthquakeRef\.current = selectedEarthquake;\n  \}, \[selectedEarthquake\]\);\n\n  useEffect\(\(\) => \{\n    selectedCemsEarthquakeRef\.current = selectedCemsEarthquake;\n  \}, \[selectedCemsEarthquake\]\);\n\n  useEffect\(\(\) => \{\n    selectedVolcanoRef\.current = selectedVolcano;\n  \}, \[selectedVolcano\]\);\n"
ref_effect_match = re.search(ref_effect_regex, content)
ref_effect_block = ref_effect_match.group(0) if ref_effect_match else ""

# 4. Disaster fetching and rendering useEffects
# We have a contiguous block of useEffects starting from the CEMS features fetch
# Wait, let's find the exact text using regex.

# Effect 31:
cems_features_regex = r"  useEffect\(\(\) => \{\n    if \(\!selectedCemsEarthquake\) \{[\s\S]*?\}, \[selectedCemsEarthquake\]\);\n"
cems_features_match = re.search(cems_features_regex, content)
cems_features_block = cems_features_match.group(0) if cems_features_match else ""

# Effect 34 to 41:
# Starts with:
#   useEffect(() => {
#     if (!selectedEarthquake) {
#       setSelectedEarthquakeShakemap(null);
# And ends with:
#     return () => { isSubscribed = false; };
#   }, [selectedVolcano]);

big_block_regex = r"  useEffect\(\(\) => \{\n    if \(\!selectedEarthquake\) \{\n      setSelectedEarthquakeShakemap\(null\);[\s\S]*?return \(\) => \{ isSubscribed = false; \};\n  \}, \[selectedVolcano\]\);\n"
big_block_match = re.search(big_block_regex, content)
big_block = big_block_match.group(0) if big_block_match else ""

print("Found State Block:", bool(state_match))
print("Found Ref Block:", bool(ref_match))
print("Found Ref Effect Block:", bool(ref_effect_match))
print("Found CEMS Features Block:", bool(cems_features_match))
print("Found Big Block:", bool(big_block_match))

