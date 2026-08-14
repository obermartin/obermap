import React from "react";
import { useTranslation } from "../../../contexts/I18nContext";
import type { LayerSettingsProps } from "./types";

export const UtmGridSettings: React.FC<LayerSettingsProps> = ({
  layer,
  updateLayerProperty,
}) => {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-4 pb-2">
      <div className="flex items-center justify-between">
        <label className="text-xs text-white/70">{t("Grid Line Color")}</label>
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={layer.utmGridColor || "#7f7f7f"}
            onChange={(e) =>
              updateLayerProperty(layer.id, "utmGridColor", e.target.value)
            }
            className="w-6 h-6 p-0 border-0 rounded cursor-pointer"
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <label className="text-xs text-white/70">{t("Opacity")}</label>
          <span className="text-xs text-white font-mono">
            {Math.round((layer.opacity ?? 0.5) * 100)}%
          </span>
        </div>
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={layer.opacity ?? 0.5}
          onChange={(e) =>
            updateLayerProperty(
              layer.id,
              "opacity",
              parseFloat(e.target.value)
            )
          }
          className="w-full accent-white h-1 bg-white/20 rounded-lg appearance-none cursor-pointer"
        />
      </div>

      <div className="flex items-center justify-between">
        <label className="text-xs text-white/70">
          {t("Show Grid Labels")}
        </label>
        <button
          onClick={() =>
            updateLayerProperty(
              layer.id,
              "utmGridLabels",
              layer.utmGridLabels === false ? true : false
            )
          }
          className={`w-8 h-4 rounded-full transition-colors relative ${
            layer.utmGridLabels !== false ? "bg-white" : "bg-white/20"
          }`}
        >
          <div
            className={`absolute top-0.5 w-3 h-3 rounded-full transition-transform ${
              layer.utmGridLabels !== false
                ? "bg-black translate-x-4"
                : "bg-white translate-x-0.5"
            }`}
          />
        </button>
      </div>
    </div>
  );
};
