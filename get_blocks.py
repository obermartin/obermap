with open('frontend/src/components/MapboxMap.tsx', 'r') as f:
    text = f.read()

def find_block(start_comment):
    start_idx = text.find(start_comment)
    if start_idx == -1: return None
    next_effect = text.find("  // ", start_idx + len(start_comment))
    if next_effect == -1: next_effect = len(text)
    return text[start_idx:next_effect]

with open('styling_blocks.txt', 'w') as f:
    f.write(find_block("  // Handle dynamic mapbox transitions based on settings"))
    f.write(find_block("  // Handle Map Label Density"))
    f.write(find_block("  // 3D Terrain & Environment"))
    f.write(find_block("  // Water Layer Styling"))
