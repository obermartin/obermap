import os

file_path = '/Users/obermartin/Documents/CURRENT/BILD/OBERMAP2/frontend/src/components/LayerSidebar.tsx'

with open(file_path, 'r') as f:
    content = f.read()

old_block = '''          <details className="group flex flex-col gap-[2px] w-full mb-6" open>
            <summary className="w-full h-11 bg-white/[0.08] hover:bg-white/[0.12] transition-colors rounded-sm flex items-center px-4 text-xs font-semibold tracking-widest text-white/90 uppercase cursor-pointer list-none [&::-webkit-details-marker]:hidden">
              <svg className="w-4 h-4 mr-3 text-white/50 group-open:rotate-90 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
              {t('SCALING')}
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
          </details>'''


new_block = '''          <details className="group flex flex-col gap-[2px] w-full mb-6">
            <summary className="relative p-3 flex items-center gap-2 bg-black text-xs text-white font-semibold tracking-wider cursor-pointer list-none outline-none [&::-webkit-details-marker]:hidden">
              <ChevronRight
                size={14}
                className="text-white/50 group-hover:text-white transition-colors group-open:hidden shrink-0"
              />
              <ChevronDown
                size={14}
                className="text-white/50 group-hover:text-white transition-colors hidden group-open:block shrink-0"
              />
              <span>{t("SCALING")}</span>
            </summary>
            <div className="p-3 flex flex-col gap-4 bg-black mt-[2px]">
              <div className="flex flex-col gap-2 px-1">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] text-white font-semibold tracking-wider">
                    {t("Basemap Labels Scale")}
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

              <div className="flex flex-col gap-2 px-1">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] text-white font-semibold tracking-wider">
                    {t("Annotations Scale")}
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
          </details>'''

if old_block in content:
    content = content.replace(old_block, new_block)
    print("LayerSidebar.tsx updated.")
else:
    print("Old block not found!")

with open(file_path, 'w') as f:
    f.write(content)

