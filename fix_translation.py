import os

file_path = '/Users/obermartin/Documents/CURRENT/BILD/OBERMAP2/frontend/src/locales/de.ts'

with open(file_path, 'r') as f:
    content = f.read()

last_brace_idx = content.rfind('}')
if last_brace_idx != -1:
    new_translations = """  "SCALING": "SKALIERUNG",
  "Basemap Labels Scale": "Basiskarte Labels Skalierung",
  "Annotations Scale": "Annotationen Skalierung",
"""
    before_brace = content[:last_brace_idx].rstrip()
    if not before_brace.endswith(','):
        before_brace += ','
    content = before_brace + '\n' + new_translations + '};\n'
    
    with open(file_path, 'w') as f:
        f.write(content)
    print("de.ts updated.")

