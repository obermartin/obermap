import re

with open('label sources/manifest-builder.html', 'r') as f:
    html = f.read()

old_event = """      // All form inputs trigger rerender
      document.querySelectorAll(".form input, .form select").forEach((el) => {
        el.addEventListener("input", rerender);
      });"""
new_event = """      // All form inputs trigger rerender
      document.querySelectorAll(".form input, .form select").forEach((el) => {
        el.addEventListener("input", rerender);
        el.addEventListener("change", rerender);
      });"""
html = html.replace(old_event, new_event)

with open('label sources/manifest-builder.html', 'w') as f:
    f.write(html)

print("Event listeners fixed")
