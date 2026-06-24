import re

with open('src/components/MapContainer.tsx', 'r') as f:
    code = f.read()

# Replace mapRef.current.once('idle') with once('moveend') + distance check
def mapref_replacer(m):
    return f"""        if ({m.group(1)}.elevation !== undefined) {{
          mapRef.current.once('moveend', () => {{
            const currentCenter = mapRef.current?.getCenter();
            if (currentCenter) {{
              const dist = Math.sqrt(Math.pow(currentCenter.lng - {m.group(1)}.center[0], 2) + Math.pow(currentCenter.lat - {m.group(1)}.center[1], 2));
              if (dist < 0.1) {{
                mapRef.current?.jumpTo({{
                  center: {m.group(1)}.center,
                  zoom: {m.group(1)}.zoom,
                  pitch: {m.group(1)}.pitch,
                  bearing: {m.group(1)}.bearing,
                  elevation: {m.group(1)}.elevation
                }});
              }}
            }}
          }});
        }}"""

code = re.sub(
    r'if \((.+?)\.elevation !== undefined\) \{\s*mapRef\.current\.once\(\'idle\', \(\) => \{\s*mapRef\.current\?\.jumpTo\(\{\s*center: \1\.center,\s*zoom: \1\.zoom,\s*pitch: \1\.pitch,\s*bearing: \1\.bearing,\s*elevation: \1\.elevation\s*\}\);\s*\}\);\s*\}',
    mapref_replacer,
    code,
    flags=re.DOTALL
)

def map1_replacer(m):
    return f"""            if ({m.group(1)}.elevation !== undefined) {{
              map1!.once('moveend', () => {{
                const currentCenter = map1!.getCenter();
                if (currentCenter) {{
                  const dist = Math.sqrt(Math.pow(currentCenter.lng - {m.group(1)}.center[0], 2) + Math.pow(currentCenter.lat - {m.group(1)}.center[1], 2));
                  if (dist < 0.1) {{
                    map1!.jumpTo({{
                      center: {m.group(1)}.center,
                      zoom: {m.group(1)}.zoom,
                      pitch: {m.group(1)}.pitch,
                      bearing: {m.group(1)}.bearing,
                      elevation: {m.group(1)}.elevation
                    }});
                  }}
                }}
              }});
            }}"""

code = re.sub(
    r'if \((.+?)\.elevation !== undefined\) \{\s*map1!\.once\(\'idle\', \(\) => \{\s*map1!\.jumpTo\(\{\s*center: \1\.center,\s*zoom: \1\.zoom,\s*pitch: \1\.pitch,\s*bearing: \1\.bearing,\s*elevation: \1\.elevation\s*\}\);\s*\}\);\s*\}',
    map1_replacer,
    code,
    flags=re.DOTALL
)


with open('src/components/MapContainer.tsx', 'w') as f:
    f.write(code)

print("Success")
