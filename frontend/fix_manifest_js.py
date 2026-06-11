with open('../label sources/manifest-builder.html', 'r') as f:
    html = f.read()

# 1. Add themeAccent to themeMap
html = html.replace("themePointer: 'pointerFill',", "themePointer: 'pointerFill',\n  themeAccent: 'accentFill',")

# 2. Add icon toggle JS
js_toggle_code = """
// Icon toggle buttons
document.querySelectorAll('.icon-toggle button').forEach(btn => {
  btn.addEventListener('click', (e) => {
    const parent = e.target.closest('.icon-toggle');
    parent.querySelectorAll('button').forEach(b => b.classList.remove('active'));
    e.target.classList.add('active');
    const targetId = parent.getAttribute('data-target');
    document.getElementById(targetId).value = e.target.getAttribute('data-val');
    rerender();
  });
});
"""

# Put it before "// All form inputs trigger rerender"
html = html.replace('// All form inputs trigger rerender', js_toggle_code + '\n// All form inputs trigger rerender')

with open('../label sources/manifest-builder.html', 'w') as f:
    f.write(html)
print("Done")
