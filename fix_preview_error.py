import re

with open('frontend/src/components/LayerSidebar.tsx', 'r') as f:
    tsx = f.read()

old_sethtml = """    manager.loadTemplates([templateName]).then(() => {
      const p = manager.getPreviewHtml(templateName, isRegular ? { primary: "Preview", secondary: "Label" } : "Preview");
      const tpl = manager.templates.get(templateName);
      if (tpl && tpl.manifest) setManifest(tpl.manifest);
      setHtml(p);
    }).catch(e => console.error(e));"""
new_sethtml = """    const tryLoad = async (retries = 2) => {
      try {
        await manager.loadTemplates([templateName]);
        const p = manager.getPreviewHtml(templateName, isRegular ? { primary: "Preview", secondary: "Label" } : "Preview");
        const tpl = manager.templates.get(templateName);
        if (tpl && tpl.manifest) setManifest(tpl.manifest);
        setHtml(p);
      } catch (e) {
        if (retries > 0) {
          setTimeout(() => tryLoad(retries - 1), 500);
        } else {
          console.error(e);
          setHtml(`<div style="color:red; font-size:10px;">Error</div>`);
        }
      }
    };
    tryLoad();"""
tsx = tsx.replace(old_sethtml, new_sethtml)

with open('frontend/src/components/LayerSidebar.tsx', 'w') as f:
    f.write(tsx)

print("Preview error handling fixed")
