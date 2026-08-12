import React from "react";
import { useTranslation } from "../../../contexts/I18nContext";
import type { AppSettings } from "../../../types";

export interface LabelDensitySliderProps {
  settings: AppSettings;
  setSettings: React.Dispatch<React.SetStateAction<AppSettings>>;
}

export const LabelDensitySlider: React.FC<LabelDensitySliderProps> = ({ settings, setSettings }) => {
  const { t } = useTranslation();

  return (
    <div className="p-4 border-b border-white/10">
      <label className="text-xs text-white mb-2 block font-semibold tracking-wider">
        {t("LABEL DENSITY")} ({settings.labelDensity ?? 50}%)
      </label>
      <div className="flex items-center gap-3">
        <span className="text-xs text-white/50 w-8 text-right">0%</span>
        <div className="relative flex-1 flex flex-col justify-center h-8">
          <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 flex justify-between px-2 pointer-events-none">
            {[...Array(11)].map((_, i) => (
              <div key={i} className="w-[1px] h-2.5 bg-white/30" />
            ))}
          </div>
          <input
            type="range"
            min="0"
            max="100"
            value={settings.labelDensity ?? 50}
            onChange={(e) =>
              setSettings((prev) => ({
                ...prev,
                labelDensity: Number(e.target.value),
              }))
            }
            className="w-full accent-white h-1 bg-white/20 appearance-none cursor-pointer relative z-10"
          />
        </div>
        <span className="text-xs text-white/50 w-8">100%</span>
      </div>
    </div>
  );
};
