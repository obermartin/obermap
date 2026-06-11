import re

with open('frontend/src/components/LayerSidebar.tsx', 'r') as f:
    tsx = f.read()

# Fix the template filter for "both" kind
old_filter = "t.kind === activeLabelTab && !hidden.includes(t.id)"
new_filter = "(t.kind === activeLabelTab || t.kind === 'both') && !hidden.includes(t.id)"
tsx = tsx.replace(old_filter, new_filter)

# Fix the transparent background issue by using a strict hex color
tsx = tsx.replace('className="absolute inset-0 bg-zinc-900 z-20 flex flex-col p-4 custom-scrollbar overflow-y-auto"', 'className="absolute inset-0 bg-[#18181b] z-20 flex flex-col p-4 custom-scrollbar overflow-y-auto"')

# Also replace the root sidebar background just in case tailwind purged zinc-900
tsx = tsx.replace('bg-zinc-900 border-r border-white/10 flex flex-col shadow-2xl z-40', 'bg-[#18181b] border-r border-white/10 flex flex-col shadow-2xl z-40')

with open('frontend/src/components/LayerSidebar.tsx', 'w') as f:
    f.write(tsx)

print("Sidebar fixed")
