import re

with open('../label sources/manifest-builder.html', 'r') as f:
    html = f.read()

missing_funcs = """
function updatePrimaryFromSvgs() {
  // Auto-populate primary height and capWidth from first detected SVG dimensions
  // (only on initial load — don't override user edits).
  if (state.files['primary_left-cap'] && !state._primaryDimsAutoSet) {
    const cap = state.files['primary_left-cap'];
    document.getElementById('primaryHeight').value = Math.round(cap.sourceHeight);
    document.getElementById('primaryCapWidth').value = Math.round(cap.sourceWidth);
    state._primaryDimsAutoSet = true;
  }
  if (state.files['primary_pointer'] && !state._pointerDimsAutoSet) {
    const p = state.files['primary_pointer'];
    document.getElementById('pointerWidth').value = Math.round(p.sourceWidth);
    document.getElementById('pointerHeight').value = Math.round(p.sourceHeight);
    state._pointerDimsAutoSet = true;
  }
  if (state.files['secondary_left-cap'] && !state._secondaryDimsAutoSet) {
    const cap = state.files['secondary_left-cap'];
    document.getElementById('secondaryHeight').value = Math.round(cap.sourceHeight);
    document.getElementById('secondaryCapWidth').value = Math.round(cap.sourceWidth);
    state._secondaryDimsAutoSet = true;
  }
}

function updateFileList() {
  const renderRow = (key, container) => {
    const found = !!state.files[key];
    const row = document.createElement('div');
    row.className = 'file-row' + (found ? ' found' : '');
    const dims = found ? `${Math.round(state.files[key].sourceWidth)}×${Math.round(state.files[key].sourceHeight)}` : '';
    row.innerHTML = `
      <div class="status ${found ? 'found' : 'missing'}"></div>
      <div class="name">${key}.svg</div>
      <div class="dims">${dims}</div>
    `;
    container.appendChild(row);
  };

  const primary = document.getElementById('primaryFiles');
  if (primary) {
    primary.innerHTML = '';
    REQUIRED_PRIMARY.forEach(k => renderRow(k, primary));
  }

  const secondary = document.getElementById('secondaryFiles');
  if (secondary) {
    secondary.innerHTML = '';
    REQUIRED_SECONDARY.forEach(k => renderRow(k, secondary));
  }
}
"""

# Insert them right after applyManifestToForm
html = re.sub(r'(function applyManifestToForm\(manifest\) \{.*?\n\}\n)', r'\1' + missing_funcs + '\n', html, flags=re.DOTALL)

with open('../label sources/manifest-builder.html', 'w') as f:
    f.write(html)

print("Restored missing functions")
