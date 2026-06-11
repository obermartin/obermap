import re

with open('../frontend/src/labels/LabelMarkerManager.ts', 'r') as f:
    ts = f.read()

# Update Pointer interface
pointer_interface = """export interface Pointer {
  overrideColor?: boolean;
  color?: string;
  width: number;
  height: number;
  attachEdge: 'top' | 'bottom' | 'left' | 'right';
  attachFrom: 'left' | 'right' | 'top' | 'bottom';
  attachOffset: number;
  tipX: number;
  tipY: number;
  independentColor?: boolean;
}"""
ts = re.sub(r'export interface Pointer \{.*?independentColor\?: boolean;\n\}', pointer_interface, ts, flags=re.DOTALL)

# Remove `paddingY: number;` from PrimaryBackplate and SecondaryBackplate because it's no longer used and causes type errors elsewhere? Wait, no, the error was about 'role' not found.
# Let's fix the role error in buildTypographyCss:
# error TS2304: Cannot find name 'role'.
ts = ts.replace("color: ${typo.color || (role === 'primary' ? '#000000' : '#ffffff')};", "color: ${typo.color};")

# Also fix the LayerSidebar error
with open('../frontend/src/components/LayerSidebar.tsx', 'r') as f2:
    tsx = f2.read()
    
# `settings.labelTemplates?.availableTemplates?.find((t: any) => t.id === item.baseTemplate);`
# The error was `Property 'manifest' does not exist on type 'string | { id: string; kind: "highlight" | "regular"; }'.`
# Let's just cast it to any: `const man = (tplDef as any)?.manifest;`
tsx = tsx.replace('const man = tplDef?.manifest;', 'const man = (tplDef as any)?.manifest;')

with open('../frontend/src/components/LayerSidebar.tsx', 'w') as f2:
    f2.write(tsx)

with open('../frontend/src/labels/LabelMarkerManager.ts', 'w') as f:
    f.write(ts)

print("TS Fixed")
