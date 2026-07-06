import re

with open('/tmp/index-nTn2MtyN.js', 'r') as f:
    text = f.read()

keywords = ['lowpolyjet', 'animationTriggerId', 'fetchFlights', 'flights-history', 'DeckGl']

for kw in keywords:
    print(f"\n--- Searching for {kw} ---")
    for match in re.finditer(kw, text):
        start = max(0, match.start() - 200)
        end = min(len(text), match.end() + 1000)
        print(text[start:end])
        print("==========")
