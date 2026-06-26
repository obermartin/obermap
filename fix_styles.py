import re

with open('frontend/src/components/MapContainer.tsx', 'r') as f:
    content = f.read()

# Replace window.getComputedStyle(X).Y = Z with X.style.Y = Z
# Note: we only want to replace assignments, i.e. when it's followed by " ="
# We'll match `window.getComputedStyle(varName).propertyName = `
content = re.sub(
    r'window\.getComputedStyle\(([^)]+)\)\.([a-zA-Z]+)\s*=',
    r'\1.style.\2 =',
    content
)

# And fix `mapContainer.window.getComputedStyle(current).backgroundColor =`
content = content.replace(
    'mapContainer.window.getComputedStyle(current).backgroundColor =',
    'mapContainer.current.style.backgroundColor ='
)

with open('frontend/src/components/MapContainer.tsx', 'w') as f:
    f.write(content)
