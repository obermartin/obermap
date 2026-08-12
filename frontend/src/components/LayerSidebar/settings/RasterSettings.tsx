import React from "react";
import { Copy, Save, Info, X } from "lucide-react";
import { useTranslation } from "../../../contexts/I18nContext";
import type { LayerSettingsProps } from "./types";
import { DateRangeSettings } from "./raster/DateRangeSettings";
import { DisasterSettings } from "./raster/DisasterSettings";
import { WildfireFloodSettings } from "./raster/WildfireFloodSettings";
import { VisualSettings } from "./raster/VisualSettings";

export const RasterSettings: React.FC<LayerSettingsProps> = (props) => {
  const { t } = useTranslation();
  const {
    layer,
    updateLayerProperty,
    updateLayerDates,
    duplicateLayer,
    globalStartDate,
    globalEndDate,
    globalDateMode,
    syncGlobalDate,
  } = props;

  let defaultStartDate = "";
  let defaultEndDate = "";
  const todayStr = new Date().toISOString().split("T")[0];
  if (layer.type === "wildfires") {
    defaultEndDate = todayStr;
    const past7d = new Date(new Date().getTime() - 7 * 24 * 60 * 60 * 1000);
    defaultStartDate = past7d.toISOString().split("T")[0];
  } else {
    defaultStartDate = todayStr;
    defaultEndDate = todayStr;
  }

  const useGlobal = layer.useGlobalDate !== false;
  const isGlobalRange = globalDateMode === 'range';
  
  let effectiveStartDate = layer.startDate || defaultStartDate;
  let effectiveEndDate = layer.endDate || defaultEndDate;

  if (useGlobal) {
    if (layer.type === 'deepstate' || layer.type === 'nighttime') {
      effectiveStartDate = isGlobalRange ? (globalEndDate || defaultStartDate) : (globalStartDate || defaultStartDate);
    } else {
      effectiveStartDate = globalStartDate || defaultStartDate;
      effectiveEndDate = isGlobalRange ? (globalEndDate || defaultEndDate) : (globalStartDate || defaultEndDate);
    }
  }

  if (effectiveStartDate === 'today') effectiveStartDate = todayStr;
  if (effectiveEndDate === 'today') effectiveEndDate = todayStr;

  return (
    <>
      <div className="flex gap-2 mb-3">
        {updateLayerProperty && (
          <button
            onClick={() => {
              if (
                window.confirm(
                  t("Save current configuration as default preset for this layer?")
                )
              ) {
                updateLayerProperty(layer.id, "savePreset" as any, true);
              }
            }}
            className="flex-1 bg-white/5 hover:bg-white/10 text-white text-xs py-1.5 px-3 rounded flex items-center justify-center gap-2 transition-colors border border-white/10"
            title={t("Save as Default")}
          >
            <Save size={14} />
            {t("Save Preset")}
          </button>
        )}
        {duplicateLayer && (
          <button
            onClick={() => duplicateLayer(layer.id)}
            className="flex-1 bg-white/5 hover:bg-white/10 text-white text-xs py-1.5 px-3 rounded flex items-center justify-center gap-2 transition-colors border border-white/10"
            title={t("Duplicate Layer")}
          >
            <Copy size={14} />
            {t("Duplicate")}
          </button>
        )}
      </div>

      <div className="flex flex-col gap-2 pt-2 border-t border-white/10">
        <div className="flex items-center justify-between min-h-[28px]">
          <span className="text-[10px] text-white/50 tracking-wider font-semibold uppercase flex items-center gap-1">
            {t("DATE")}
            {layer.type === "wildfires" && (
              <span className="text-white/30" title={t("Past 7 days recommended")}>
                <Info size={12} />
              </span>
            )}
          </span>

          <DateRangeSettings {...props} />
        </div>

        {layer.id === "floods" && updateLayerDates && (
          <div className="flex flex-col gap-2 pt-2 border-t border-white/10">
            <div className="flex items-center justify-between">
              <label className="text-[10px] text-white font-semibold tracking-wider">
                {t("START DATE")}
              </label>
              <input
                type="date"
                max={todayStr}
                value={effectiveStartDate}
                onChange={(e) =>
                  updateLayerDates(layer.id, e.target.value, layer.endDate || effectiveEndDate)
                }
                className={`bg-black border ${!useGlobal ? 'border-yellow-500/50' : 'border-white/20'} px-2 py-1 text-xs text-white outline-none focus:border-white/50 w-[140px]`}
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
            <div className="flex items-center justify-between">
              <label className="text-[10px] text-white font-semibold tracking-wider">
                {t("END DATE")}
              </label>
              <input
                type="date"
                max={todayStr}
                value={effectiveEndDate}
                onChange={(e) =>
                  updateLayerDates(layer.id, layer.startDate || effectiveStartDate, e.target.value)
                }
                className={`bg-black border ${!useGlobal ? 'border-yellow-500/50' : 'border-white/20'} px-2 py-1 text-xs text-white outline-none focus:border-white/50 w-[140px]`}
                style={{ colorScheme: "dark" }}
              />
            </div>
          </div>
        )}

        {layer.type === "nighttime" && updateLayerProperty && (
          <div className="flex flex-col gap-2 pt-2 border-t border-white/10">
            <div className="flex items-center justify-between gap-2">
              <label className="text-[10px] text-white font-semibold tracking-wider">
                {t("DATE")}
              </label>
              <div className="flex items-center gap-1 flex-1 justify-end">
                <input
                  type="date"
                  max={todayStr}
                  value={layer.nighttimeDate || effectiveStartDate}
                  onChange={(e) => {
                    updateLayerProperty(layer.id, "nighttimeDate", e.target.value);
                    updateLayerProperty(layer.id, "useGlobalDate", false);
                  }}
                  className={`bg-black border ${!useGlobal ? 'border-yellow-500/50' : 'border-white/20'} px-2 py-1 text-xs text-white outline-none focus:border-white/50 rounded`}
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
            </div>
          </div>
        )}

        <WildfireFloodSettings {...props} />
        <DisasterSettings {...props} />
        <VisualSettings {...props} />

      </div>
    </>
  );
};
