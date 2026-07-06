import re

with open('frontend/src/hooks/useDisasterStream.ts', 'r') as f:
    text = f.read()

potential_vars = [
    'activeDrawMarkersRef',
    'selectionMarkersRef',
    'formatDistance',
    'getFlagHtml',
    'globalLabelManager'
]

for var in potential_vars:
    if var in text:
        print(f"USES: {var}")
    else:
        print(f"NOT USED: {var}")

