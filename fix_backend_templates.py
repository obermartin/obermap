import re

with open('backend/server.js', 'r') as f:
    js = f.read()

old_templates = """        let kind = 'regular'; // fallback
        try {
          const manifestStr = fs.readFileSync(path.join(templatesDir, id, 'manifest.json'), 'utf8');
          const manifest = JSON.parse(manifestStr);
          if (manifest.kind) {
            kind = manifest.kind;
          }
        } catch (e) {
          // ignore parsing errors and use fallback
        }
        return { id, kind };"""

new_templates = """        let kind = 'regular'; // fallback
        let fullManifest = null;
        try {
          const manifestStr = fs.readFileSync(path.join(templatesDir, id, 'manifest.json'), 'utf8');
          fullManifest = JSON.parse(manifestStr);
          if (fullManifest.kind) {
            kind = fullManifest.kind;
          }
        } catch (e) {
          // ignore parsing errors and use fallback
        }
        return { id, kind, manifest: fullManifest };"""

if old_templates in js:
    js = js.replace(old_templates, new_templates)
    with open('backend/server.js', 'w') as f:
        f.write(js)
    print("Backend templates fixed")
else:
    print("Could not find old_templates")
