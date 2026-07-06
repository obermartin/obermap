with open('frontend/src/components/MapboxMap.tsx', 'r') as f:
    text = f.read()

# Helper to find block
def find_block(start_comment, end_indicator="  // "):
    start_idx = text.find(start_comment)
    if start_idx == -1: return None
    
    # find next useEffect or comment
    next_effect = text.find("  // ", start_idx + len(start_comment))
    if next_effect == -1: next_effect = len(text)
    
    return text[start_idx:next_effect]

print("--- Transitions ---")
print(find_block("  // Handle dynamic mapbox transitions based on settings")[:200])

print("\n--- Density ---")
print(find_block("  // Handle Map Label Density")[:200])

print("\n--- Terrain ---")
print(find_block("  // 3D Terrain & Environment")[:200])

print("\n--- Water ---")
print(find_block("  // Water Layer Styling")[:200])

