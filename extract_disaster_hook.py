import re

with open('frontend/src/components/MapboxMap.tsx', 'r') as f:
    content = f.read()

# I will find all the state declarations
state_regex = r"(  const \[selectedEarthquake, setSelectedEarthquakeState\][\s\S]*?const \[selectedVolcanoPolygon, setSelectedVolcanoPolygon\] = useState<any>\(null\);\n)"
match_state = re.search(state_regex, content)
states = match_state.group(1) if match_state else ""

# I need to find the specific useEffects.
# 31: selectedCemsEarthquake -> setSelectedCemsEarthquakeFeatures
# 34: !selectedEarthquake -> clear shakemap, etc...
# 35: fetching shakemap, dyfi, landslide, liquefaction
# 36: map addSource shakemap
# 37: map addSource dyfi10km
# 38: map addSource dyfi1km
# 39: map addSource liquefaction
# 40: fetching CEMS earthquake
# 41: fetching volcano polygon
# Also there are Map effects for volcano polygon, and CEMS features.

# It's better to just write a script that does string matching to pull out the exact code blocks
