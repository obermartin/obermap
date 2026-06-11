import re

with open('frontend/vite.config.ts', 'r') as f:
    ts = f.read()

old_templates = """                let kind = 'regular'; // fallback
                try {
                  const manifestStr = fs.readFileSync(path.join(templatesDir, id, 'manifest.json'), 'utf8');
                  const manifest = JSON.parse(manifestStr);
                  if (manifest.kind) {
                    kind = manifest.kind;
                  }
                } catch (e) {
                  // ignore
                }
                return { id, kind };"""

new_templates = """                let kind = 'regular'; // fallback
                let fullManifest = null;
                try {
                  const manifestStr = fs.readFileSync(path.join(templatesDir, id, 'manifest.json'), 'utf8');
                  fullManifest = JSON.parse(manifestStr);
                  if (fullManifest.kind) {
                    kind = fullManifest.kind;
                  }
                } catch (e) {
                  // ignore
                }
                return { id, kind, manifest: fullManifest };"""

if old_templates in ts:
    ts = ts.replace(old_templates, new_templates)
    with open('frontend/vite.config.ts', 'w') as f:
        f.write(ts)
    print("Vite proxy fixed")
else:
    print("Could not find old_templates")
