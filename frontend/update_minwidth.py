import re

with open('../label sources/manifest-builder.html', 'r') as f:
    html = f.read()

# Update updatePrimaryFromSvgs
replacement_primary = """    const cap = state.files['primary_left-cap'];
    const capW = Math.round(cap.sourceWidth);
    document.getElementById('primaryHeight').value = Math.round(cap.sourceHeight);
    document.getElementById('primaryCapWidth').value = capW;
    document.getElementById('primaryMinWidth').value = capW * 2;
    state._primaryDimsAutoSet = true;"""
html = re.sub(r"    const cap = state\.files\['primary_left-cap'\];\n    document\.getElementById\('primaryHeight'\)\.value = Math\.round\(cap\.sourceHeight\);\n    document\.getElementById\('primaryCapWidth'\)\.value = Math\.round\(cap\.sourceWidth\);\n    state\._primaryDimsAutoSet = true;", replacement_primary, html)

replacement_secondary = """    const cap = state.files['secondary_left-cap'];
    const capW = Math.round(cap.sourceWidth);
    document.getElementById('secondaryHeight').value = Math.round(cap.sourceHeight);
    document.getElementById('secondaryCapWidth').value = capW;
    document.getElementById('secondaryMinWidth').value = capW * 2;
    state._secondaryDimsAutoSet = true;"""
html = re.sub(r"    const cap = state\.files\['secondary_left-cap'\];\n    document\.getElementById\('secondaryHeight'\)\.value = Math\.round\(cap\.sourceHeight\);\n    document\.getElementById\('secondaryCapWidth'\)\.value = Math\.round\(cap\.sourceWidth\);\n    state\._secondaryDimsAutoSet = true;", replacement_secondary, html)

with open('../label sources/manifest-builder.html', 'w') as f:
    f.write(html)

print("minWidth updated")
