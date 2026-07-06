import re

with open('frontend/src/components/MapboxMap.tsx', 'r') as f:
    content = f.read()

effects = re.findall(r"useEffect\(\(\) => \{[\s\S]*?\}, \[.*?\]\);", content)

print("Found", len(effects), "useEffects.")
for i, e in enumerate(effects):
    if "selectedEarthquake" in e or "selectedVolcano" in e or "selectedCemsEarthquake" in e:
        print(f"Effect {i} matches disaster logic:")
        print(e[:100] + "...")

