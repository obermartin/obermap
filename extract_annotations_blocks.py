with open('frontend/src/components/MapboxMap.tsx', 'r') as f:
    text = f.read()

def find_block(start_comment):
    start_idx = text.find(start_comment)
    if start_idx == -1: return None
    
    # find the 'useEffect' line after the comment
    effect_idx = text.find("useEffect", start_idx)
    if effect_idx == -1: return None
    
    brace_count = 0
    in_block = False
    
    for i in range(effect_idx, len(text)):
        if text[i] == '{':
            brace_count += 1
            in_block = True
        elif text[i] == '}':
            brace_count -= 1
            
        if in_block and brace_count == 0:
            end_idx = text.find(");", i)
            if end_idx != -1:
                return text[start_idx:end_idx + 2]
    return None

blocks = {
    "useAnnotationsStream": [
        "  // Update mapbox features when annotations change",
        "  // Animation Loop for Reveals",
        "  // Update selected annotation filter"
    ],
    "useDOMMarkers": [
        "  // Dynamically update clip polygons to match screen-space of highlight DOM labels",
        "  // Handle flyTo from label click",
        "  // Render DOM markers for labels and highlights"
    ],
    "useFlightStream": [
        "  // Handle searchAircraft",
        "  // Immediate popup rendering for selected aircraft"
    ]
}

for hook, comments in blocks.items():
    print(f"--- {hook} ---")
    for b in comments:
        block_text = find_block(b)
        if block_text:
            print(f"Found: {b}")
            with open(f"block_{b.strip().replace(' ', '_').replace('/', '')}.txt", 'w') as f:
                f.write(block_text)
        else:
            print(f"NOT FOUND: {b}")

