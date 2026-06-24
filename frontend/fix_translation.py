import re

with open('src/locales/de.ts', 'r') as f:
    code = f.read()

translations = """  "Hillshade (Shadows)": "Schattierung (Hillshade)",
  "Shadow Opacity": "Schatten-Deckkraft",
  "Highlight Opacity": "Highlight-Deckkraft",
  "Sky": "Himmel",
  "Water Masking / Styling": "Wasser-Stil",
  "Water Color": "Wasserfarbe",
  "Water Opacity": "Wasser-Deckkraft",
"""

code = code.replace(
    '  "Exaggeration": "Überhöhung",\n',
    '  "Exaggeration": "Überhöhung",\n' + translations
)

with open('src/locales/de.ts', 'w') as f:
    f.write(code)

print("Translations added")
