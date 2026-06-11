import re

with open('../frontend/src/labels/LabelMarkerManager.ts', 'r') as f:
    ts = f.read()

# 1. Update Typography interface
typo_interface = """export interface TypographyConfig {
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  letterSpacing: number;
  lineHeight: number;
  textTransform: 'none' | 'uppercase' | 'lowercase' | 'capitalize';
  textAlign: 'left' | 'center' | 'right';
  color?: string;
}"""
ts = re.sub(r'export interface TypographyConfig \{.*?\}', typo_interface, ts, flags=re.DOTALL)

# 2. Update PointerConfig interface
pointer_interface = """export interface PointerConfig {
  overrideColor?: boolean;
  color?: string;
  width: number;
  height: number;
  attachEdge: 'bottom' | 'top' | 'left' | 'right';
  attachFrom: 'left' | 'right' | 'center';
  attachOffset: number;
  tipX: number;
  tipY: number;
  independentColor?: boolean;
}"""
ts = re.sub(r'export interface PointerConfig \{.*?independentColor\?: boolean;\n\}', pointer_interface, ts, flags=re.DOTALL)

# 3. Update Primary/Secondary Backplate interfaces
backplate_interface = """  overrideColor?: boolean;
  color?: string;
  height: number;
  capWidth: number;
  minWidth: number;
  paddingX: number;"""
ts = re.sub(r'  height: number;\n  capWidth: number;\n  minWidth: number;\n  paddingX: number;', backplate_interface, ts)

# 4. In `buildTypographyCss` fallback color
ts = ts.replace("color: ${typo.color};", "color: ${typo.color || (role === 'primary' ? '#000000' : '#ffffff')};")

# Also, update `renderLabel` logic that reads theme
# Currently we have `if (theme.primaryBackplateFill) markerEl.style.setProperty('--primary-backplate-fill', theme.primaryBackplateFill);`
# But we need to use the manifest values if no theme is passed, or maybe the template renderer already injects them via `cssVarName` in SVGs?
# `normalizeSvg` handles the fallback: `var(--primary-backplate-fill, #original)`.
# But wait, what if `overrideColor` is true in manifest? Then `LabelMarkerManager` should inject the `color` into the inline style!
# Let's fix LabelMarkerManager rendering to inject them if present and overrideColor is true.

with open('../frontend/src/labels/LabelMarkerManager.ts', 'w') as f:
    f.write(ts)

print("Schema updated in LabelMarkerManager")
