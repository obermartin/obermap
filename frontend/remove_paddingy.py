import re

with open('../label sources/manifest-builder.html', 'r') as f:
    html = f.read()

# 1. Remove from UI
html = re.sub(r'<div class="field"><label>paddingY</label>.*?id="primaryPaddingY".*?</div></div>\n?', '', html)
html = re.sub(r'<div class="field"><label>paddingY</label>.*?id="secondaryPaddingY".*?</div></div>\n?', '', html)

# 2. Remove from set() calls
html = re.sub(r'\s*set\(\'primaryPaddingY\',.*?\);', '', html)
html = re.sub(r'\s*set\(\'secondaryPaddingY\',.*?\);', '', html)

# 3. Remove from buildManifest()
html = re.sub(r'\s*paddingY:\s*parseInt\(document\.getElementById\(\'primaryPaddingY\'\)\.value,\s*10\),?', '', html)
html = re.sub(r'\s*paddingY:\s*parseInt\(document\.getElementById\(\'secondaryPaddingY\'\)\.value,\s*10\),?', '', html)

with open('../label sources/manifest-builder.html', 'w') as f:
    f.write(html)
print("Removed paddingY from manifest-builder.html")
