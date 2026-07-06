import re

with open('frontend/src/components/MapboxMap.tsx', 'r') as f:
    content = f.read()

content = content.replace("const allCemsActivationsRef = useRef<any[]>([]);", "const allCemsActivationsRef = useRef<any>(null);")

with open('frontend/src/components/MapboxMap.tsx', 'w') as f:
    f.write(content)

print("Fixed allCemsActivationsRef type.")
