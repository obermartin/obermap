import re

with open('../label sources/manifest-builder.html', 'r') as f:
    html = f.read()

# 1. Remove old theme controls
html = re.sub(r'<div style="margin-left:auto; display:flex; gap:16px; align-items:center;" class="theme-controls-new">.*?(</div>\s*</div>\s*<div class="typography-panels")', r'\1', html, flags=re.DOTALL)

# 2. Update Typography Panels
primary_typo_replacement = """<div class="field" style="display: flex; align-items: center; justify-content: space-between;"><label style="margin-right:8px">text color</label><input type="color" id="primaryTextColor" value="#000000" style="padding:0; width: 32px; height: 24px; border: none; background: transparent; cursor: pointer; border-radius: 4px;"></div>
        </div>"""
html = re.sub(r'<div class="field" style="grid-template-columns: auto 1fr;"><label>color</label><input type="text" id="primaryColor".*?</div>\s*</div>', primary_typo_replacement, html)

secondary_typo_replacement = """<div class="field" style="display: flex; align-items: center; justify-content: space-between;"><label style="margin-right:8px">text color</label><input type="color" id="secondaryTextColor" value="#ffffff" style="padding:0; width: 32px; height: 24px; border: none; background: transparent; cursor: pointer; border-radius: 4px;"></div>
        </div>"""
html = re.sub(r'<div class="field" style="grid-template-columns: auto 1fr;"><label>color</label><input type="text" id="secondaryColor".*?</div>\s*</div>', secondary_typo_replacement, html)

# 3. Add to Primary Backplate
primary_backplate_override = """<div class="field"><label>paddingX</label><div class="value-wrap"><input type="number" id="primaryPaddingX" value="14" min="0"><span class="unit">px</span></div></div>
        <div class="field" style="display: flex; align-items: center; justify-content: space-between;"><label style="margin-right:8px">override color</label><div style="display:flex; align-items:center; gap:8px;"><input type="checkbox" id="primaryOverrideColor"><input type="color" id="primaryColor" value="#ffffff" style="padding:0; width: 32px; height: 24px; border: none; background: transparent; cursor: pointer; border-radius: 4px;"></div></div>"""
html = html.replace('<div class="field"><label>paddingX</label><div class="value-wrap"><input type="number" id="primaryPaddingX" value="14" min="0"><span class="unit">px</span></div></div>', primary_backplate_override)

# 4. Add to Pointer
pointer_override = """<div class="field"><label>tipY</label><div class="value-wrap"><input type="number" id="pointerTipY" value="10" min="0"><span class="unit">px</span></div></div>
        <div class="field" style="display: flex; align-items: center; justify-content: space-between;"><label style="margin-right:8px">override color</label><div style="display:flex; align-items:center; gap:8px;"><input type="checkbox" id="pointerOverrideColor"><input type="color" id="pointerColor" value="#ffffff" style="padding:0; width: 32px; height: 24px; border: none; background: transparent; cursor: pointer; border-radius: 4px;"></div></div>"""
html = html.replace('<div class="field"><label>tipY</label><div class="value-wrap"><input type="number" id="pointerTipY" value="10" min="0"><span class="unit">px</span></div></div>\n        <input type="hidden" id="pointerIndependentColor" value="false">', pointer_override)

# 5. Add to Secondary Backplate
secondary_backplate_override = """<div class="field"><label>gap</label><div class="value-wrap"><input type="number" id="secondaryGap" value="4"><span class="unit">px</span></div></div>
        <div class="field" style="display: flex; align-items: center; justify-content: space-between;"><label style="margin-right:8px">override color</label><div style="display:flex; align-items:center; gap:8px;"><input type="checkbox" id="secondaryOverrideColor"><input type="color" id="secondaryColor" value="#ffffff" style="padding:0; width: 32px; height: 24px; border: none; background: transparent; cursor: pointer; border-radius: 4px;"></div></div>"""
html = html.replace('<div class="field"><label>gap</label><div class="value-wrap"><input type="number" id="secondaryGap" value="4"><span class="unit">px</span></div></div>', secondary_backplate_override)

