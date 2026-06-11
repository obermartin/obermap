import re

with open('frontend/src/components/LayerSidebar.tsx', 'r') as f:
    tsx = f.read()

# Fix TemplatePreview state and logic
old_preview = """const TemplatePreview: React.FC<{ templateName?: string, isRegular: boolean, theme?: Theme }> = ({ templateName, isRegular, theme }) => {
  const [html, setHtml] = useState<string | null>(null);
  
  useEffect(() => {"""
new_preview = """const TemplatePreview: React.FC<{ templateName?: string, isRegular: boolean, theme?: Theme }> = ({ templateName, isRegular, theme }) => {
  const [html, setHtml] = useState<string | null>(null);
  const [manifest, setManifest] = useState<any>(null);
  
  useEffect(() => {"""
tsx = tsx.replace(old_preview, new_preview)

# Update the setHtml block
old_sethtml = """    manager.loadTemplates([templateName]).then(() => {
      const p = manager.getPreviewHtml(templateName, isRegular ? { primary: "Preview", secondary: "Label" } : "Preview");
      setHtml(p);
    }).catch(e => console.error(e));"""
new_sethtml = """    manager.loadTemplates([templateName]).then(() => {
      const p = manager.getPreviewHtml(templateName, isRegular ? { primary: "Preview", secondary: "Label" } : "Preview");
      const tpl = manager.templates.get(templateName);
      if (tpl && tpl.manifest) setManifest(tpl.manifest);
      setHtml(p);
    }).catch(e => console.error(e));"""
tsx = tsx.replace(old_sethtml, new_sethtml)

# Update the style block
old_style = """  const style = theme ? {
    '--primary-backplate-fill': theme.primaryBackplateFill,
    '--secondary-backplate-fill': theme.secondaryBackplateFill,
    '--pointer-fill': theme.pointerFill,
    '--primary-text-color': theme.primaryTextColor,
    '--secondary-text-color': theme.secondaryTextColor,
    '--accent-fill': theme.accentFill
  } as React.CSSProperties : undefined;"""
new_style = """  const style: any = {};
  if (theme && manifest) {
    if (manifest.primary?.overrideColor) style['--primary-backplate-fill'] = theme.primaryBackplateFill;
    if (manifest.secondary?.overrideColor) style['--secondary-backplate-fill'] = theme.secondaryBackplateFill;
    if (manifest.primary?.pointer?.overrideColor) style['--pointer-fill'] = theme.pointerFill;
    style['--primary-text-color'] = theme.primaryTextColor;
    style['--secondary-text-color'] = theme.secondaryTextColor;
    if (theme.accentFill) style['--accent-fill'] = theme.accentFill;
  }"""
tsx = tsx.replace(old_style, new_style)

with open('frontend/src/components/LayerSidebar.tsx', 'w') as f:
    f.write(tsx)

print("Preview fixed")
