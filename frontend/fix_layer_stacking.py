with open('src/components/MapContainer.tsx', 'r') as f:
    lines = f.readlines()

for i in range(800, 1200):
    if i < len(lines):
        if '}, firstSymbolId);' in lines[i]:
            lines[i] = lines[i].replace('}, firstSymbolId);', '});')

with open('src/components/MapContainer.tsx', 'w') as f:
    f.writelines(lines)
