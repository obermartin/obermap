import re

with open('../frontend/src/components/LayerSidebar.tsx', 'r') as f:
    tsx = f.read()

# We need to look up the manifest for the active template item.
# Inside LayerSidebar, `labelTemplates` is available via `workspaceData?.labelTemplates?.templates`.
# And `currentTheme` is `workspaceData.labelTemplates?.savedThemes?.[item.id] || {}`.
# Let's find the rendering block for the swatches.

# It is located around line 1271-1297
swatches_logic = """
                                  // Look up the template manifest
                                  const tplDef = workspaceData?.labelTemplates?.templates?.find((t: any) => t.id === item.templateId);
                                  const man = tplDef?.manifest;
                                  
                                  // Determine current values or fallbacks from manifest
                                  const primaryFill = currentTheme.primaryBackplateFill || man?.primary?.color || '#ffffff';
                                  const primaryText = currentTheme.primaryTextColor || man?.primary?.typography?.color || '#000000';
                                  const secFill = currentTheme.secondaryBackplateFill || man?.secondary?.color || '#ffffff';
                                  const secText = currentTheme.secondaryTextColor || man?.secondary?.typography?.color || '#ffffff';
                                  const pointerFill = currentTheme.pointerFill || man?.primary?.pointer?.color || '#ffffff';

                                  return (
                                    <>
                                      <div className="flex flex-col items-center gap-1 mt-3">
                                        <div className="flex w-12 h-6 rounded-full overflow-hidden border border-white/20">
                                          {man?.primary?.overrideColor ? (
                                            <input type="color" value={primaryFill} onChange={e => updateColor('primaryBackplateFill', e.target.value)} className="w-1/2 h-full p-0 border-0 bg-transparent cursor-pointer [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:border-none [&::-webkit-color-swatch]:rounded-none" title={t("Primary Fill")} />
                                          ) : (
                                            <div className="w-1/2 h-full bg-white/10" title={t("Original primary fill locked")} />
                                          )}
                                          <input type="color" value={primaryText} onChange={e => updateColor('primaryTextColor', e.target.value)} className="w-1/2 h-full p-0 border-0 bg-transparent cursor-pointer [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:border-none [&::-webkit-color-swatch]:rounded-none" title={t("Primary Text")} />
                                        </div>
                                        <span className="text-[9px] text-white/50 text-center leading-tight">{t("Primary")}</span>
                                      </div>
                                      
                                      {activeLabelTab === 'regular' && man?.secondary && (
                                        <div className="flex flex-col items-center gap-1 mt-3">
                                          <div className="flex w-12 h-6 rounded-full overflow-hidden border border-white/20">
                                            {man.secondary.overrideColor ? (
                                              <input type="color" value={secFill} onChange={e => updateColor('secondaryBackplateFill', e.target.value)} className="w-1/2 h-full p-0 border-0 bg-transparent cursor-pointer [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:border-none [&::-webkit-color-swatch]:rounded-none" title={t("Secondary Fill")} />
                                            ) : (
                                              <div className="w-1/2 h-full bg-white/10" title={t("Original secondary fill locked")} />
                                            )}
                                            <input type="color" value={secText} onChange={e => updateColor('secondaryTextColor', e.target.value)} className="w-1/2 h-full p-0 border-0 bg-transparent cursor-pointer [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:border-none [&::-webkit-color-swatch]:rounded-none" title={t("Secondary Text")} />
                                          </div>
                                          <span className="text-[9px] text-white/50 text-center leading-tight">{t("Secondary")}</span>
                                        </div>
                                      )}

                                      {man?.primary?.pointer?.overrideColor && (
                                        <div className="flex flex-col items-center gap-1 mt-3">
                                          <input type="color" value={pointerFill} onChange={e => updateColor('pointerFill', e.target.value)} className="w-6 h-6 p-0 border-0 bg-transparent cursor-pointer rounded-full overflow-hidden [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:border-none [&::-webkit-color-swatch]:rounded-full" title={t("Pointer Fill")} />
                                          <span className="text-[9px] text-white/50 text-center leading-tight max-w-[40px]">{t("Pointer")}</span>
                                        </div>
                                      )}

                                      {/* Accent Color removed per user request */}
                                    </>
                                  );
"""
# Need to replace the return block inside LayerSidebar
tsx = re.sub(r'                                return \(\n\s*<>\n\s*<div className="flex flex-col items-center gap-1 mt-3">.*?</>\n\s*\);', swatches_logic.strip(), tsx, flags=re.DOTALL)

with open('../frontend/src/components/LayerSidebar.tsx', 'w') as f:
    f.write(tsx)

print("LayerSidebar patched")
