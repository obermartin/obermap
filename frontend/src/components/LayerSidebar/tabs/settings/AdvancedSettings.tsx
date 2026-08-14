import React from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useTranslation } from "../../../../contexts/I18nContext";
import type { AppSettings } from "../../../../types";

export interface AdvancedSettingsProps {
  settings: AppSettings;
  setSettings: React.Dispatch<React.SetStateAction<AppSettings>>;
}

export const AdvancedSettings: React.FC<AdvancedSettingsProps> = ({ settings, setSettings }) => {
  const { t } = useTranslation();

  return (
    <>
      {/* SCALING */}
      <details className="glass-outlined-container group w-full shrink-0">
        <summary className="relative p-3 flex items-center gap-2 bg-black text-xs text-white font-semibold tracking-wider cursor-pointer list-none outline-none [&::-webkit-details-marker]:hidden">
          <ChevronRight size={14} className="text-white/50 group-hover:text-white transition-colors group-open:hidden shrink-0" />
          <ChevronDown size={14} className="text-white/50 group-hover:text-white transition-colors hidden group-open:block shrink-0" />
          <span>{t("SCALING")}</span>
        </summary>
        <div className="p-3 flex flex-col gap-4 bg-black mt-[2px]">
          <div className="flex flex-col gap-2 px-1">
            <div className="flex items-center justify-between">
              <label className="text-[10px] text-white font-semibold tracking-wider">
                {t("Basemap Labels Scale")}
              </label>
              <span className="text-[10px] text-white/50 font-mono">
                {settings.exportBasemapScale ?? 1.0}x
              </span>
            </div>
            <input
              type="range"
              min="1"
              max="5"
              step="0.1"
              value={settings.exportBasemapScale ?? 1.0}
              onChange={(e) => setSettings(prev => ({ ...prev, exportBasemapScale: parseFloat(e.target.value) }))}
              className="w-full h-1 bg-white/20 rounded-full appearance-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:rounded-full"
            />
          </div>

          <div className="flex flex-col gap-2 px-1">
            <div className="flex items-center justify-between">
              <label className="text-[10px] text-white font-semibold tracking-wider">
                {t("Annotations Scale")}
              </label>
              <span className="text-[10px] text-white/50 font-mono">
                {settings.exportAnnotationScale ?? 1.0}x
              </span>
            </div>
            <input
              type="range"
              min="1"
              max="5"
              step="0.1"
              value={settings.exportAnnotationScale ?? 1.0}
              onChange={(e) => setSettings(prev => ({ ...prev, exportAnnotationScale: parseFloat(e.target.value) }))}
              className="w-full h-1 bg-white/20 rounded-full appearance-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:rounded-full"
            />
          </div>
        </div>
      </details>

      {/* UI SETTINGS */}
      <details className="glass-outlined-container group w-full shrink-0">
        <summary className="relative p-3 flex items-center gap-2 bg-black text-xs text-white font-semibold tracking-wider cursor-pointer list-none outline-none [&::-webkit-details-marker]:hidden">
          <ChevronRight size={14} className="text-white/50 group-hover:text-white transition-colors group-open:hidden shrink-0" />
          <ChevronDown size={14} className="text-white/50 group-hover:text-white transition-colors hidden group-open:block shrink-0" />
          <span>{t("UI SETTINGS")}</span>
        </summary>
        <div className="p-3 flex flex-col gap-4 bg-black mt-[2px]">
          
          <div className="flex items-center justify-between">
            <label className="text-[10px] text-white font-semibold tracking-wider">
              {t("UI THEME")}
            </label>
            <div className="flex bg-white/10 rounded-full p-0.5">
              <button
                className={`text-[10px] px-2 py-0.5 rounded-full transition-colors ${(!settings.uiTheme || settings.uiTheme === 'dark') && !settings.uiLiquidGlass ? 'bg-white text-black font-bold' : 'text-white/50 hover:text-white'}`}
                onClick={() => setSettings(prev => ({ ...prev, uiTheme: 'dark', uiLiquidGlass: false }))}
              >
                {t("DARK")}
              </button>
              <button
                className={`text-[10px] px-2 py-0.5 rounded-full transition-colors ${settings.uiTheme === 'light' && !settings.uiLiquidGlass ? 'bg-white text-black font-bold' : 'text-white/50 hover:text-white'}`}
                onClick={() => setSettings(prev => ({ ...prev, uiTheme: 'light', uiLiquidGlass: false }))}
              >
                {t("LIGHT")}
              </button>
              <button
                className={`text-[10px] px-2 py-0.5 rounded-full transition-colors ${settings.uiLiquidGlass ? 'bg-white text-black font-bold' : 'text-white/50 hover:text-white'}`}
                onClick={() => setSettings(prev => ({ ...prev, uiLiquidGlass: true }))}
              >
                {t("GLASS")}
              </button>
            </div>
          </div>

          <div>
            <label className="text-[10px] text-white mb-2 block font-semibold tracking-wider">
              {t("BOTTOM PADDING")} ({settings.uiBottomPadding ?? 0}px)
            </label>
            <div className="flex items-center gap-3">
              <span className="text-xs text-white/50 w-6 text-right">0</span>
              <div className="relative flex-1 flex flex-col justify-center h-8">
                <input
                  type="range"
                  min="0"
                  max="500"
                  step="1"
                  value={settings.uiBottomPadding ?? 0}
                  onChange={(e) => setSettings(prev => ({ ...prev, uiBottomPadding: parseInt(e.target.value) }))}
                  className="w-full h-1 bg-white/20 rounded-full appearance-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:rounded-full"
                />
              </div>
              <span className="text-xs text-white/50 w-8">500</span>
            </div>
          </div>
          <div>
            <label className="text-[10px] text-white mb-2 block font-semibold tracking-wider">
              {t("PATH & POLYGON REVEAL")} ({(settings.animationDuration ?? 2000) / 1000}s)
            </label>
            <div className="flex items-center gap-3">
              <span className="text-xs text-white/50 w-6 text-right">0s</span>
              <div className="relative flex-1 flex flex-col justify-center h-8">
                <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 flex justify-between px-2 pointer-events-none">
                  {[...Array(6)].map((_, i) => (
                    <div key={i} className="w-[1px] h-2.5 bg-white/30" />
                  ))}
                </div>
                <input
                  type="range"
                  min="0"
                  max="5000"
                  step="500"
                  value={settings.animationDuration ?? 2000}
                  onChange={(e) => setSettings((prev) => ({ ...prev, animationDuration: Number(e.target.value) }))}
                  className="w-full accent-white h-1 bg-white/20 appearance-none cursor-pointer relative z-10"
                />
              </div>
              <span className="text-xs text-white/50 w-6">5s</span>
            </div>
          </div>

          <div>
            <label className="text-[10px] text-white mb-2 block font-semibold tracking-wider">
              {t("LABEL & ICON REVEAL")} ({(settings.labelAnimationDuration ?? 1000) / 1000}s)
            </label>
            <div className="flex items-center gap-3">
              <span className="text-xs text-white/50 w-6 text-right">0s</span>
              <div className="relative flex-1 flex flex-col justify-center h-8">
                <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 flex justify-between px-2 pointer-events-none">
                  {[...Array(6)].map((_, i) => (
                    <div key={i} className="w-[1px] h-2.5 bg-white/30" />
                  ))}
                </div>
                <input
                  type="range"
                  min="0"
                  max="5000"
                  step="500"
                  value={settings.labelAnimationDuration ?? 1000}
                  onChange={(e) => setSettings((prev) => ({ ...prev, labelAnimationDuration: Number(e.target.value) }))}
                  className="w-full accent-white h-1 bg-white/20 appearance-none cursor-pointer relative z-10"
                />
              </div>
              <span className="text-xs text-white/50 w-6">5s</span>
            </div>
          </div>
        </div>
      </details>

      {/* API SETTINGS */}
      <details className="glass-outlined-container group w-full shrink-0">
        <summary className="relative p-3 flex items-center gap-2 bg-black text-xs text-white font-semibold tracking-wider cursor-pointer list-none outline-none [&::-webkit-details-marker]:hidden">
          <ChevronRight size={14} className="text-white/50 group-hover:text-white transition-colors group-open:hidden shrink-0" />
          <ChevronDown size={14} className="text-white/50 group-hover:text-white transition-colors hidden group-open:block shrink-0" />
          <span>{t("API SETTINGS")}</span>
        </summary>
        <div className="p-3 flex flex-col gap-4 bg-black mt-[2px]">
          <div>
            <label className="text-[10px] text-white mb-1 block font-semibold tracking-wider">
              {t("OPENSKY CREDENTIALS")}
            </label>
            <p className="text-[10px] text-white/40 mb-2 leading-tight">
              {t("Optional. Leave blank for anonymous access (rate-limited).")}
            </p>
            <div className="flex gap-2">
              <input
                placeholder={t("Client ID")}
                className="w-1/2 bg-black/60 px-3 py-2 outline-none font-mono text-xs border border-white/10 focus:border-white/50 transition-colors"
                value={settings.openSkyCredentials?.clientId || ""}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    openSkyCredentials: {
                      ...prev.openSkyCredentials,
                      clientId: e.target.value,
                      clientSecret: prev.openSkyCredentials?.clientSecret || "",
                    },
                  }))
                }
              />
              <input
                type="password"
                placeholder={t("Client Secret")}
                className="w-1/2 bg-black/60 px-3 py-2 outline-none font-mono text-xs border border-white/10 focus:border-white/50 transition-colors"
                value={settings.openSkyCredentials?.clientSecret || ""}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    openSkyCredentials: {
                      ...prev.openSkyCredentials,
                      clientId: prev.openSkyCredentials?.clientId || "",
                      clientSecret: e.target.value,
                    },
                  }))
                }
              />
            </div>
          </div>
          <div className="mt-2">
            <label className="text-[10px] text-white mb-1 block font-semibold tracking-wider">
              {t("AISSTREAM CREDENTIALS")}
            </label>
            <p className="text-[10px] text-white/40 mb-2 leading-tight">
              {t("Required for Maritime Traffic. Get a free API key at aisstream.io")}
            </p>
            <input
              type="password"
              placeholder={t("API Key")}
              className="w-full bg-black/60 px-3 py-2 outline-none font-mono text-xs border border-white/10 focus:border-white/50 transition-colors"
              value={settings.aisstreamCredentials?.apiKey || ""}
              onChange={(e) =>
                setSettings((prev) => ({
                  ...prev,
                  aisstreamCredentials: { apiKey: e.target.value },
                }))
              }
            />
          </div>
          <div className="mt-2">
            <label className="text-[10px] text-white mb-1 block font-semibold tracking-wider">
              {t("GOOGLE MAPS API KEY")}
            </label>
            <p className="text-[10px] text-white/40 mb-2 leading-tight">
              {t("Optional. Enables train mode routing via Google Maps Directions API.")}
            </p>
            <input
              type="password"
              placeholder={t("API Key")}
              className="w-full bg-black/60 px-3 py-2 outline-none font-mono text-xs border border-white/10 focus:border-white/50 transition-colors"
              value={settings.googleMapsToken || ""}
              onChange={(e) =>
                setSettings((prev) => ({
                  ...prev,
                  googleMapsToken: e.target.value,
                }))
              }
            />
          </div>
        </div>
      </details>
    </>
  );
};
