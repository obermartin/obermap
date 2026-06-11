import re

with open('../frontend/src/labels/LabelMarkerManager.ts', 'r') as f:
    content = f.read()

# 1. Update kind type
content = content.replace("kind: 'highlight' | 'regular';", "kind: 'highlight' | 'regular' | 'both';")

# 2. Update validation logic
content = content.replace(
    "if (manifest.kind === 'regular' && !manifest.secondary) throw new Error(`regular template ${name} must have secondary`);",
    "if (manifest.kind !== 'highlight' && !manifest.secondary) throw new Error(`${manifest.kind} template ${name} must have secondary`);"
)

# 3. Replace all other manifest.kind === 'regular' with manifest.kind !== 'highlight'
content = content.replace("manifest.kind === 'regular'", "manifest.kind !== 'highlight'")

with open('../frontend/src/labels/LabelMarkerManager.ts', 'w') as f:
    f.write(content)

print("Updated LabelMarkerManager.ts")
