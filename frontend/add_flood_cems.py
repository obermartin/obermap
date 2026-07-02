import re

with open('src/components/MapContainer.tsx', 'r') as f:
    content = f.read()

# Add state
content = content.replace(
    'const [activeCemsWildfireFeatures, setActiveCemsWildfireFeatures] = useState<any>(null);',
    'const [activeCemsWildfireFeatures, setActiveCemsWildfireFeatures] = useState<any>(null);\n  const [activeCemsFloodFeatures, setActiveCemsFloodFeatures] = useState<any>(null);'
)

# Extract Wildfire useEffect
match = re.search(r'(  // Fetch detailed CEMS activations for wildfires.*?  \}, \[settings\.layers, settings\.globalDateMode, settings\.globalStartDate, settings\.globalEndDate, getEffectiveLayerDates\]\);)', content, re.DOTALL)
if match:
    wildfire_effect = match.group(1)
    # create flood effect
    flood_effect = wildfire_effect.replace('wildfires', 'floods').replace('Wildfire', 'Flood').replace('wildfire', 'flood').replace('Wildfire', 'Flood')
    flood_effect = flood_effect.replace('setActiveCemsFloodFeatures', 'setActiveCemsFloodFeatures')
    flood_effect = flood_effect.replace('activeCemsFloodFeatures', 'activeCemsFloodFeatures')
    flood_effect = flood_effect.replace('// Fetch detailed CEMS activations for flood in the date range', '// Fetch detailed CEMS activations for floods in the date range')
    
    # ensure it uses the right state names which got lowercased by previous replace
    flood_effect = flood_effect.replace('activeCemsfloodFeatures', 'activeCemsFloodFeatures')
    flood_effect = flood_effect.replace('setActiveCemsfloodFeatures', 'setActiveCemsFloodFeatures')
    
    content = content.replace(wildfire_effect, wildfire_effect + '\n\n' + flood_effect)


# Extract Wildfire layers logic
match2 = re.search(r"(    if \(!map\.getSource\('active-wildfire-cems-vt-source'\)\) \{.*?  \}, \[activeCemsWildfireFeatures, mapLoaded, settings\.layers\]\);)", content, re.DOTALL)
if match2:
    wildfire_layers = match2.group(1)
    # create flood layers logic
    flood_layers = wildfire_layers.replace('active-wildfire-cems-vt-', 'active-flood-cems-vt-')
    flood_layers = flood_layers.replace('activeCemsWildfireFeatures', 'activeCemsFloodFeatures')
    flood_layers = flood_layers.replace("wfLayer?.copernicusEnabled", "floodLayer?.copernicusEnabled")
    flood_layers = flood_layers.replace("wfLayer?.copernicusOpacity", "floodLayer?.copernicusOpacity")
    flood_layers = flood_layers.replace("const wfLayer = settings.layers.find(l => l.type === 'wildfires');", "const floodLayer = settings.layers.find(l => l.id === 'floods');")
    
    # change colors:
    # Extent line-color: #ff9900 -> #0066ff
    # Destroyed: #ff0000 -> #0000ff
    # Damaged: #ff9900 -> #3366ff
    # Possibly damaged: #ffff00 -> #66b2ff
    
    flood_layers = flood_layers.replace("'#ff9900'", "'#3366ff'") # Damaged and line-color
    flood_layers = flood_layers.replace("'#ff0000'", "'#0000ff'") # Destroyed
    flood_layers = flood_layers.replace("'#ffff00'", "'#66b2ff'") # Possibly damaged
    # Wait, the first extent line-color also gets replaced to '#3366ff'. I want #0066ff but #3366ff is fine for blue extent line.
    
    # We also need to add 'active-flood-cems-vt-extent', 'active-flood-cems-vt-polygons', 'active-flood-cems-vt-lines', 'active-flood-cems-vt-points' to idsToMoveTop / idsToMoveAdmin. Let's do that with standard replace later if needed.
    
    content = content.replace(wildfire_layers, wildfire_layers + '\n\n' + flood_layers)


# IDs to move
move_top = """        idsToMoveTop.push('active-wildfire-cems-vt-lines');
        idsToMoveTop.push('active-wildfire-cems-vt-points');
        idsToMoveAdmin.push('active-wildfire-cems-vt-extent');
        idsToMoveAdmin.push('active-wildfire-cems-vt-polygons');"""
move_top_flood = move_top.replace('wildfire', 'flood')
content = content.replace(move_top, move_top + '\n' + move_top_flood)


with open('src/components/MapContainer.tsx', 'w') as f:
    f.write(content)

