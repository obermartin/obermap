import React from "react";
import { useTranslation } from "../../../../contexts/I18nContext";
import type { LayerSettingsProps } from "../types";

export const VisualSettings: React.FC<LayerSettingsProps> = ({ layer, updateLayerProperty }) => {
  const { t } = useTranslation();

  if (!updateLayerProperty) return null;

  return (
    <>
      {(layer.customLayer === true || layer.id.startsWith("upload-") || layer.id.startsWith("url-")) && (
        <div className="flex flex-col gap-1 mt-1 pt-2 border-t border-white/10">
          <div className="flex justify-between items-center mb-2">
            <label className="text-[10px] text-white font-semibold tracking-wider">
              {t("DATA SOURCE")}
            </label>
          </div>
          <input
            type="text"
            placeholder={t("e.g. Mapbox, NASA, custom...")}
            value={layer.dataSource || ""}
            onChange={(e) =>
              updateLayerProperty(layer.id, "dataSource", e.target.value)
            }
            className="w-full bg-black border border-white/20 px-2 py-1 text-xs text-white outline-none focus:border-white/50 mb-3"
          />
        </div>
      )}

      {layer.type !== "gdacs_earthquakes" && (
        <div
          className={`flex flex-col gap-1 mt-1 ${layer.type === "deepstate" ? "" : "pt-2 border-t border-white/10"}`}
        >
          <div className="flex justify-between items-end">
            <label className="text-[10px] text-white font-semibold tracking-wider">
              {t("OPACITY")}
            </label>
            <span className="text-[10px] text-white/70 font-mono">
              {Math.round(
                (layer.opacity ??
                  (layer.type === "deepstate" || layer.type === "nighttime"
                    ? 0.5
                    : 1.0)) * 100
              )}
              %
            </span>
          </div>
          <input
            type="range"
            min="0"
            max="100"
            value={
              (layer.opacity ??
                (layer.type === "deepstate" || layer.type === "nighttime"
                  ? 0.5
                  : 1.0)) * 100
            }
            onChange={(e) =>
              updateLayerProperty(
                layer.id,
                "opacity",
                Number(e.target.value) / 100
              )
            }
            className="w-full accent-white h-1 bg-white/20 appearance-none cursor-pointer"
          />
        </div>
      )}

      {(layer.type === "raster" || layer.type === "satellite") && (
        <details className="mt-3 group">
          <summary className="text-[10px] text-white font-semibold tracking-wider cursor-pointer select-none hover:text-white transition-colors flex items-center justify-between uppercase">
            {t("Adjustments")}
            <span className="group-open:rotate-180 transition-transform text-xs">
              ▼
            </span>
          </summary>
          <div className="pt-3 pb-1 flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <div className="flex justify-between items-end">
                <label className="text-[10px] text-white font-semibold tracking-wider">
                  {t("BRIGHTNESS")}
                </label>
                <span className="text-[10px] text-white/70 font-mono">
                  {Math.round((layer.brightness ?? 0) * 100)}%
                </span>
              </div>
              <input
                type="range"
                min="-100"
                max="100"
                value={(layer.brightness ?? 0) * 100}
                onChange={(e) =>
                  updateLayerProperty(
                    layer.id,
                    "brightness",
                    Number(e.target.value) / 100
                  )
                }
                onDoubleClick={() => updateLayerProperty(layer.id, "brightness", 0)}
                className="w-full accent-white h-1 bg-white/20 appearance-none cursor-pointer"
                title="Double-click to reset"
              />
            </div>
            <div className="flex flex-col gap-1">
              <div className="flex justify-between items-end">
                <label className="text-[10px] text-white font-semibold tracking-wider">
                  {t("CONTRAST")}
                </label>
                <span className="text-[10px] text-white/70 font-mono">
                  {Math.round((layer.contrast ?? 0) * 100)}%
                </span>
              </div>
              <input
                type="range"
                min="-100"
                max="100"
                value={(layer.contrast ?? 0) * 100}
                onChange={(e) =>
                  updateLayerProperty(
                    layer.id,
                    "contrast",
                    Number(e.target.value) / 100
                  )
                }
                onDoubleClick={() => updateLayerProperty(layer.id, "contrast", 0)}
                className="w-full accent-white h-1 bg-white/20 appearance-none cursor-pointer"
                title="Double-click to reset"
              />
            </div>
            <div className="flex flex-col gap-1">
              <div className="flex justify-between items-end">
                <label className="text-[10px] text-white font-semibold tracking-wider">
                  {t("SATURATION")}
                </label>
                <span className="text-[10px] text-white/70 font-mono">
                  {Math.round((layer.saturation ?? 0) * 100)}%
                </span>
              </div>
              <input
                type="range"
                min="-100"
                max="100"
                value={(layer.saturation ?? 0) * 100}
                onChange={(e) =>
                  updateLayerProperty(
                    layer.id,
                    "saturation",
                    Number(e.target.value) / 100
                  )
                }
                onDoubleClick={() => updateLayerProperty(layer.id, "saturation", 0)}
                className="w-full accent-white h-1 bg-white/20 appearance-none cursor-pointer"
                title="Double-click to reset"
              />
            </div>
            <div className="flex flex-col gap-1">
              <div className="flex justify-between items-end">
                <label className="text-[10px] text-white font-semibold tracking-wider">
                  {t("HUE ROTATE")}
                </label>
                <span className="text-[10px] text-white/70 font-mono">
                  {layer.hue ?? 0}°
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="360"
                value={layer.hue ?? 0}
                onChange={(e) =>
                  updateLayerProperty(layer.id, "hue", Number(e.target.value))
                }
                onDoubleClick={() => updateLayerProperty(layer.id, "hue", 0)}
                className="w-full accent-white h-1 bg-white/20 appearance-none cursor-pointer"
                title="Double-click to reset"
              />
            </div>
          </div>
        </details>
      )}
    </>
  );
};
