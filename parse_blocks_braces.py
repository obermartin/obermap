with open('frontend/src/components/MapboxMap.tsx', 'r') as f:
    text = f.read()

def find_block(start_comment):
    start_idx = text.find(start_comment)
    if start_idx == -1: return None
    
    # find the 'useEffect(() => {' line after the comment
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
            # We reached the end of the block. But useEffect has dependencies after it.
            # Look for the closing bracket and semicolon ');'
            end_idx = text.find(");", i)
            if end_idx != -1:
                return text[start_idx:end_idx + 2]
    return None

blocks = [
    "  // Handle dynamic mapbox transitions based on settings",
    "  // Handle Map Label Density",
    "  // 3D Terrain & Environment",
    "  // Water Layer Styling"
]

for b in blocks:
    print(f"\n--- {b} ---")
    block_text = find_block(b)
    if block_text:
        print(block_text[:100] + " ... " + block_text[-100:])
        with open('block_' + b.split()[-1] + '.txt', 'w') as f:
            f.write(block_text)

