import { useState } from "react";
import type { LayerSettingsProps } from "./types";
import { RasterSettings } from "./RasterSettings";
import { FlightsSettings } from "./FlightsSettings";
import { VesselsSettings } from "./VesselsSettings";
import { WeatherSettings } from "./WeatherSettings";
import { SplitSettings } from "./SplitSettings";
import { GeojsonSettings } from "./GeojsonSettings";
import { UtmGridSettings } from "./UtmGridSettings";
import { Play } from "lucide-react";
import { useTranslation } from "../../../contexts/I18nContext";

export const LayerSettings = (props: LayerSettingsProps) => {
  const { layer, isNestedChild, updateLayerProperty, mapviewButtons } = props;
  const { t } = useTranslation();
  const [activeTriggerDropdown, setActiveTriggerDropdown] = useState<'reveal' | 'hide' | null>(null);

  if (layer.type === "split") {
    return <SplitSettings {...props} />;
  }

  // Active edit state for non-split layers is checked in LayerItem, but just to be sure we wrap it here.
  return (
    <div
      className={`bg-black p-3 pt-2 flex flex-col gap-4 text-sm animate-in slide-in-from-top-2 relative z-0 transition-opacity duration-200 ${!layer.visible ? "opacity-40" : "opacity-100"} ${isNestedChild ? "ml-6" : ""}`}
    >
      <div className="flex justify-between items-center gap-2 mb-[-4px] relative">
        {/* Reveal Trigger */}
        <div className="relative flex-1">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setActiveTriggerDropdown(activeTriggerDropdown === 'reveal' ? null : 'reveal');
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-semibold rounded-full border transition-colors w-max max-w-full ${layer.animationTriggerId ? 'bg-white text-black border-white' : 'bg-transparent text-white/50 border-white/20 hover:text-white hover:border-white/50'}`}
            title={t("Set Reveal Trigger")}
          >
            <Play size={10} fill={layer.animationTriggerId ? "currentColor" : "none"} className={`shrink-0 ${layer.animationTriggerId ? "" : "ml-0.5"}`} />
            <span className="truncate uppercase tracking-wider">
              {layer.animationTriggerId ? ((mapviewButtons.find(b => b.id === layer.animationTriggerId)?.buttonText || mapviewButtons.find(b => b.id === layer.animationTriggerId)?.text) || "Trigger") : t("REVEAL")}
            </span>
          </button>
          {activeTriggerDropdown === 'reveal' && (
            <div className="absolute top-full left-0 mt-1 w-48 bg-[#222] border border-white/20 rounded-md shadow-2xl z-[60] flex flex-col py-1 max-h-48 overflow-y-auto">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  updateLayerProperty(layer.id, "animationTriggerId", undefined);
                  setActiveTriggerDropdown(null);
                }}
                className="text-left px-3 py-2 text-xs font-semibold text-white/50 hover:bg-white/10 hover:text-white transition-colors uppercase tracking-wider"
              >
                {t("NONE")}
              </button>
              {mapviewButtons.map(b => (
                <button
                  key={b.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    const nextId = layer.animationTriggerId === b.id ? undefined : b.id;
                    updateLayerProperty(layer.id, "animationTriggerId", nextId);
                    if (nextId !== undefined && layer.hideAnimationTriggerId === b.id) {
                      updateLayerProperty(layer.id, "hideAnimationTriggerId", undefined);
                    }
                    setActiveTriggerDropdown(null);
                  }}
                  className={`text-left px-3 py-2 text-xs transition-colors font-semibold uppercase tracking-wider ${layer.animationTriggerId === b.id ? 'bg-white/20 text-white' : 'text-white/80 hover:bg-white/10 hover:text-white'}`}
                >
                  <span className="truncate block w-full">{b.buttonText || b.text}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Hide Trigger */}
        <div className="relative flex-1 flex justify-end">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setActiveTriggerDropdown(activeTriggerDropdown === 'hide' ? null : 'hide');
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-semibold rounded-full border transition-colors w-max max-w-full ${layer.hideAnimationTriggerId ? 'bg-white text-black border-white' : 'bg-transparent text-white/50 border-white/20 hover:text-white hover:border-white/50'}`}
            title={t("Set Hide Trigger")}
          >
            <span className="truncate uppercase tracking-wider">
              {layer.hideAnimationTriggerId ? ((mapviewButtons.find(b => b.id === layer.hideAnimationTriggerId)?.buttonText || mapviewButtons.find(b => b.id === layer.hideAnimationTriggerId)?.text) || "Trigger") : t("HIDE")}
            </span>
            <Play size={10} fill={layer.hideAnimationTriggerId ? "currentColor" : "none"} className={`shrink-0 ${layer.hideAnimationTriggerId ? "scale-x-[-1]" : "scale-x-[-1] ml-[-1px]"}`} />
          </button>
          {activeTriggerDropdown === 'hide' && (
            <div className="absolute top-full right-0 mt-1 w-48 bg-[#222] border border-white/20 rounded-md shadow-2xl z-[60] flex flex-col py-1 max-h-48 overflow-y-auto">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  updateLayerProperty(layer.id, "hideAnimationTriggerId", undefined);
                  setActiveTriggerDropdown(null);
                }}
                className="text-left px-3 py-2 text-xs font-semibold text-white/50 hover:bg-white/10 hover:text-white transition-colors uppercase tracking-wider"
              >
                {t("NONE")}
              </button>
              {mapviewButtons.map(b => (
                <button
                  key={b.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    const nextId = layer.hideAnimationTriggerId === b.id ? undefined : b.id;
                    updateLayerProperty(layer.id, "hideAnimationTriggerId", nextId);
                    if (nextId !== undefined && layer.animationTriggerId === b.id) {
                      updateLayerProperty(layer.id, "animationTriggerId", undefined);
                    }
                    setActiveTriggerDropdown(null);
                  }}
                  className={`text-left px-3 py-2 text-xs transition-colors font-semibold uppercase tracking-wider ${layer.hideAnimationTriggerId === b.id ? 'bg-white/20 text-white' : 'text-white/80 hover:bg-white/10 hover:text-white'}`}
                >
                  <span className="truncate block w-full">{b.buttonText || b.text}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {layer.type === "flights" ? (
        <FlightsSettings {...props} />
      ) : layer.type === "vessels" ? (
        <VesselsSettings {...props} />
      ) : layer.type === "weather_forecast" ? (
        <WeatherSettings {...props} />
      ) : layer.type === "raster" ||
        layer.type === "satellite" ||
        layer.type === "deepstate" ||
        layer.type === "gdacs_earthquakes" ||
        layer.type === "cems_rapid_mapping" ||
        layer.type === "gdacs_volcanoes" ||
        layer.type === "wildfires" ||
        layer.type === "gdacs_cyclones" ||
        layer.type === "nighttime" ? (
        <RasterSettings {...props} />
      ) : layer.type === "utm_grid" ? (
        <UtmGridSettings {...props} />
      ) : (
        <GeojsonSettings {...props} />
      )}
    </div>
  );
};
