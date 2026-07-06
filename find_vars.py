import re

with open('frontend/src/hooks/useDisasterStream.ts', 'r') as f:
    text = f.read()

vars_to_check = [
    'selectedEarthquakeShakemap',
    'selectedCemsEarthquakeFeatures',
    'activeCemsWildfireFeatures',
    'setActiveCemsWildfireFeatures',
    'activeCemsFloodFeatures',
    'setActiveCemsFloodFeatures',
    'selectedVolcanoPolygon'
]

for var in vars_to_check:
    if var in text:
        print(f"USES: {var}")
    else:
        print(f"NOT USED: {var}")

