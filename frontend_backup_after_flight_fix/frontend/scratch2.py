import re

with open('src/components/MapContainer.tsx', 'r') as f:
    content = f.read()

# Fix icon-anchor and z-ordering in MapLibre layer
def repl_flights_layer(m):
    original = m.group(0)
    # Add icon-anchor: 'bottom' and conditional 3D alignments
    modified = original.replace("'icon-size': 1.6,", "'icon-size': 1.6,\n              'icon-anchor': 'bottom',")
    # Actually, pitch/rotation alignments are static. Let's just set them to map.
    modified = modified.replace("'icon-rotation-alignment': 'map',", "'icon-rotation-alignment': 'map',\n              'icon-pitch-alignment': layer.is3DMode ? 'map' : 'auto',")
    return modified

content = re.sub(r"        \} else if \(layer\.type === 'flights'\) \{\n          map\.addLayer\(\{.*?\}, firstSymbolId\);", repl_flights_layer, content, flags=re.DOTALL)

# Fix labels layer to not use firstSymbolId so it's on top
labels_addLayer = """          map.addLayer({
            id: `${layerId}-labels`,
            type: 'symbol',
            source: sourceId,"""
labels_addLayer_new = """          if (map.getLayer(`${layerId}-labels`)) map.removeLayer(`${layerId}-labels`);
          map.addLayer({
            id: `${layerId}-labels`,
            type: 'symbol',
            source: sourceId,"""
# content = content.replace(labels_addLayer, labels_addLayer_new)
# Wait, it's easier to regex replace the firstSymbolId at the end of the labels addLayer call.
# I'll just use a targeted regex for the labels layer.
def repl_labels_layer(m):
    return m.group(1) + "          });"

content = re.sub(r"(          map\.addLayer\(\{\n            id: `\$\{layerId\}-labels`.*?\n            \}\n          \}), firstSymbolId\);", repl_labels_layer, content, flags=re.DOTALL)


with open('src/components/MapContainer.tsx', 'w') as f:
    f.write(content)

