import React from "react";
import { useTranslation } from "../../../../contexts/I18nContext";
import type { LayerSettingsProps } from "../types";

export const WildfireFloodSettings: React.FC<LayerSettingsProps> = ({ layer, updateLayerProperty }) => {
  const { t } = useTranslation();

  if (layer.type !== "wildfires" && layer.id !== "floods") return null;
  if (!updateLayerProperty) return null;

  return (
    <div className="flex flex-col gap-2 pt-2 border-t border-white/10">
      <div className="flex flex-col gap-2 pt-2 border-t border-white/10">
        <div className="flex items-center justify-between">
          <span className="text-xs text-white/80">{t("Infrastructure Damage")}</span>
          <button
            onClick={() =>
              updateLayerProperty(layer.id, "copernicusEnabled", !layer.copernicusEnabled)
            }
            className="relative inline-flex h-4 w-8 items-center rounded-full transition-colors focus:outline-none"
            style={{
              backgroundColor: layer.copernicusEnabled
                ? "#ffffff"
                : "rgba(255, 255, 255, 0.2)",
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
                {t("CEMS OPACITY")}
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
                updateLayerProperty(
                  layer.id,
                  "copernicusOpacity",
                  Number(e.target.value) / 100
                )
              }
              className="w-full accent-white h-1 bg-white/20 appearance-none cursor-pointer"
            />


          </div>
        )}
      </div>
    </div>
  );
};
