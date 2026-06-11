import re

with open('../label sources/manifest-builder.html', 'r') as f:
    html = f.read()

toggle_css_old = """/* Toggle Switch */
.toggle-switch {
  position: relative;
  display: inline-block;
  width: 28px;
  height: 16px;
}
.toggle-switch input {
  opacity: 0;
  width: 0;
  height: 0;
}
.toggle-slider {
  position: absolute;
  cursor: pointer;
  top: 0; left: 0; right: 0; bottom: 0;
  background-color: var(--border);
  transition: .4s;
  border-radius: 16px;
}
.toggle-slider:before {
  position: absolute;
  content: "";
  height: 12px;
  width: 12px;
  left: 2px;
  bottom: 2px;
  background-color: var(--text-muted);
  transition: .2s;
  border-radius: 50%;
}
input:checked + .toggle-slider {
  background-color: var(--accent);
}
input:checked + .toggle-slider:before {
  transform: translateX(12px);
  background-color: #000;
}

/* Circular Color Swatch */
.color-swatch-circle {
  padding: 0;
  width: 20px;
  height: 20px;
  border: none;
  background: transparent;
  cursor: pointer;
  border-radius: 50%;
  overflow: hidden;
}
.color-swatch-circle::-webkit-color-swatch-wrapper {
  padding: 0;
}
.color-swatch-circle::-webkit-color-swatch {
  border: none;
  border-radius: 50%;
}"""

toggle_css_new = """/* Toggle Switch */
.toggle-switch {
  position: relative;
  display: inline-block;
  width: 28px;
  height: 16px;
}
.toggle-switch input {
  opacity: 0;
  width: 0;
  height: 0;
}
.toggle-slider {
  position: absolute;
  cursor: pointer;
  top: 0; left: 0; right: 0; bottom: 0;
  background-color: var(--panel-2);
  border: 1px solid var(--border-strong);
  box-sizing: border-box;
  transition: .4s;
  border-radius: 16px;
}
.toggle-slider:before {
  position: absolute;
  content: "";
  height: 10px;
  width: 10px;
  left: 2px;
  top: 2px;
  background-color: var(--text-faint);
  transition: .2s;
  border-radius: 50%;
}
input:checked + .toggle-slider {
  background-color: var(--accent);
  border-color: var(--accent);
}
input:checked + .toggle-slider:before {
  transform: translateX(12px);
  background-color: #000;
}

/* Circular Color Swatch */
.color-swatch-circle {
  padding: 2px;
  width: 24px;
  height: 24px;
  border: 1px solid var(--border-strong);
  background: transparent;
  cursor: pointer;
  border-radius: 50%;
  overflow: hidden;
  box-sizing: border-box;
}
.color-swatch-circle::-webkit-color-swatch-wrapper {
  padding: 0;
}
.color-swatch-circle::-webkit-color-swatch {
  border: none;
  border-radius: 50%;
}"""

if toggle_css_old in html:
    html = html.replace(toggle_css_old, toggle_css_new)
else:
    # Let's replace line by line if needed, but it should match exactly
    print("Toggle CSS not found exactly! Doing regex replacement...")
    # remove the old block manually by cutting from /* Toggle Switch */ to </style>
    idx = html.find("/* Toggle Switch */")
    if idx != -1:
        end_idx = html.find("</style>", idx)
        html = html[:idx] + toggle_css_new + "\n" + html[end_idx:]
    else:
        print("Could not find toggle switch CSS!")

with open('../label sources/manifest-builder.html', 'w') as f:
    f.write(html)

print("CSS tweaks applied")
