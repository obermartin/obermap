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

    # 2. Add individual opacity sliders and raster adjustments
    # Let's do this by reading the whole block from 3514 to 3584 and writing it out.
    # We can just write a separate python script to do regex replace or find/replace.
