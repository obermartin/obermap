import React from "react";
import { Download, Loader2 } from "lucide-react";
import { useTranslation } from "../../../../contexts/I18nContext";
import type { LayerSettingsProps } from "../types";

export const DisasterSettings: React.FC<LayerSettingsProps> = ({ layer, updateLayerProperty, exportReadyData }) => {
  const { t } = useTranslation();

  if (layer.type !== "gdacs_earthquakes" && layer.type !== "gdacs_volcanoes" && layer.type !== "gdacs_cyclones") {
    return null;
  }

  return (
    <>
      {layer.type === "gdacs_earthquakes" && updateLayerProperty && (
        <div className="flex flex-col gap-2 pt-3 border-t border-white/10 mt-2">
          <label className="text-[10px] text-white font-semibold tracking-wider">
            {t("EARTHQUAKE OVERLAYS")}
          </label>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-white/80">{t("Shakemap")}</span>
                <button
                  onClick={() =>
                    updateLayerProperty(layer.id, "shakemapEnabled", layer.shakemapEnabled === false ? true : false)
                  }
                  className="relative inline-flex h-4 w-8 items-center rounded-full transition-colors focus:outline-none"
                  style={{
                    backgroundColor: layer.shakemapEnabled !== false ? "#ffffff" : "rgba(255, 255, 255, 0.2)",
                  }}
                >
                  <span
                    className={`inline-block h-3 w-3 transform rounded-full bg-black transition-transform ${
                      layer.shakemapEnabled !== false ? "translate-x-4" : "translate-x-1"
                    }`}
                  />
                </button>
              </div>
              {layer.shakemapEnabled !== false && (
                <div className="flex items-center justify-between pl-4">
                  <span className="text-[10px] text-white/60">{t("Color-code")}</span>
                  <button
                    onClick={() =>
                      updateLayerProperty(layer.id, "colorCodeShakemap", layer.colorCodeShakemap === false ? true : false)
                    }
                    className="relative inline-flex h-3 w-6 items-center rounded-full transition-colors focus:outline-none"
                    style={{
                      backgroundColor: layer.colorCodeShakemap !== false ? "#ffffff" : "rgba(255, 255, 255, 0.2)",
                    }}
                  >
                    <span
                      className={`inline-block h-2 w-2 transform rounded-full bg-black transition-transform ${
                        layer.colorCodeShakemap !== false ? "translate-x-3" : "translate-x-1"
                      }`}
                    />
                  </button>
                </div>
              )}
              {exportReadyData["gdacs_earthquakes"]?.id && exportReadyData["gdacs_earthquakes"].ready !== "empty" && (
                <div className="flex flex-col gap-2 mt-2">
                  <button
                    disabled={!exportReadyData["gdacs_earthquakes"].ready}
                    onClick={() => {
                      window.dispatchEvent(
                        new CustomEvent("requestGeoJsonExport", {
                          detail: { type: "gdacs_earthquakes", id: exportReadyData["gdacs_earthquakes"].id },
                        })
                      );
                    }}
                    className={`text-xs py-1.5 px-3 rounded flex items-center gap-2 justify-center transition-colors ${
                      exportReadyData["gdacs_earthquakes"].ready
                        ? "bg-white/10 hover:bg-white/20 text-white cursor-pointer"
                        : "bg-white/5 text-white/50 cursor-not-allowed"
                    }`}
                  >
                    {exportReadyData["gdacs_earthquakes"].ready ? (
                      <>
                        <Download size={14} />
                        {t("Export Selected")}
                      </>
                    ) : (
                      <>
                        <Loader2 size={14} className="animate-spin" />
                        {t("Loading...")}
                      </>
                    )}
                  </button>
                </div>
              )}
              {layer.shakemapEnabled !== false && (
                <div className="flex flex-col gap-1 mt-2">
                  <div className="flex justify-between items-end">
                    <label className="text-[10px] text-white/60 font-semibold tracking-wider uppercase">
                      {t("OPACITY")}
                    </label>
                    <span className="text-[10px] text-white/50 font-mono">
                      {Math.round((layer.shakemapOpacity ?? 1.0) * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={(layer.shakemapOpacity ?? 1.0) * 100}
                    onChange={(e) =>
                      updateLayerProperty(layer.id, "shakemapOpacity", Number(e.target.value) / 100)
                    }
                    className="w-full accent-white h-1 bg-white/20 appearance-none cursor-pointer"
                  />
                </div>
              )}
            </div>

            <div className="flex flex-col gap-2 pt-2 border-t border-white/10">
              <div className="flex items-center justify-between">
                <span className="text-xs text-white/80">{t("Infrastructure Damage")}</span>
                <button
                  onClick={() =>
                    updateLayerProperty(layer.id, "copernicusEnabled", layer.copernicusEnabled ? false : true)
                  }
                  className="relative inline-flex h-4 w-8 items-center rounded-full transition-colors focus:outline-none"
                  style={{
                    backgroundColor: layer.copernicusEnabled ? "#ffffff" : "rgba(255, 255, 255, 0.2)",
                  }}
                >
                  <span
                    className={`inline-block h-3 w-3 transform rounded-full bg-black transition-transform ${
                      layer.copernicusEnabled ? "translate-x-4" : "translate-x-1"
                    }`}
                  />
                </button>
              </div>
              {layer.copernicusEnabled && (
                <div className="flex flex-col gap-1 mt-1">
                  <div className="flex justify-between items-end">
                    <label className="text-[10px] text-white/60 font-semibold tracking-wider uppercase">
                      {t("OPACITY")}
                    </label>
                    <span className="text-[10px] text-white/50 font-mono">
                      {Math.round((layer.copernicusOpacity ?? 1.0) * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={(layer.copernicusOpacity ?? 1.0) * 100}
                    onChange={(e) =>
                      updateLayerProperty(layer.id, "copernicusOpacity", Number(e.target.value) / 100)
                    }
                    className="w-full accent-white h-1 bg-white/20 appearance-none cursor-pointer"
                  />


                </div>
              )}
            </div>

            <div className="flex flex-col gap-2 pt-2 border-t border-white/10">
              <div className="flex items-center justify-between">
                <span className="text-xs text-white/80">{t("Did You Feel It? (10km)")}</span>
                <button
                  onClick={() =>
                    updateLayerProperty(layer.id, "usgsDyfi10kmEnabled", layer.usgsDyfi10kmEnabled ? false : true)
                  }
                  className="relative inline-flex h-4 w-8 items-center rounded-full transition-colors focus:outline-none"
                  style={{
                    backgroundColor: layer.usgsDyfi10kmEnabled ? "#ffffff" : "rgba(255, 255, 255, 0.2)",
                  }}
                >
                  <span
                    className={`inline-block h-3 w-3 transform rounded-full bg-black transition-transform ${
                      layer.usgsDyfi10kmEnabled ? "translate-x-4" : "translate-x-1"
                    }`}
                  />
                </button>
              </div>
              {layer.usgsDyfi10kmEnabled && (
                <div className="flex flex-col gap-1 mt-1">
                  <div className="flex justify-between items-end">
                    <label className="text-[10px] text-white/60 font-semibold tracking-wider uppercase">
                      {t("OPACITY")}
                    </label>
                    <span className="text-[10px] text-white/50 font-mono">
                      {Math.round((layer.usgsDyfi10kmOpacity ?? 0.6) * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={(layer.usgsDyfi10kmOpacity ?? 0.6) * 100}
                    onChange={(e) =>
                      updateLayerProperty(layer.id, "usgsDyfi10kmOpacity", Number(e.target.value) / 100)
                    }
                    className="w-full accent-white h-1 bg-white/20 appearance-none cursor-pointer"
                  />
                </div>
              )}
            </div>

            <div className="flex flex-col gap-2 pt-2 border-t border-white/10">
              <div className="flex items-center justify-between">
                <span className="text-xs text-white/80">{t("Did You Feel It? (1km)")}</span>
                <button
                  onClick={() =>
                    updateLayerProperty(layer.id, "usgsDyfi1kmEnabled", layer.usgsDyfi1kmEnabled ? false : true)
                  }
                  className="relative inline-flex h-4 w-8 items-center rounded-full transition-colors focus:outline-none"
                  style={{
                    backgroundColor: layer.usgsDyfi1kmEnabled ? "#ffffff" : "rgba(255, 255, 255, 0.2)",
                  }}
                >
                  <span
                    className={`inline-block h-3 w-3 transform rounded-full bg-black transition-transform ${
                      layer.usgsDyfi1kmEnabled ? "translate-x-4" : "translate-x-1"
                    }`}
                  />
                </button>
              </div>
              {layer.usgsDyfi1kmEnabled && (
                <div className="flex flex-col gap-1 mt-1">
                  <div className="flex justify-between items-end">
                    <label className="text-[10px] text-white/60 font-semibold tracking-wider uppercase">
                      {t("OPACITY")}
                    </label>
                    <span className="text-[10px] text-white/50 font-mono">
                      {Math.round((layer.usgsDyfi1kmOpacity ?? 0.6) * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={(layer.usgsDyfi1kmOpacity ?? 0.6) * 100}
                    onChange={(e) =>
                      updateLayerProperty(layer.id, "usgsDyfi1kmOpacity", Number(e.target.value) / 100)
                    }
                    className="w-full accent-white h-1 bg-white/20 appearance-none cursor-pointer"
                  />
                </div>
              )}
            </div>

            <div className="flex flex-col gap-2 pt-2 border-t border-white/10">
              <div className="flex items-center justify-between">
                <span className="text-xs text-white/80">{t("Landslides")}</span>
                <button
                  onClick={() =>
                    updateLayerProperty(layer.id, "usgsLandslideEnabled", layer.usgsLandslideEnabled ? false : true)
                  }
                  className="relative inline-flex h-4 w-8 items-center rounded-full transition-colors focus:outline-none"
                  style={{
                    backgroundColor: layer.usgsLandslideEnabled ? "#ffffff" : "rgba(255, 255, 255, 0.2)",
                  }}
                >
                  <span
                    className={`inline-block h-3 w-3 transform rounded-full bg-black transition-transform ${
                      layer.usgsLandslideEnabled ? "translate-x-4" : "translate-x-1"
                    }`}
                  />
                </button>
              </div>
              {layer.usgsLandslideEnabled && (
                <>
                  <div className="flex flex-col gap-1 mt-1">
                    <div className="flex justify-between items-end">
                      <label className="text-[10px] text-white/60 font-semibold tracking-wider uppercase">
                        {t("OPACITY")}
                      </label>
                      <span className="text-[10px] text-white/50 font-mono">
                        {Math.round((layer.usgsLandslideOpacity ?? 0.8) * 100)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={(layer.usgsLandslideOpacity ?? 0.8) * 100}
                      onChange={(e) =>
                        updateLayerProperty(layer.id, "usgsLandslideOpacity", Number(e.target.value) / 100)
                      }
                      className="w-full accent-white h-1 bg-white/20 appearance-none cursor-pointer"
                    />
                  </div>
                  <details className="mt-2 group">
                    <summary className="text-[10px] text-white/80 font-semibold tracking-wider cursor-pointer select-none hover:text-white transition-colors flex items-center justify-between uppercase">
                      {t("Adjustments")}
                      <span className="group-open:rotate-180 transition-transform text-xs">▼</span>
                    </summary>
                    <div className="pt-3 pb-1 flex flex-col gap-3">
                      <div className="flex flex-col gap-1">
                        <div className="flex justify-between items-end">
                          <label className="text-[10px] text-white font-semibold tracking-wider">
                            {t("BRIGHTNESS")}
                          </label>
                          <span className="text-[10px] text-white/70 font-mono">
                            {Math.round(((layer.usgsLandslideBrightness ?? 0) + 1) * 100)}%
                          </span>
                        </div>
                        <input
                          type="range"
                          min="-100"
                          max="100"
                          value={(layer.usgsLandslideBrightness ?? 0) * 100}
                          onChange={(e) =>
                            updateLayerProperty(layer.id, "usgsLandslideBrightness", Number(e.target.value) / 100)
                          }
                          className="w-full accent-white h-1 bg-white/20 appearance-none cursor-pointer"
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <div className="flex justify-between items-end">
                          <label className="text-[10px] text-white font-semibold tracking-wider">
                            {t("CONTRAST")}
                          </label>
                          <span className="text-[10px] text-white/70 font-mono">
                            {Math.round(((layer.usgsLandslideContrast ?? 0) + 1) * 100)}%
                          </span>
                        </div>
                        <input
                          type="range"
                          min="-100"
                          max="100"
                          value={(layer.usgsLandslideContrast ?? 0) * 100}
                          onChange={(e) =>
                            updateLayerProperty(layer.id, "usgsLandslideContrast", Number(e.target.value) / 100)
                          }
                          className="w-full accent-white h-1 bg-white/20 appearance-none cursor-pointer"
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <div className="flex justify-between items-end">
                          <label className="text-[10px] text-white font-semibold tracking-wider">
                            {t("SATURATION")}
                          </label>
                          <span className="text-[10px] text-white/70 font-mono">
                            {Math.round(((layer.usgsLandslideSaturation ?? 0) + 1) * 100)}%
                          </span>
                        </div>
                        <input
                          type="range"
                          min="-100"
                          max="100"
                          value={(layer.usgsLandslideSaturation ?? 0) * 100}
                          onChange={(e) =>
                            updateLayerProperty(layer.id, "usgsLandslideSaturation", Number(e.target.value) / 100)
                          }
                          className="w-full accent-white h-1 bg-white/20 appearance-none cursor-pointer"
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <div className="flex justify-between items-end">
                          <label className="text-[10px] text-white font-semibold tracking-wider">
                            {t("HUE ROTATION")}
                          </label>
                          <span className="text-[10px] text-white/70 font-mono">
                            {Math.round(layer.usgsLandslideHue ?? 0)}°
                          </span>
                        </div>
                        <input
                          type="range"
                          min="0"
                          max="360"
                          value={layer.usgsLandslideHue ?? 0}
                          onChange={(e) => updateLayerProperty(layer.id, "usgsLandslideHue", Number(e.target.value))}
                          className="w-full accent-white h-1 bg-white/20 appearance-none cursor-pointer"
                        />
                      </div>
                    </div>
                  </details>
                </>
              )}
            </div>

            <div className="flex flex-col gap-2 pt-2 border-t border-white/10">
              <div className="flex items-center justify-between">
                <span className="text-xs text-white/80">{t("Ground Liquefaction")}</span>
                <button
                  onClick={() =>
                    updateLayerProperty(layer.id, "usgsLiquefactionEnabled", layer.usgsLiquefactionEnabled ? false : true)
                  }
                  className="relative inline-flex h-4 w-8 items-center rounded-full transition-colors focus:outline-none"
                  style={{
                    backgroundColor: layer.usgsLiquefactionEnabled ? "#ffffff" : "rgba(255, 255, 255, 0.2)",
                  }}
                >
                  <span
                    className={`inline-block h-3 w-3 transform rounded-full bg-black transition-transform ${
                      layer.usgsLiquefactionEnabled ? "translate-x-4" : "translate-x-1"
                    }`}
                  />
                </button>
              </div>
              {layer.usgsLiquefactionEnabled && (
                <>
                  <div className="flex flex-col gap-1 mt-1">
                    <div className="flex justify-between items-end">
                      <label className="text-[10px] text-white/60 font-semibold tracking-wider uppercase">
                        {t("OPACITY")}
                      </label>
                      <span className="text-[10px] text-white/50 font-mono">
                        {Math.round((layer.usgsLiquefactionOpacity ?? 0.8) * 100)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={(layer.usgsLiquefactionOpacity ?? 0.8) * 100}
                      onChange={(e) =>
                        updateLayerProperty(layer.id, "usgsLiquefactionOpacity", Number(e.target.value) / 100)
                      }
                      className="w-full accent-white h-1 bg-white/20 appearance-none cursor-pointer"
                    />
                  </div>
                  <details className="mt-2 group">
                    <summary className="text-[10px] text-white/80 font-semibold tracking-wider cursor-pointer select-none hover:text-white transition-colors flex items-center justify-between uppercase">
                      {t("Adjustments")}
                      <span className="group-open:rotate-180 transition-transform text-xs">▼</span>
                    </summary>
                    <div className="pt-3 pb-1 flex flex-col gap-3">
                      <div className="flex flex-col gap-1">
                        <div className="flex justify-between items-end">
                          <label className="text-[10px] text-white font-semibold tracking-wider">
                            {t("BRIGHTNESS")}
                          </label>
                          <span className="text-[10px] text-white/70 font-mono">
                            {Math.round(((layer.usgsLiquefactionBrightness ?? 0) + 1) * 100)}%
                          </span>
                        </div>
                        <input
                          type="range"
                          min="-100"
                          max="100"
                          value={(layer.usgsLiquefactionBrightness ?? 0) * 100}
                          onChange={(e) =>
                            updateLayerProperty(layer.id, "usgsLiquefactionBrightness", Number(e.target.value) / 100)
                          }
                          className="w-full accent-white h-1 bg-white/20 appearance-none cursor-pointer"
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <div className="flex justify-between items-end">
                          <label className="text-[10px] text-white font-semibold tracking-wider">
                            {t("CONTRAST")}
                          </label>
                          <span className="text-[10px] text-white/70 font-mono">
                            {Math.round(((layer.usgsLiquefactionContrast ?? 0) + 1) * 100)}%
                          </span>
                        </div>
                        <input
                          type="range"
                          min="-100"
                          max="100"
                          value={(layer.usgsLiquefactionContrast ?? 0) * 100}
                          onChange={(e) =>
                            updateLayerProperty(layer.id, "usgsLiquefactionContrast", Number(e.target.value) / 100)
                          }
                          className="w-full accent-white h-1 bg-white/20 appearance-none cursor-pointer"
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <div className="flex justify-between items-end">
                          <label className="text-[10px] text-white font-semibold tracking-wider">
                            {t("SATURATION")}
                          </label>
                          <span className="text-[10px] text-white/70 font-mono">
                            {Math.round(((layer.usgsLiquefactionSaturation ?? 0) + 1) * 100)}%
                          </span>
                        </div>
                        <input
                          type="range"
                          min="-100"
                          max="100"
                          value={(layer.usgsLiquefactionSaturation ?? 0) * 100}
                          onChange={(e) =>
                            updateLayerProperty(layer.id, "usgsLiquefactionSaturation", Number(e.target.value) / 100)
                          }
                          className="w-full accent-white h-1 bg-white/20 appearance-none cursor-pointer"
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <div className="flex justify-between items-end">
                          <label className="text-[10px] text-white font-semibold tracking-wider">
                            {t("HUE ROTATION")}
                          </label>
                          <span className="text-[10px] text-white/70 font-mono">
                            {Math.round(layer.usgsLiquefactionHue ?? 0)}°
                          </span>
                        </div>
                        <input
                          type="range"
                          min="0"
                          max="360"
                          value={layer.usgsLiquefactionHue ?? 0}
                          onChange={(e) => updateLayerProperty(layer.id, "usgsLiquefactionHue", Number(e.target.value))}
                          className="w-full accent-white h-1 bg-white/20 appearance-none cursor-pointer"
                        />
                      </div>
                    </div>
                  </details>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {layer.type === "gdacs_volcanoes" && exportReadyData["gdacs_volcanoes"]?.id && exportReadyData["gdacs_volcanoes"].ready !== "empty" && (
        <div className="flex flex-col gap-2 pt-2 border-t border-white/10 mt-1">
          <button
            disabled={!exportReadyData["gdacs_volcanoes"].ready}
            onClick={() => {
              window.dispatchEvent(
                new CustomEvent("requestGeoJsonExport", {
                  detail: { type: "gdacs_volcanoes", id: exportReadyData["gdacs_volcanoes"].id },
                })
              );
            }}
            className={`text-xs py-1.5 px-3 rounded flex items-center gap-2 justify-center transition-colors ${
              exportReadyData["gdacs_volcanoes"].ready
                ? "bg-white/10 hover:bg-white/20 text-white cursor-pointer"
                : "bg-white/5 text-white/50 cursor-not-allowed"
            }`}
          >
            {exportReadyData["gdacs_volcanoes"].ready ? (
              <>
                <Download size={14} />
                {t("Export Selected")}
              </>
            ) : (
              <>
                <Loader2 size={14} className="animate-spin" />
                {t("Loading...")}
              </>
            )}
          </button>
        </div>
      )}

      {layer.type === "gdacs_cyclones" && exportReadyData["gdacs_cyclones"]?.id && exportReadyData["gdacs_cyclones"].ready !== "empty" && (
        <div className="flex flex-col gap-2 pt-2 border-t border-white/10 mt-1">
          <button
            disabled={!exportReadyData["gdacs_cyclones"].ready}
            onClick={() => {
              window.dispatchEvent(
                new CustomEvent("requestGeoJsonExport", {
                  detail: { type: "gdacs_cyclones", id: exportReadyData["gdacs_cyclones"].id },
                })
              );
            }}
            className={`text-xs py-1.5 px-3 rounded flex items-center gap-2 justify-center transition-colors ${
              exportReadyData["gdacs_cyclones"].ready
                ? "bg-white/10 hover:bg-white/20 text-white cursor-pointer"
                : "bg-white/5 text-white/50 cursor-not-allowed"
            }`}
          >
            {exportReadyData["gdacs_cyclones"].ready ? (
              <>
                <Download size={14} />
                {t("Export Selected")}
              </>
            ) : (
              <>
                <Loader2 size={14} className="animate-spin" />
                {t("Loading...")}
              </>
            )}
          </button>
        </div>
      )}
    </>
  );
};
