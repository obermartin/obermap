import React from "react";
import { X, Radio } from "lucide-react";
import { useTranslation } from "../../../../contexts/I18nContext";
import type { LayerSettingsProps } from "../types";

export const DateRangeSettings: React.FC<LayerSettingsProps> = (props) => {
  const { t } = useTranslation();
  const { layer, updateLayerDates, syncGlobalDate, globalDateMode, globalStartDate, globalEndDate, toggleLive } = props;

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
      {layer.type === "deepstate" && toggleLive && (
        <button
          onClick={() => toggleLive(layer.id)}
          className={`transition-colors flex items-center shrink-0 ${layer.isLive ? "text-[#ff0000] drop-shadow-[0_0_5px_rgba(255,0,0,0.8)]" : "text-white/50 hover:text-white"}`}
          title={
            layer.isLive ? "LIVE Mode Active" : "Enable LIVE Mode"
          }
        >
          <Radio size={16} />
        </button>
      )}
      {layer.type === "deepstate" && updateLayerDates && (
        <div className="flex-1 flex justify-end items-center gap-1">
          <input
            type="date"
            max={todayStr}
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
      {(layer.type === "gdacs_earthquakes" ||
        layer.type === "gdacs_volcanoes" ||
        layer.type === "gdacs_cyclones" ||
        layer.type === "wildfires") &&
        updateLayerDates && (
          <div className="flex-1 flex flex-col items-end gap-2">
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-white/50 min-w-[70px] text-right uppercase">
                {t("from")}
              </span>
              <input
                type="date"
                max={todayStr}
                value={effectiveStartDate}
                onChange={(e) =>
                  updateLayerDates(
                    layer.id,
                    e.target.value,
                    layer.endDate || effectiveEndDate,
                  )
                }
                className={`bg-black border ${!useGlobal ? 'border-yellow-500/50' : 'border-white/20'} px-2 py-1 text-xs text-white outline-none focus:border-white/50 w-full max-w-[110px]`}
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
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-white/50 min-w-[70px] text-right uppercase">
                {t("to")}
              </span>
              <input
                type="date"
                max={todayStr}
                value={effectiveEndDate}
                onChange={(e) =>
                  updateLayerDates(
                    layer.id,
                    layer.startDate || effectiveStartDate,
                    e.target.value,
                  )
                }
                className={`bg-black border ${!useGlobal ? 'border-yellow-500/50' : 'border-white/20'} px-2 py-1 text-xs text-white outline-none focus:border-white/50 w-full max-w-[110px]`}
                style={{ colorScheme: "dark" }}
              />
            </div>
          </div>
        )}
    </>
  );
};