# 6. Update buildManifest
build_manifest_logic = """
function buildManifest() {
  const m = {
    kind: state.kind,
    primary: {
      overrideColor: document.getElementById('primaryOverrideColor').checked,
      color: document.getElementById('primaryColor').value,
      height: parseInt(document.getElementById('primaryHeight').value, 10),
      capWidth: parseInt(document.getElementById('primaryCapWidth').value, 10),
      minWidth: parseInt(document.getElementById('primaryMinWidth').value, 10),
      paddingX: parseInt(document.getElementById('primaryPaddingX').value, 10),
      pointer: {
        overrideColor: document.getElementById('pointerOverrideColor').checked,
        color: document.getElementById('pointerColor').value,
        width: parseInt(document.getElementById('pointerWidth').value, 10),
        height: parseInt(document.getElementById('pointerHeight').value, 10),
        attachEdge: document.getElementById('pointerAttachEdge').value,
        attachFrom: document.getElementById('pointerAttachFrom').value,
        attachOffset: parseInt(document.getElementById('pointerAttachOffset').value, 10),
        tipX: parseInt(document.getElementById('pointerTipX').value, 10),
        tipY: parseInt(document.getElementById('pointerTipY').value, 10)
      },
      typography: {
        fontFamily: document.getElementById('primaryFontFamily').value,
        fontSize: parseInt(document.getElementById('primaryFontSize').value, 10),
        fontWeight: parseInt(document.getElementById('primaryFontWeight').value, 10),
        letterSpacing: parseFloat(document.getElementById('primaryLetterSpacing').value),
        lineHeight: parseFloat(document.getElementById('primaryLineHeight').value),
        textTransform: document.getElementById('primaryTextTransform').value,
        textAlign: document.getElementById('primaryTextAlign').value,
        color: document.getElementById('primaryTextColor').value
      }
    }
  };

  if (state.kind !== 'highlight') {
    m.secondary = {
      overrideColor: document.getElementById('secondaryOverrideColor').checked,
      color: document.getElementById('secondaryColor').value,
      height: parseInt(document.getElementById('secondaryHeight').value, 10),
      capWidth: parseInt(document.getElementById('secondaryCapWidth').value, 10),
      minWidth: parseInt(document.getElementById('secondaryMinWidth').value, 10),
      paddingX: parseInt(document.getElementById('secondaryPaddingX').value, 10),
      position: document.getElementById('secondaryPosition').value,
      align: document.getElementById('secondaryAlign').value,
      gap: parseInt(document.getElementById('secondaryGap').value, 10),
      typography: {
        fontFamily: document.getElementById('secondaryFontFamily').value,
        fontSize: parseInt(document.getElementById('secondaryFontSize').value, 10),
        fontWeight: parseInt(document.getElementById('secondaryFontWeight').value, 10),
        letterSpacing: parseFloat(document.getElementById('secondaryLetterSpacing').value),
        lineHeight: parseFloat(document.getElementById('secondaryLineHeight').value),
        textTransform: document.getElementById('secondaryTextTransform').value,
        textAlign: document.getElementById('secondaryTextAlign').value,
        color: document.getElementById('secondaryTextColor').value
      }
    };
  }
  return m;
}
"""
html = re.sub(r'function buildManifest\(\) \{.*?(?=\nfunction validate)', build_manifest_logic.strip() + "\n\n", html, flags=re.DOTALL)

