import re

with open('frontend/src/components/MapboxMap.tsx', 'r') as f:
    mapbox = f.read()

# Since I already deleted the effect_block from MapboxMap.tsx, I need to get it from `git checkout`!
