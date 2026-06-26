import os

file_path = '/Users/obermartin/Documents/CURRENT/BILD/OBERMAP2/frontend/src/components/LayerSidebar.tsx'

with open(file_path, 'r') as f:
    content = f.read()

# 1. Remove the old scaling section (around lines 2229-2275)
old_scaling_block = '''              <div className="mt-8 pt-6 border-t border-white/20">
                <div className="text-xs font-semibold tracking-wider text-white mb-4">
                  {t("EXPORT SCALING")}
                </div>
                
                <div className="flex flex-col gap-6">
                  <div>
                    <label className="text-xs text-white/60 mb-2 flex justify-between font-semibold tracking-wider">
                      <span>{t("BASEMAP LABELS SCALE")}</span>
                      <span>{settings.exportBasemapScale ?? 1.0}x</span>
                    </label>
                    <input
                      type="range"
                      min="1"
                      max="5"
                      step="0.1"
                      value={settings.exportBasemapScale ?? 1.0}
                      onChange={(e) => setSettings(prev => ({ ...prev, exportBasemapScale: parseFloat(e.target.value) }))}
                      className="w-full accent-white"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-white/60 mb-2 flex justify-between font-semibold tracking-wider">
                      <span>{t("ANNOTATIONS SCALE")}</span>
                      <span>{settings.exportAnnotationScale ?? 1.0}x</span>
                    </label>
                    <input
                      type="range"
                      min="1"
                      max="5"
                      step="0.1"
                      value={settings.exportAnnotationScale ?? 1.0}
                      onChange={(e) => setSettings(prev => ({ ...prev, exportAnnotationScale: parseFloat(e.target.value) }))}
                      className="w-full accent-white"
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-white/80">{t("Preview Scaling on Map")}</span>
                    <button
                      onClick={() => setSettings(prev => ({ ...prev, exportScalePreview: !prev.exportScalePreview }))}
                      className={`w-9 h-5 rounded-full relative transition-colors ${(settings.exportScalePreview) ? "bg-white" : "bg-white/20"}`}
                    >
                      <div className={`w-3 h-3 rounded-full absolute top-1 transition-all ${(settings.exportScalePreview) ? "left-5 bg-black" : "left-1 bg-white"}`} />
                    </button>
                  </div>
                </div>
              </div>

'''

if old_scaling_block in content:
    content = content.replace(old_scaling_block, '')
    print("Old block removed.")
else:
    print("Old block not found! Exact match failed.")

# 2. Insert new scaling section after 3D Terrain settings
# 3D terrain settings block ends with:
#                 </div>
#               )}
#             </div>
#           </details>
#
#           {/* ANIMATIONS */}
insertion_point = '''              )}
            </div>
          </details>

          {/* ANIMATIONS */}'''

new_scaling_block = '''              )}
            </div>
          </details>

          {/* SCALING */}
          <details className="group flex flex-col gap-[2px] w-full mb-6" open>
            <summary className="w-full h-11 bg-white/[0.08] hover:bg-white/[0.12] transition-colors rounded-sm flex items-center px-4 text-xs font-semibold tracking-widest text-white/90 uppercase cursor-pointer list-none [&::-webkit-details-marker]:hidden">
              <svg className="w-4 h-4 mr-3 text-white/50 group-open:rotate-90 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
              {language === 'de' ? 'SKALIERUNG' : 'SCALING'}
            </summary>
            
            <div className="p-4 flex flex-col gap-6 bg-black mt-[2px]">
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between px-1">
                  <label className="text-[10px] text-white font-semibold tracking-wider uppercase">
                    {t("BASEMAP LABELS SCALE")}
                  </label>
                  <span className="text-[10px] text-white/50 font-mono">
                    {settings.exportBasemapScale ?? 1.0}x
                  </span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="5"
                  step="0.1"
                  value={settings.exportBasemapScale ?? 1.0}
                  onChange={(e) => setSettings(prev => ({ ...prev, exportBasemapScale: parseFloat(e.target.value) }))}
                  className="w-full h-1 bg-white/20 rounded-full appearance-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:rounded-full"
                />
              </div>

              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between px-1">
                  <label className="text-[10px] text-white font-semibold tracking-wider uppercase">
                    {t("ANNOTATIONS SCALE")}
                  </label>
                  <span className="text-[10px] text-white/50 font-mono">
                    {settings.exportAnnotationScale ?? 1.0}x
                  </span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="5"
                  step="0.1"
                  value={settings.exportAnnotationScale ?? 1.0}
                  onChange={(e) => setSettings(prev => ({ ...prev, exportAnnotationScale: parseFloat(e.target.value) }))}
                  className="w-full h-1 bg-white/20 rounded-full appearance-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:rounded-full"
                />
              </div>
            </div>
          </details>

          {/* ANIMATIONS */}'''

if insertion_point in content:
    content = content.replace(insertion_point, new_scaling_block)
    print("New block inserted.")
else:
    print("Insertion point not found!")

with open(file_path, 'w') as f:
    f.write(content)

