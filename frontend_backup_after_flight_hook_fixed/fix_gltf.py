import json

with open('public/lowpolyjet.gltf', 'r') as f:
    data = json.load(f)

# Keep translation zeroed to prevent hovering
data['nodes'][0]['translation'] = [0.0, 0.0, 0.0]
# Revert rotation to original state
data['nodes'][0]['rotation'] = [0.0, 0.0, 0.0, -1.0]

with open('public/lowpolyjet_fixed.gltf', 'w') as f:
    json.dump(data, f, indent=2)
