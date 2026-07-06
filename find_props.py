import re

with open('disaster_logic.txt', 'r') as f:
    text = f.read()

# simple regex to find likely missing variables (not foolproof but gives a good idea)
variables = set(re.findall(r'\b[a-zA-Z_][a-zA-Z0-9_]*\b', text))

# This is just a quick check for words that might be props/state from the parent component
candidates = ['mapRef', 'mapLoaded', 'selectedCycloneId', 'cycloneRawData', 'setCycloneRawData', 'cycloneTimelinePercent', 'setCycloneTimelinePercent', 'dateRange', 'selectedCemsEarthquake', 'selectedEarthquake', 'selectedVolcano', 'earthquakeMarkerRef', 'volcanoMarkerRef', 'settings', 't']

print("Variables used in disaster logic:")
for c in candidates:
    if c in text:
        print(f"- {c}")

