import sys

def run():
    with open('frontend/src/components/LayerSidebar.tsx', 'r') as f:
        content = f.read()

    # 1. Hide generic opacity slider
    generic_opacity = """                  <div
                    className={`flex flex-col gap-1 mt-1 ${layer.type === "deepstate" ? "" : "pt-2 border-t border-white/10"}`}
                  >
                    <div className="flex justify-between items-end">
                      <label className="text-[10px] text-white font-semibold tracking-wider">
                        {t("OPACITY")}"""
    
    new_generic_opacity = """                  {layer.type !== "gdacs_earthquakes" && (
                  <div
                    className={`flex flex-col gap-1 mt-1 ${layer.type === "deepstate" ? "" : "pt-2 border-t border-white/10"}`}
                  >
                    <div className="flex justify-between items-end">
                      <label className="text-[10px] text-white font-semibold tracking-wider">
                        {t("OPACITY")}"""
    
    generic_opacity_end = """                      className="w-full accent-white h-1 bg-white/20 appearance-none cursor-pointer"
                    />
                  </div>"""

    new_generic_opacity_end = """                      className="w-full accent-white h-1 bg-white/20 appearance-none cursor-pointer"
                    />
                  </div>
                  )}"""

    content = content.replace(generic_opacity, new_generic_opacity)
    content = content.replace(generic_opacity_end, new_generic_opacity_end)

    def get_slider(prop_name, label, default_val=100):
        return f"""
                        {{layer.{prop_name.replace('Opacity', 'Enabled')} !== false && (
                          <div className="flex flex-col gap-1 mt-1">
                            <div className="flex justify-between items-end">
                              <label className="text-[10px] text-white/60 font-semibold tracking-wider uppercase">
                                {{t("OPACITY")}}
                              </label>
                              <span className="text-[10px] text-white/50 font-mono">
                                {{Math.round((layer.{prop_name} ?? {default_val/100}) * 100)}}%
                              </span>
                            </div>
                            <input
                              type="range"
                              min="0"
                              max="100"
                              value={{(layer.{prop_name} ?? {default_val/100}) * 100}}
                              onChange={{(e) => updateLayerProperty(layer.id, "{prop_name}", Number(e.target.value) / 100)}}
                              className="w-full accent-white h-1 bg-white/20 appearance-none cursor-pointer"
                            />
                          </div>
                        )}}"""

    def get_raster_adjustments(prefix):
        return f"""
                        {{layer.{prefix}Enabled && (
                          <details className="mt-2 group">
                            <summary className="text-[10px] text-white/80 font-semibold tracking-wider cursor-pointer select-none hover:text-white transition-colors flex items-center justify-between uppercase">
                              {{t("Adjustments")}}
                              <span className="group-open:rotate-180 transition-transform text-xs">▼</span>
                            </summary>
                            <div className="pt-3 pb-1 flex flex-col gap-3">
                              <div className="flex flex-col gap-1">
                                <div className="flex justify-between items-end">
                                  <label className="text-[10px] text-white font-semibold tracking-wider">{{t("BRIGHTNESS")}}</label>
                                  <span className="text-[10px] text-white/70 font-mono">{{Math.round(((layer.{prefix}Brightness ?? 0) + 1) * 100)}}%</span>
                                </div>
                                <input type="range" min="-100" max="100" value={{(layer.{prefix}Brightness ?? 0) * 100}} onChange={{(e) => updateLayerProperty(layer.id, "{prefix}Brightness", Number(e.target.value) / 100)}} className="w-full accent-white h-1 bg-white/20 appearance-none cursor-pointer" />
                              </div>
                              <div className="flex flex-col gap-1">
                                <div className="flex justify-between items-end">
                                  <label className="text-[10px] text-white font-semibold tracking-wider">{{t("CONTRAST")}}</label>
                                  <span className="text-[10px] text-white/70 font-mono">{{Math.round(((layer.{prefix}Contrast ?? 0) + 1) * 100)}}%</span>
                                </div>
                                <input type="range" min="-100" max="100" value={{(layer.{prefix}Contrast ?? 0) * 100}} onChange={{(e) => updateLayerProperty(layer.id, "{prefix}Contrast", Number(e.target.value) / 100)}} className="w-full accent-white h-1 bg-white/20 appearance-none cursor-pointer" />
                              </div>
                              <div className="flex flex-col gap-1">
                                <div className="flex justify-between items-end">
                                  <label className="text-[10px] text-white font-semibold tracking-wider">{{t("SATURATION")}}</label>
                                  <span className="text-[10px] text-white/70 font-mono">{{Math.round(((layer.{prefix}Saturation ?? 0) + 1) * 100)}}%</span>
                                </div>
                                <input type="range" min="-100" max="100" value={{(layer.{prefix}Saturation ?? 0) * 100}} onChange={{(e) => updateLayerProperty(layer.id, "{prefix}Saturation", Number(e.target.value) / 100)}} className="w-full accent-white h-1 bg-white/20 appearance-none cursor-pointer" />
                              </div>
                              <div className="flex flex-col gap-1">
                                <div className="flex justify-between items-end">
                                  <label className="text-[10px] text-white font-semibold tracking-wider">{{t("HUE ROTATION")}}</label>
                                  <span className="text-[10px] text-white/70 font-mono">{{Math.round(layer.{prefix}Hue ?? 0)}°</span>
                                </div>
                                <input type="range" min="0" max="360" value={{layer.{prefix}Hue ?? 0}} onChange={{(e) => updateLayerProperty(layer.id, "{prefix}Hue", Number(e.target.value))}} className="w-full accent-white h-1 bg-white/20 appearance-none cursor-pointer" />
                              </div>
                            </div>
                          </details>
                        )}}"""

    # We need to replace the entire 3513 to 3584 block.
    start_str = '                      <div className="flex flex-col gap-3">'
    end_str = '                        </div>\n                      </div>\n                    </div>\n                  )}'
    
    start_idx = content.find(start_str)
    end_idx = content.find(end_str, start_idx) + len(end_str)
    
    if start_idx == -1 or end_idx == -1:
        print("Could not find the block to replace!")
        sys.exit(1)
        
    old_block = content[start_idx:end_idx]

    new_block = f"""                      <div className="flex flex-col gap-3">
                        <div className="flex flex-col gap-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-white/80">{{t("Show GDACS Shakemap")}}</span>
                            <button onClick={{() => updateLayerProperty(layer.id, "shakemapEnabled", layer.shakemapEnabled === false ? true : false)}} className="relative inline-flex h-4 w-8 items-center rounded-full transition-colors focus:outline-none" style={{{{ backgroundColor: layer.shakemapEnabled !== false ? "#ffffff" : "rgba(255, 255, 255, 0.2)" }}}}>
                              <span className={{`inline-block h-3 w-3 transform rounded-full bg-black transition-transform ${{layer.shakemapEnabled !== false ? "translate-x-4" : "translate-x-1"}}`}} />
                            </button>
                          </div>
                          {{layer.shakemapEnabled !== false && (
                            <div className="flex items-center justify-between pl-4">
                              <span className="text-[10px] text-white/60">{{t("Color-code")}}</span>
                              <button onClick={{() => updateLayerProperty(layer.id, "colorCodeShakemap", layer.colorCodeShakemap === false ? true : false)}} className="relative inline-flex h-3 w-6 items-center rounded-full transition-colors focus:outline-none" style={{{{ backgroundColor: layer.colorCodeShakemap !== false ? "#ffffff" : "rgba(255, 255, 255, 0.2)" }}}}>
                                <span className={{`inline-block h-2 w-2 transform rounded-full bg-black transition-transform ${{layer.colorCodeShakemap !== false ? "translate-x-3" : "translate-x-1"}}`}} />
                              </button>
                            </div>
                          )}}
{get_slider('shakemapOpacity', 'OPACITY')}
                        </div>

                        <div className="flex flex-col gap-2 pt-2 border-t border-white/10">
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-white/80">{{t("Copernicus EMS Damage Data")}}</span>
                            <button onClick={{() => updateLayerProperty(layer.id, "copernicusEnabled", layer.copernicusEnabled ? false : true)}} className="relative inline-flex h-4 w-8 items-center rounded-full transition-colors focus:outline-none" style={{{{ backgroundColor: layer.copernicusEnabled ? "#ffffff" : "rgba(255, 255, 255, 0.2)" }}}}>
                              <span className={{`inline-block h-3 w-3 transform rounded-full bg-black transition-transform ${{layer.copernicusEnabled ? "translate-x-4" : "translate-x-1"}}`}} />
                            </button>
                          </div>
{get_slider('copernicusOpacity', 'OPACITY')}
                        </div>

                        <div className="flex flex-col gap-2 pt-2 border-t border-white/10">
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-white/80">{{t("USGS Did You Feel It? (10km resolution)")}}</span>
                            <button onClick={{() => updateLayerProperty(layer.id, "usgsDyfi10kmEnabled", layer.usgsDyfi10kmEnabled ? false : true)}} className="relative inline-flex h-4 w-8 items-center rounded-full transition-colors focus:outline-none" style={{{{ backgroundColor: layer.usgsDyfi10kmEnabled ? "#ffffff" : "rgba(255, 255, 255, 0.2)" }}}}>
                              <span className={{`inline-block h-3 w-3 transform rounded-full bg-black transition-transform ${{layer.usgsDyfi10kmEnabled ? "translate-x-4" : "translate-x-1"}}`}} />
                            </button>
                          </div>
{get_slider('usgsDyfi10kmOpacity', 'OPACITY', 60)}
                        </div>

                        <div className="flex flex-col gap-2 pt-2 border-t border-white/10">
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-white/80">{{t("USGS Did You Feel It? (1km resolution)")}}</span>
                            <button onClick={{() => updateLayerProperty(layer.id, "usgsDyfi1kmEnabled", layer.usgsDyfi1kmEnabled ? false : true)}} className="relative inline-flex h-4 w-8 items-center rounded-full transition-colors focus:outline-none" style={{{{ backgroundColor: layer.usgsDyfi1kmEnabled ? "#ffffff" : "rgba(255, 255, 255, 0.2)" }}}}>
                              <span className={{`inline-block h-3 w-3 transform rounded-full bg-black transition-transform ${{layer.usgsDyfi1kmEnabled ? "translate-x-4" : "translate-x-1"}}`}} />
                            </button>
                          </div>
{get_slider('usgsDyfi1kmOpacity', 'OPACITY', 60)}
                        </div>

                        <div className="flex flex-col gap-2 pt-2 border-t border-white/10">
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-white/80">{{t("USGS Ground Failure: Landslides")}}</span>
                            <button onClick={{() => updateLayerProperty(layer.id, "usgsLandslideEnabled", layer.usgsLandslideEnabled ? false : true)}} className="relative inline-flex h-4 w-8 items-center rounded-full transition-colors focus:outline-none" style={{{{ backgroundColor: layer.usgsLandslideEnabled ? "#ffffff" : "rgba(255, 255, 255, 0.2)" }}}}>
                              <span className={{`inline-block h-3 w-3 transform rounded-full bg-black transition-transform ${{layer.usgsLandslideEnabled ? "translate-x-4" : "translate-x-1"}}`}} />
                            </button>
                          </div>
{get_slider('usgsLandslideOpacity', 'OPACITY', 80)}
{get_raster_adjustments('usgsLandslide')}
                        </div>

                        <div className="flex flex-col gap-2 pt-2 border-t border-white/10">
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-white/80">{{t("USGS Ground Failure: Liquefaction")}}</span>
                            <button onClick={{() => updateLayerProperty(layer.id, "usgsLiquefactionEnabled", layer.usgsLiquefactionEnabled ? false : true)}} className="relative inline-flex h-4 w-8 items-center rounded-full transition-colors focus:outline-none" style={{{{ backgroundColor: layer.usgsLiquefactionEnabled ? "#ffffff" : "rgba(255, 255, 255, 0.2)" }}}}>
                              <span className={{`inline-block h-3 w-3 transform rounded-full bg-black transition-transform ${{layer.usgsLiquefactionEnabled ? "translate-x-4" : "translate-x-1"}}`}} />
                            </button>
                          </div>
{get_slider('usgsLiquefactionOpacity', 'OPACITY', 80)}
{get_raster_adjustments('usgsLiquefaction')}
                        </div>
                      </div>
                    </div>
                  )}"""

    # Fix the `layer.{prop_name.replace('Opacity', 'Enabled')} !== false`
    # For properties like `copernicusEnabled`, it's not `!== false`, it's just truthy check if not shakemap.
    new_block = new_block.replace('layer.copernicusEnabled !== false', 'layer.copernicusEnabled')
    new_block = new_block.replace('layer.usgsDyfi10kmEnabled !== false', 'layer.usgsDyfi10kmEnabled')
    new_block = new_block.replace('layer.usgsDyfi1kmEnabled !== false', 'layer.usgsDyfi1kmEnabled')
    new_block = new_block.replace('layer.usgsLandslideEnabled !== false', 'layer.usgsLandslideEnabled')
    new_block = new_block.replace('layer.usgsLiquefactionEnabled !== false', 'layer.usgsLiquefactionEnabled')

    content = content.replace(old_block, new_block)

    with open('frontend/src/components/LayerSidebar.tsx', 'w') as f:
        f.write(content)

run()
