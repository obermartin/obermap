import re

with open('src/components/MapContainer.tsx', 'r') as f:
    code = f.read()

# Add accentColor definition
code = code.replace(
    'const highlightColor = `rgba(255,255,255,${highlightOp})`;',
    'const highlightColor = `rgba(255,255,255,${highlightOp})`;\n        const accentColor = `rgba(0,0,0,${shadowOp})`;'
)

# Update map.addLayer
code = code.replace(
    "'hillshade-accent-color': '#000000'",
    "'hillshade-accent-color': accentColor"
)

# Update map.setPaintProperty
code = code.replace(
    "map.setPaintProperty('aws-terrarium-hillshade', 'hillshade-highlight-color', highlightColor);",
    "map.setPaintProperty('aws-terrarium-hillshade', 'hillshade-highlight-color', highlightColor);\n          map.setPaintProperty('aws-terrarium-hillshade', 'hillshade-accent-color', accentColor);"
)

with open('src/components/MapContainer.tsx', 'w') as f:
    f.write(code)

print("Hillshade fix applied")
