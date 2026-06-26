import re

with open('/Users/obermartin/Documents/CURRENT/BILD/OBERMAP2/frontend/src/components/MapContainer.tsx', 'r') as f:
    lines = f.readlines()

def fix_range(start_idx, end_idx):
    for i in range(start_idx, end_idx):
        line = lines[i]
        
        # We only want to replace `el.` with `innerEl.` for specific properties
        # el.classList, el.querySelector, el.style
        line = line.replace('el.classList.contains', 'innerEl.classList.contains')
        line = line.replace('el.querySelector', 'innerEl.querySelector')
        line = line.replace('el.style', 'innerEl.style')
        
        lines[i] = line

# Video export loop
fix_range(8570, 8730)

# Image export loop
fix_range(9190, 9350)

with open('/Users/obermartin/Documents/CURRENT/BILD/OBERMAP2/frontend/src/components/MapContainer.tsx', 'w') as f:
    f.writelines(lines)
print("Done!")
