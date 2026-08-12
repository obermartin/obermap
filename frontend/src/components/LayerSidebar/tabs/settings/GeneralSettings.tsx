import React from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useTranslation } from "../../../../contexts/I18nContext";
import type { AppSettings } from "../../../../types";

export interface GeneralSettingsProps {
  settings: AppSettings;
  setSettings: React.Dispatch<React.SetStateAction<AppSettings>>;
  currentShow?: string;
}

export const GeneralSettings: React.FC<GeneralSettingsProps> = ({ settings, setSettings, currentShow }) => {
  const { t } = useTranslation();

  return (
    <details className="glass-outlined-container group w-full shrink-0" open>
      <summary className="relative p-3 flex items-center gap-2 bg-black text-xs text-white font-semibold tracking-wider cursor-pointer list-none outline-none [&::-webkit-details-marker]:hidden">
        <ChevronRight size={14} className="text-white/50 group-hover:text-white transition-colors group-open:hidden shrink-0" />
        <ChevronDown size={14} className="text-white/50 group-hover:text-white transition-colors hidden group-open:block shrink-0" />
        <span>{t("GENERAL SETTINGS")}</span>
      </summary>
      <div className="p-3 flex flex-col gap-4 bg-black mt-[2px]">
        <div>
          <label className="text-[10px] text-white/50 mb-1 block font-semibold tracking-wider">
            {t("MAP NAME")}
          </label>
          <input 
            type="text" 
            value={settings.title || currentShow || ''} 
            onChange={(e) => setSettings(p => ({ ...p, title: e.target.value }))} 
            className="w-full bg-white/5 border border-white/20 rounded px-3 py-1.5 text-sm text-white focus:border-white transition-colors" 
            placeholder={t("Map Name")} 
          />
        </div>
        <div className="flex items-center justify-between px-1">
          <label className="text-[10px] text-white font-semibold tracking-wider">
            {t("This map is a template")}
          </label>
          <button
            onClick={() => setSettings(p => ({ ...p, isTemplate: !p.isTemplate }))}
            className={`w-9 h-5 rounded-full relative transition-colors shrink-0 ${settings.isTemplate ? "bg-white" : "bg-white/20"}`}
          >
            <div className={`w-3 h-3 rounded-full absolute top-1 transition-all ${settings.isTemplate ? "left-5 bg-black" : "left-1 bg-white"}`} />
          </button>
        </div>
      </div>
    </details>
  );
};
