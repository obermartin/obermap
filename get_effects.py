import re

with open('frontend/src/components/MapboxMap.tsx', 'r') as f:
    content = f.read()

effects = re.findall(r"  useEffect\(\(\) => \{[\s\S]*?\}, \[.*?\]\);\n", content)

for i in range(31, 42):
    print(f"--- Effect {i} ---")
    print(effects[i])
