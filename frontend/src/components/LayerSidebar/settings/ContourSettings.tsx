import { useTranslation } from "../../../contexts/I18nContext";
import type { LayerSettingsProps } from "./types";

export const ContourSettings = ({ layer, updateLayerProperty }: LayerSettingsProps) => {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-4">
      {/* Opacity */}
      <div className="flex flex-col gap-1">
        <div className="flex justify-between items-end">
          <label className="text-[10px] text-white font-semibold tracking-wider">{t("OPACITY")}</label>
          <span className="text-[10px] text-white/70 font-mono">
            {Math.round((layer.opacity !== undefined ? layer.opacity : 0.5) * 100)}%
          </span>
        </div>
        <input
          type="range"
          min="0"
          max="100"
          value={(layer.opacity !== undefined ? layer.opacity : 0.5) * 100}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateLayerProperty(layer.id, "opacity", Number(e.target.value) / 100)}
          className="w-full accent-white h-1 bg-white/20 appearance-none cursor-pointer"
        />
      </div>

      {/* Stroke Width */}
      <div className="flex flex-col gap-1">
        <div className="flex justify-between items-end">
          <label className="text-[10px] text-white font-semibold tracking-wider">{t("STROKE WIDTH")}</label>
          <span className="text-[10px] text-white/70 font-mono">
            {layer.contourWidth || 1}px
          </span>
        </div>
        <input
          type="range"
          min="0.5"
          max="5"
          step="0.5"
          value={layer.contourWidth || 1}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateLayerProperty(layer.id, "contourWidth", Number(e.target.value))}
          className="w-full accent-white h-1 bg-white/20 appearance-none cursor-pointer"
        />
      </div>

      {/* Color */}
      <div className="flex flex-col gap-1">
        <div className="flex justify-between items-center">
          <label className="text-[10px] text-white font-semibold tracking-wider mb-1">{t("COLOR")}</label>
          <input
            type="color"
            value={layer.contourColor || "#ffffff"}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateLayerProperty(layer.id, "contourColor", e.target.value)}
            className="w-6 h-6 p-0 border-0 bg-transparent cursor-pointer"
          />
        </div>
      </div>
    </div>
  );
};
