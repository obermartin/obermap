import { useTranslation } from "../../../contexts/I18nContext";
import type { LayerSettingsProps } from "./types";
import { X } from "lucide-react";

export const WeatherSettings = (props: LayerSettingsProps) => {
  const { t } = useTranslation();
  const { layer, updateLayerProperty, updateLayerDates, syncGlobalDate, globalDateMode, globalStartDate, globalEndDate } = props;

  let defaultStartDate = "";
  const todayStr = new Date().toISOString().split("T")[0];
  defaultStartDate = todayStr;

  const useGlobal = layer.useGlobalDate !== false;
  const isGlobalRange = globalDateMode === 'range';
  
  let effectiveStartDate = layer.startDate || defaultStartDate;

  if (useGlobal) {
    effectiveStartDate = isGlobalRange ? (globalEndDate || defaultStartDate) : (globalStartDate || defaultStartDate);
  }

  if (effectiveStartDate === 'today') effectiveStartDate = todayStr;
  return (
    <>
      <div className="flex flex-col gap-4 pb-2">

                  {updateLayerDates && (
                    <div className="flex-1 flex justify-end items-center gap-1">
                      <input
                        type="date"
                        value={effectiveStartDate}
                        onChange={(e) =>
                          updateLayerDates(layer.id, e.target.value)
                        }
                        className={`bg-black border ${!useGlobal ? 'border-yellow-500/50' : 'border-white/20'} px-2 py-1 text-xs text-white outline-none focus:border-white/50 w-full max-w-[140px]`}
                        style={{ colorScheme: "dark" }}
                      />
                      {!useGlobal && syncGlobalDate && (
                        <button 
                          onClick={() => syncGlobalDate(layer.id)}
                          className="text-white/40 hover:text-white"
                          title={t("Sync with Global Date")}
                        >
                          <X size={14} />
                        </button>
                      )}
                    </div>
                  )}

                  <div className="flex flex-col gap-1.5">
                    <div className="flex justify-between items-end">
                      <label className="text-[10px] text-white/50 font-semibold tracking-wider uppercase">
                        {t("OPACITY")}
                      </label>
                      <span className="text-[10px] text-white/70 font-mono">
                        {Math.round((layer.opacity ?? 0.75) * 100)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      step="1"
                      value={Math.round((layer.opacity ?? 0.75) * 100)}
                      onChange={(e) =>
                        updateLayerProperty(
                          layer.id,
                          "opacity",
                          Number(e.target.value) / 100,
                        )
                      }
                      className="w-full accent-white h-1 bg-white/20 appearance-none cursor-pointer"
                    />
                  </div>


                  <div className="flex flex-col gap-2 mt-4 pt-4 border-t border-white/10">
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() =>
                          updateLayerProperty(
                            layer.id,
                            "showCityTemperatures",
                            layer.showCityTemperatures === false,
                          )
                        }
                        className="flex items-center justify-between px-3 py-2 bg-white/5 hover:bg-white/10 transition-colors cursor-pointer text-[10px] font-semibold tracking-wider uppercase text-left"
                      >
                        {t("City Temp.")}
                        <div
                          className={`w-9 h-5 rounded-full relative transition-colors shrink-0 ${layer.showCityTemperatures !== false ? "bg-white" : "bg-white/20"}`}
                        >
                          <div
                            className={`w-3 h-3 rounded-full absolute top-1 transition-all ${layer.showCityTemperatures !== false ? "left-5 bg-black" : "left-1 bg-white"}`}
                          />
                        </div>
                      </button>
                      <button
                        onClick={() =>
                          updateLayerProperty(
                            layer.id,
                            "showCityWeatherIcons",
                            layer.showCityWeatherIcons === false,
                          )
                        }
                        className={`flex items-center justify-between px-3 py-2 bg-white/5 hover:bg-white/10 transition-colors cursor-pointer text-[10px] font-semibold tracking-wider uppercase text-left ${layer.showCityTemperatures === false && layer.showCityWeatherIcons === false ? "opacity-50" : ""}`}
                      >
                        {t("City Icons")}
                        <div
                          className={`w-9 h-5 rounded-full relative transition-colors shrink-0 ${layer.showCityWeatherIcons !== false ? "bg-white" : "bg-white/20"}`}
                        >
                          <div
                            className={`w-3 h-3 rounded-full absolute top-1 transition-all ${layer.showCityWeatherIcons !== false ? "left-5 bg-black" : "left-1 bg-white"}`}
                          />
                        </div>
                      </button>
                      <button
                        onClick={() =>
                          updateLayerProperty(
                            layer.id,
                            "limitCityWeatherToGermany",
                            !layer.limitCityWeatherToGermany,
                          )
                        }
                        className="flex items-center justify-between px-3 py-2 bg-white/5 hover:bg-white/10 transition-colors cursor-pointer text-[10px] font-semibold tracking-wider uppercase text-left col-span-2"
                      >
                        {t("Limit to Germany")}
                        <div
                          className={`w-9 h-5 rounded-full relative transition-colors shrink-0 ${layer.limitCityWeatherToGermany ? "bg-white" : "bg-white/20"}`}
                        >
                          <div
                            className={`w-3 h-3 rounded-full absolute top-1 transition-all ${layer.limitCityWeatherToGermany ? "left-5 bg-black" : "left-1 bg-white"}`}
                          />
                        </div>
                      </button>
                    </div>
                  </div>

                  <button
                    onClick={() =>
                      updateLayerProperty(
                        layer.id,
                        "showWindParticles",
                        !layer.showWindParticles,
                      )
                    }
                    className={`w-full py-2 flex items-center justify-center gap-2 text-sm transition-colors border border-white/20 rounded-full mt-2 ${layer.showWindParticles ? "bg-white text-black font-semibold" : "text-white/60 hover:text-white hover:bg-white/5"}`}
                  >
                    {t("Wind Overlay")}
                  </button>

                  {layer.showWindParticles && (
                    <div className="flex flex-col gap-4 mt-2 pt-4 border-t border-white/10">
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          onClick={() =>
                            updateLayerProperty(
                              layer.id,
                              "windParticleSizeBySpeed",
                              layer.windParticleSizeBySpeed !== true,
                            )
                          }
                          className="flex items-center justify-between px-3 py-2 bg-white/5 hover:bg-white/10 transition-colors cursor-pointer text-[10px] font-semibold tracking-wider uppercase text-left"
                        >
                          {t("Size by speed")}
                          <div
                            className={`w-9 h-5 rounded-full relative transition-colors shrink-0 ${layer.windParticleSizeBySpeed === true ? "bg-white" : "bg-white/20"}`}
                          >
                            <div
                              className={`w-3 h-3 rounded-full absolute top-1 transition-all ${layer.windParticleSizeBySpeed === true ? "left-5 bg-black" : "left-1 bg-white"}`}
                            />
                          </div>
                        </button>
                        <button
                          onClick={() =>
                            updateLayerProperty(
                              layer.id,
                              "windParticleSpeedBySpeed",
                              layer.windParticleSpeedBySpeed === false,
                            )
                          }
                          className="flex items-center justify-between px-3 py-2 bg-white/5 hover:bg-white/10 transition-colors cursor-pointer text-[10px] font-semibold tracking-wider uppercase text-left"
                        >
                          {t("Motion by speed")}
                          <div
                            className={`w-9 h-5 rounded-full relative transition-colors shrink-0 ${layer.windParticleSpeedBySpeed !== false ? "bg-white" : "bg-white/20"}`}
                          >
                            <div
                              className={`w-3 h-3 rounded-full absolute top-1 transition-all ${layer.windParticleSpeedBySpeed !== false ? "left-5 bg-black" : "left-1 bg-white"}`}
                            />
                          </div>
                        </button>

                      </div>

                      <div className="flex flex-col gap-1 mt-2 border-t border-white/10 pt-3">
                        <div className="flex justify-between items-end">
                          <label className="text-[10px] text-white/50 font-semibold tracking-wider">
                            {t("WIND OPACITY")}
                          </label>
                          <span className="text-[10px] text-white/70 font-mono">
                            {Math.round((layer.windOpacity ?? 1) * 100)}%
                          </span>
                        </div>
                        <input
                          type="range"
                          min="0"
                          max="100"
                          value={(layer.windOpacity ?? 1) * 100}
                          onChange={(e) =>
                            updateLayerProperty(
                              layer.id,
                              "windOpacity",
                              Number(e.target.value) / 100,
                            )
                          }
                          className="w-full accent-white h-1 bg-white/20 appearance-none cursor-pointer"
                        />
                      </div>

                      <div className="flex flex-col gap-1">
                        <div className="flex justify-between items-end">
                          <label className="text-[10px] text-white/50 font-semibold tracking-wider">
                            {t("PARTICLE SIZE")}
                          </label>
                          <span className="text-[10px] text-white/70 font-mono">
                            {(layer.windParticleSize ?? 1.2).toFixed(1)}px
                          </span>
                        </div>
                        <input
                          type="range"
                          min="0.5"
                          max="3"
                          step="0.1"
                          value={layer.windParticleSize ?? 1.2}
                          onChange={(e) =>
                            updateLayerProperty(
                              layer.id,
                              "windParticleSize",
                              Number(e.target.value),
                            )
                          }
                          className="w-full accent-white h-1 bg-white/20 appearance-none cursor-pointer"
                        />
                      </div>

                      <div className="flex flex-col gap-1">
                        <div className="flex justify-between items-end">
                          <label className="text-[10px] text-white/50 font-semibold tracking-wider">
                            {t("PARTICLE TRAIL")}
                          </label>
                          <span className="text-[10px] text-white/70 font-mono">
                            {Math.round(layer.windParticleTrail ?? 90)}%
                          </span>
                        </div>
                        <input
                          type="range"
                          min="0"
                          max="100"
                          step="1"
                          value={layer.windParticleTrail ?? 90}
                          onChange={(e) =>
                            updateLayerProperty(
                              layer.id,
                              "windParticleTrail",
                              Number(e.target.value),
                            )
                          }
                          className="w-full accent-white h-1 bg-white/20 appearance-none cursor-pointer"
                        />
                      </div>
                    </div>
                  )}
                </div>
    </>
  );
};
