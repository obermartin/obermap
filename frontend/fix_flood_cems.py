import re

with open('src/components/MapContainer.tsx', 'r') as f:
    content = f.read()

# Replace the broken block
broken_block = re.search(r"(    if \(!map\.getSource\('active-flood-cems-vt-source'\)\) \{.*?\n  \}, \[activeCemsFloodFeatures, mapLoaded, settings\.layers\]\);)", content, re.DOTALL)

if broken_block:
    fixed_block = """  // Flood CEMS VT rendering
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    let beforeId: string | undefined;
    const style = map.getStyle();
    if (style && style.layers) {
      for (const l of style.layers) {
        if (l.id.includes('admin') || l.id.includes('border') || l.type === 'symbol') {
          beforeId = l.id;
          break;
        }
      }
    }

""" + broken_block.group(1)
    
    content = content.replace(broken_block.group(1), fixed_block)

with open('src/components/MapContainer.tsx', 'w') as f:
    f.write(content)

