import re

with open('label sources/manifest-builder.html', 'r') as f:
    html = f.read()

old_func = """        const set = (id, value) => {
          if (value === undefined || value === null) return;
          const el = document.getElementById(id);
          if (!el) return;
          if (el.type === "checkbox") el.checked = !!value;
          else el.value = value;
        };"""

new_func = """        const set = (id, value) => {
          if (value === undefined || value === null) return;
          const el = document.getElementById(id);
          if (!el) return;
          if (el.type === "checkbox") {
            el.checked = !!value;
          } else if (el.type === "color") {
            // Extract hex color if it's wrapped in a var()
            if (typeof value === "string" && value.startsWith("var(")) {
              const match = value.match(/var\\([^,]+,\\s*(#[0-9A-Fa-f]{6})\\)/);
              if (match) {
                el.value = match[1];
              }
            } else if (typeof value === "string" && value.startsWith("#")) {
              el.value = value;
            }
          } else {
            el.value = value;
          }
        };"""

if old_func in html:
    html = html.replace(old_func, new_func)
    with open('label sources/manifest-builder.html', 'w') as f:
        f.write(html)
    print("Fixed manifest-builder applyManifestToForm")
else:
    print("Could not find old_func")
