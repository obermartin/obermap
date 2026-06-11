import re

with open('frontend/src/components/LayerSidebar.tsx', 'r') as f:
    tsx = f.read()

old_bg = """className="absolute inset-0 bg-[#18181b] z-20 flex flex-col p-4 custom-scrollbar overflow-y-auto\""""
new_bg = """className="absolute inset-0 z-50 flex flex-col p-4 custom-scrollbar overflow-y-auto"
                  style={{ backgroundColor: '#18181b' }}"""

if old_bg in tsx:
    tsx = tsx.replace(old_bg, new_bg)
    with open('frontend/src/components/LayerSidebar.tsx', 'w') as f:
        f.write(tsx)
    print("Sidebar fixed")
else:
    print("Could not find old_bg")
