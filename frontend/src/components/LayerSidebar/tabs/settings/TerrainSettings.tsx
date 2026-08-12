import React from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useTranslation } from "../../../../contexts/I18nContext";
import type { AppSettings } from "../../../../types";

export interface TerrainSettingsProps {
  settings: AppSettings;
  setSettings: React.Dispatch<React.SetStateAction<AppSettings>>;
}

export const TerrainSettings: React.FC<TerrainSettingsProps> = ({ settings, setSettings }) => {
  const { t } = useTranslation();

  return (
    <details className="glass-outlined-container group w-full shrink-0">
      <summary className="relative p-3 flex items-center gap-2 bg-black text-xs text-white font-semibold tracking-wider cursor-pointer list-none outline-none [&::-webkit-details-marker]:hidden">
        <ChevronRight size={14} className="text-white/50 group-hover:text-white transition-colors group-open:hidden shrink-0" />
        <ChevronDown size={14} className="text-white/50 group-hover:text-white transition-colors hidden group-open:block shrink-0" />
        {t("3D TERRAIN")}
      </summary>
      
      <div className="p-3 flex flex-col gap-4 bg-black mt-[2px]">
        <div className="flex items-center justify-between px-1">
          <label className="text-[10px] text-white font-semibold tracking-wider">
            {t("Enable 3D Terrain")}
          </label>
          <button
            onClick={() => setSettings((prev) => ({ ...prev, enable3dTerrain: !prev.enable3dTerrain }))}
            className={`w-9 h-5 rounded-full relative transition-colors shrink-0 ${settings.enable3dTerrain ? "bg-white" : "bg-white/20"}`}
          >
            <div className={`w-3 h-3 rounded-full absolute top-1 transition-all ${settings.enable3dTerrain ? "left-5 bg-black" : "left-1 bg-white"}`} />
          </button>
        </div>

        {settings.enable3dTerrain && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2 px-1">
              <div className="flex items-center justify-between">
                <label className="text-[10px] text-white font-semibold tracking-wider">
                  {t("Exaggeration")}
                </label>
                <span className="text-[10px] text-white/50 font-mono">
                  {(settings.terrainExaggeration ?? 1).toFixed(1)}x
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="3"
                step="0.1"
                value={settings.terrainExaggeration ?? 1.5}
                onChange={(e) => setSettings((prev) => ({ ...prev, terrainExaggeration: parseFloat(e.target.value) }))}
                className="w-full h-1 bg-white/20 rounded-full appearance-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:rounded-full"
              />
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between px-1">
                <label className="text-[10px] text-white font-semibold tracking-wider">
                  {t("Hillshade (Shadows)")}
                </label>
                <button
                  onClick={() => setSettings((prev) => ({ ...prev, enableHillshade: !prev.enableHillshade }))}
                  className={`w-9 h-5 rounded-full relative transition-colors shrink-0 ${settings.enableHillshade ? "bg-white" : "bg-white/20"}`}
                >
                  <div className={`w-3 h-3 rounded-full absolute top-1 transition-all ${settings.enableHillshade ? "left-5 bg-black" : "left-1 bg-white"}`} />
                </button>
              </div>

              {settings.enableHillshade && (
                <div className="flex flex-col gap-3 pl-2 pr-1 mt-1 border-l-2 border-white/10">
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center justify-between">
                      <label className="text-[9px] text-white/70 font-semibold tracking-wider uppercase">
                        {t("Shadow Opacity")}
                      </label>
                      <span className="text-[9px] text-white/50 font-mono">
                        {Math.round((settings.hillshadeShadowOpacity ?? 0.5) * 100)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.05"
                      value={settings.hillshadeShadowOpacity ?? 0.5}
                      onChange={(e) => setSettings((prev) => ({ ...prev, hillshadeShadowOpacity: parseFloat(e.target.value) }))}
                      className="w-full h-1 bg-white/20 rounded-full appearance-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2.5 [&::-webkit-slider-thumb]:h-2.5 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:rounded-full"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center justify-between">
                      <label className="text-[9px] text-white/70 font-semibold tracking-wider uppercase">
                        {t("Highlight Opacity")}
                      </label>
                      <span className="text-[9px] text-white/50 font-mono">
                        {Math.round((settings.hillshadeHighlightOpacity ?? 0.5) * 100)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.05"
                      value={settings.hillshadeHighlightOpacity ?? 0.5}
                      onChange={(e) => setSettings((prev) => ({ ...prev, hillshadeHighlightOpacity: parseFloat(e.target.value) }))}
                      className="w-full h-1 bg-white/20 rounded-full appearance-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2.5 [&::-webkit-slider-thumb]:h-2.5 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:rounded-full"
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between px-1 mt-1">
                <label className="text-[10px] text-white font-semibold tracking-wider">
                  {t("Sky")}
                </label>
                <button
                  onClick={() => setSettings((prev) => ({ ...prev, enableSky: !prev.enableSky }))}
                  className={`w-9 h-5 rounded-full relative transition-colors shrink-0 ${settings.enableSky ? "bg-white" : "bg-white/20"}`}
                >
                  <div className={`w-3 h-3 rounded-full absolute top-1 transition-all ${settings.enableSky ? "left-5 bg-black" : "left-1 bg-white"}`} />
                </button>
              </div>

              {settings.enableSky && (
                <div className="flex items-center justify-between px-1 pl-3">
                  <label className="text-[9px] text-white/70 font-semibold tracking-wider uppercase">
                    {t("Sky Color")}
                  </label>
                  <input
                    type="color"
                    value={settings.skyColor || "#88C6FC"}
                    onChange={(e) => setSettings((prev) => ({ ...prev, skyColor: e.target.value }))}
                    className="w-6 h-6 p-0 border-0 bg-transparent cursor-pointer"
                  />
                </div>
              )}
            </div>

            <div className="w-full h-px bg-white/10 my-1"></div>

            <div className="flex flex-col gap-3 px-1">
              <label className="text-[10px] text-white font-semibold tracking-wider uppercase">
                {t("Water Masking / Styling")}
              </label>
              <div className="flex items-center justify-between">
                <label className="text-[9px] text-white/70 font-semibold tracking-wider uppercase">
                  {t("Water Color")}
                </label>
                <input
                  type="color"
                  value={settings.waterColor || "#9ebdc8"}
                  onChange={(e) => setSettings((prev) => ({ ...prev, waterColor: e.target.value }))}
                  className="w-6 h-6 p-0 border-0 bg-transparent cursor-pointer"
                />
              </div>
              <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <label className="text-[9px] text-white/70 font-semibold tracking-wider uppercase">
                    {t("Water Opacity")}
                  </label>
                  <span className="text-[9px] text-white/50 font-mono">
                    {Math.round((settings.waterOpacity ?? 1) * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={settings.waterOpacity ?? 1}
                  onChange={(e) => setSettings((prev) => ({ ...prev, waterOpacity: parseFloat(e.target.value) }))}
                  className="w-full h-1 bg-white/20 rounded-full appearance-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2.5 [&::-webkit-slider-thumb]:h-2.5 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:rounded-full"
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </details>
  );
};