# 7. Update applyManifestToForm
apply_manifest_logic = """
function applyManifestToForm(manifest) {
  const set = (id, value) => {
    if (value === undefined || value === null) return;
    const el = document.getElementById(id);
    if (!el) return;
    if (el.type === 'checkbox') el.checked = !!value;
    else el.value = value;
  };

  // Kind toggle
  if (manifest.kind === 'highlight' || manifest.kind === 'regular' || manifest.kind === 'both') {
    state.kind = manifest.kind;
    document.querySelectorAll('.kind-toggle button').forEach(b => {
      if (b.dataset.kind === manifest.kind) b.classList.add('active');
      else b.classList.remove('active');
    });
    const disp = manifest.kind !== 'highlight' ? 'block' : 'none';
    document.getElementById('secondaryGroup').style.display = disp;
    document.getElementById('secondaryTypoPanel').style.display = disp;
    document.getElementById('previewSecondary').disabled = manifest.kind === 'highlight';
  }

  // Primary
  const p = manifest.primary;
  if (p) {
    set('primaryOverrideColor', p.overrideColor);
    if (p.color) set('primaryColor', p.color);
    set('primaryHeight', p.height);
    set('primaryCapWidth', p.capWidth);
    set('primaryMinWidth', p.minWidth);
    set('primaryPaddingX', p.paddingX);
    if (p.pointer) {
      set('pointerOverrideColor', p.pointer.overrideColor);
      if (p.pointer.color) set('pointerColor', p.pointer.color);
      set('pointerWidth', p.pointer.width);
      set('pointerHeight', p.pointer.height);
      set('pointerAttachEdge', p.pointer.attachEdge);
      set('pointerAttachFrom', p.pointer.attachFrom);
      set('pointerAttachOffset', p.pointer.attachOffset);
      set('pointerTipX', p.pointer.tipX);
      set('pointerTipY', p.pointer.tipY);
      
      // Update toggle buttons for pointer
      document.querySelectorAll('#pointerAttachEdgeGrp button').forEach(b => {
        b.classList.toggle('active', b.dataset.val === p.pointer.attachEdge);
      });
      document.querySelectorAll('#pointerAttachFromGrp button').forEach(b => {
        b.classList.toggle('active', b.dataset.val === p.pointer.attachFrom);
      });
    }
    if (p.typography) {
      set('primaryFontFamily', p.typography.fontFamily);
      set('primaryFontSize', p.typography.fontSize);
      set('primaryFontWeight', p.typography.fontWeight);
      set('primaryLetterSpacing', p.typography.letterSpacing);
      set('primaryLineHeight', p.typography.lineHeight);
      set('primaryTextTransform', p.typography.textTransform);
      set('primaryTextAlign', p.typography.textAlign);
      if (p.typography.color) set('primaryTextColor', p.typography.color);
      
      document.querySelectorAll('#primaryTextTransformGrp button').forEach(b => {
        b.classList.toggle('active', b.dataset.val === p.typography.textTransform);
      });
      document.querySelectorAll('#primaryTextAlignGrp button').forEach(b => {
        b.classList.toggle('active', b.dataset.val === p.typography.textAlign);
      });
    }
  }

  // Secondary
  const s = manifest.secondary;
  if (s) {
    set('secondaryOverrideColor', s.overrideColor);
    if (s.color) set('secondaryColor', s.color);
    set('secondaryHeight', s.height);
    set('secondaryCapWidth', s.capWidth);
    set('secondaryMinWidth', s.minWidth);
    set('secondaryPaddingX', s.paddingX);
    set('secondaryPosition', s.position);
    set('secondaryAlign', s.align);
    set('secondaryGap', s.gap);
    
    document.querySelectorAll('#secondaryPositionGrp button').forEach(b => {
      b.classList.toggle('active', b.dataset.val === s.position);
    });
    document.querySelectorAll('#secondaryAlignGrp button').forEach(b => {
      b.classList.toggle('active', b.dataset.val === s.align);
    });

    if (s.typography) {
      set('secondaryFontFamily', s.typography.fontFamily);
      set('secondaryFontSize', s.typography.fontSize);
      set('secondaryFontWeight', s.typography.fontWeight);
      set('secondaryLetterSpacing', s.typography.letterSpacing);
      set('secondaryLineHeight', s.typography.lineHeight);
      set('secondaryTextTransform', s.typography.textTransform);
      set('secondaryTextAlign', s.typography.textAlign);
      if (s.typography.color) set('secondaryTextColor', s.typography.color);
      
      document.querySelectorAll('#secondaryTextTransformGrp button').forEach(b => {
        b.classList.toggle('active', b.dataset.val === s.typography.textTransform);
      });
      document.querySelectorAll('#secondaryTextAlignGrp button').forEach(b => {
        b.classList.toggle('active', b.dataset.val === s.typography.textAlign);
      });
    }
  }
}
"""
html = re.sub(r'function applyManifestToForm\(manifest\) \{.*?(?=\n// ============================================================================)', apply_manifest_logic.strip() + "\n", html, flags=re.DOTALL)

# 8. Update applyTheme to read from DOM directly and toggle vars
apply_theme_logic = """
function applyTheme(el) {
  const m = buildManifest();
  if (m.primary.overrideColor) el.style.setProperty('--primary-backplate-fill', m.primary.color);
  else el.style.removeProperty('--primary-backplate-fill');

  if (m.secondary && m.secondary.overrideColor) el.style.setProperty('--secondary-backplate-fill', m.secondary.color);
  else el.style.removeProperty('--secondary-backplate-fill');

  if (m.primary.pointer.overrideColor) el.style.setProperty('--pointer-fill', m.primary.pointer.color);
  else el.style.removeProperty('--pointer-fill');

  el.style.setProperty('--primary-text-color', m.primary.typography.color);
  if (m.secondary) el.style.setProperty('--secondary-text-color', m.secondary.typography.color);
}
"""
html = re.sub(r'function applyTheme\(el\) \{.*?(?=\nfunction measureText)', apply_theme_logic.strip() + "\n", html, flags=re.DOTALL)

# Remove the theme variables setup
html = re.sub(r"const themeMap = \{.*?^\};.*?\}\);\n\}\);\n", "", html, flags=re.DOTALL|re.MULTILINE)
html = re.sub(r"theme:\s*\{.*?\},", "", html, flags=re.DOTALL)


with open('../label sources/manifest-builder.html', 'w') as f:
    f.write(html)

print("Builder UI updated")
