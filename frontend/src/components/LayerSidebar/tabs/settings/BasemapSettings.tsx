import React, { useRef, useState, useEffect } from "react";
import { ChevronDown, ChevronRight, Upload, Link, Trash2, RefreshCcw, Loader2, Image as ImageIcon } from "lucide-react";
import { useTranslation } from "../../../../contexts/I18nContext";
import { customPrompt, customConfirm, customAlert } from "../../../../utils/dialogService";
import { ScreenshotMap } from "../../ScreenshotMap";
import type { AppSettings, BaseMapStyle } from "../../../../types";

export interface BasemapSettingsProps {
  settings: AppSettings;
  setSettings: React.Dispatch<React.SetStateAction<AppSettings>>;
}

export const BasemapSettings: React.FC<BasemapSettingsProps> = ({ settings, setSettings }) => {
  const { t } = useTranslation();

  const [basemaps, setBasemaps] = useState<BaseMapStyle[]>([]);
  const basemapFileInputRef = useRef<HTMLInputElement>(null);
  const [isGeneratingScreenshotId, setIsGeneratingScreenshotId] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api.php?action=list_basemaps')
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) setBasemaps(data);
      })
      .catch((e) => console.error(e));
  }, []);

  const refreshBasemaps = async () => {
    try {
      const res = await fetch('/api.php?action=list_basemaps');
      const data = await res.json();
      if (Array.isArray(data)) setBasemaps(data);
    } catch (e) { console.error(e); }
  };

  const handleAddBasemapUrl = async () => {
    const url = await customPrompt(t("Enter Map Style URL:"));
    if (!url) return;
    const name = await customPrompt(t("Enter a name for this style:")) || "Custom Style";
    const id = `basemap_${Date.now()}`;
    await fetch('/api.php?action=save_basemap', {
      method: 'POST',
      body: JSON.stringify({ id, name, url })
    });
    refreshBasemaps();
  };

  const handleUploadBasemapJson = () => {
    if (basemapFileInputRef.current) {
      basemapFileInputRef.current.accept = ".json";
      basemapFileInputRef.current.onchange = async (e: any) => {
        const file = e.target.files?.[0];
        if (!file) return;
        let text = await file.text();
        try {
          if (text.includes("get_your_own_OpIi9ZULNHzrESv6T2vL")) {
            const apiKey = await customPrompt(t("This map style requires a MapTiler API key. Please enter your API key:"));
            if (apiKey) {
              text = text.replace(/get_your_own_OpIi9ZULNHzrESv6T2vL/g, apiKey);
            } else {
              customAlert(t("Without a valid API key, this map style will not load correctly."));
            }
          }

          JSON.parse(text);
          const name = await customPrompt(t("Enter a name for this style:")) || file.name;
          const id = `basemap_${Date.now()}`;
          const url = `/api.php?action=basemap_style&id=${id}`;
          await fetch('/api.php?action=save_basemap', {
            method: 'POST',
            body: JSON.stringify({ id, name, url, styleData: text })
          });
          refreshBasemaps();
        } catch (err) {
          customAlert(t("Invalid JSON file"));
        }
        e.target.value = '';
      };
      basemapFileInputRef.current.click();
    }
  };

  const handleUploadBasemapPreview = (id: string) => {
    if (basemapFileInputRef.current) {
      basemapFileInputRef.current.accept = "image/png, image/jpeg";
      basemapFileInputRef.current.onchange = async (e: any) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async () => {
          const previewData = reader.result as string;
          const bm = basemaps.find(b => b.id === id);
          if (bm) {
            await fetch('/api.php?action=save_basemap', {
              method: 'POST',
              body: JSON.stringify({ ...bm, previewData })
            });
            refreshBasemaps();
          }
        };
        reader.readAsDataURL(file);
        e.target.value = '';
      };
      basemapFileInputRef.current.click();
    }
  };

  const handleDeleteBasemap = async (id: string) => {
    if (await customConfirm(t("Are you sure you want to delete this custom base map?"))) {
      await fetch(`/api.php?action=delete_basemap&id=${id}`, { method: 'POST' });
      refreshBasemaps();
    }
  };

  return (
    <details className="glass-outlined-container group w-full shrink-0">
      <summary className="relative p-3 flex items-center gap-2 bg-black text-xs text-white font-semibold tracking-wider cursor-pointer list-none outline-none [&::-webkit-details-marker]:hidden">
        <ChevronRight size={14} className="text-white/50 group-hover:text-white transition-colors group-open:hidden shrink-0" />
        <ChevronDown size={14} className="text-white/50 group-hover:text-white transition-colors hidden group-open:block shrink-0" />
        <span>{t("BASE MAP")}</span>
      </summary>
      <div className="p-3 flex flex-col gap-4 bg-black mt-[2px]">
        <div className="grid grid-cols-3 gap-2">
          {/* Default Map: Liberty */}
          <div 
            className={`relative aspect-square bg-white/10 rounded cursor-pointer overflow-hidden border-2 transition-all ${settings.mapStyle === 'https://tiles.openfreemap.org/styles/liberty' ? 'outline outline-2 outline-offset-2 outline-white border-transparent' : 'border-transparent hover:border-white/20'}`}
            onClick={() => setSettings(p => ({ ...p, mapStyle: 'https://tiles.openfreemap.org/styles/liberty' }))}
          >
            <img src="https://a.tile.openstreetmap.org/5/16/10.png" className="w-full h-full object-cover opacity-80 mix-blend-luminosity" alt="Default Map" />
            <div className="absolute inset-0 flex items-center justify-center p-2 text-center text-[10px] font-bold text-white bg-black/40">{t("Default")}</div>
          </div>
          
          {/* Solid Color */}
          <div 
            className={`relative aspect-square rounded cursor-pointer overflow-hidden border-2 transition-all ${settings.mapStyle?.startsWith('solid:') ? 'outline outline-2 outline-offset-2 outline-white border-white/10' : 'border-white/10 hover:border-white/20'}`}
          >
            <input type="color" className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" value={settings.mapStyle?.startsWith('solid:') ? settings.mapStyle.replace('solid:', '') : '#1A1A1A'} onChange={e => setSettings(p => ({ ...p, mapStyle: `solid:${e.target.value.toUpperCase()}` }))} />
            <div className="absolute inset-0" style={{ backgroundColor: settings.mapStyle?.startsWith('solid:') ? settings.mapStyle.replace('solid:', '') : '#1A1A1A' }}></div>
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-[10px] font-bold text-white bg-black/20 mix-blend-difference text-center leading-tight px-1">{t("Solid Color")}</div>
          </div>

          {/* Custom Base Maps */}
          {basemaps.map(bm => (
            <div 
              key={bm.id} 
              className={`relative aspect-square bg-white/5 rounded cursor-pointer overflow-hidden border-2 group transition-all ${settings.mapStyle === bm.url ? 'outline outline-2 outline-offset-2 outline-white border-transparent' : 'border-transparent hover:border-white/20'}`}
            >
              <div className="absolute inset-0" onClick={() => setSettings(p => ({ ...p, mapStyle: bm.url }))}>
                {bm.previewData ? (
                  <img src={bm.previewData} className="w-full h-full object-cover" alt={bm.name} />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-white/20 bg-black/40">
                    {isGeneratingScreenshotId === bm.id ? <Loader2 className="animate-spin" size={24} /> : <ImageIcon size={24} />}
                  </div>
                )}
                <div className="absolute inset-x-0 bottom-0 p-1 bg-black/60 text-[8px] text-white truncate text-center">{bm.name}</div>
              </div>
              
              {/* Hover Actions */}
              <div className="absolute top-1 right-1 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button className="p-1.5 bg-black/80 hover:bg-red-500 text-white rounded-full transition-colors" onClick={(e) => { e.stopPropagation(); handleDeleteBasemap(bm.id); }} title="Delete">
                  <Trash2 size={10} />
                </button>
                {!bm.previewData && isGeneratingScreenshotId !== bm.id && (
                  <>
                    <button className="p-1.5 bg-black/80 hover:bg-white hover:text-black text-white rounded-full transition-colors" onClick={(e) => { e.stopPropagation(); handleUploadBasemapPreview(bm.id); }} title="Upload PNG Preview">
                      <Upload size={10} />
                    </button>
                    <button className="p-1.5 bg-black/80 hover:bg-white hover:text-black text-white rounded-full transition-colors" onClick={(e) => { e.stopPropagation(); setIsGeneratingScreenshotId(bm.id); }} title="Generate Preview from Map">
                      <RefreshCcw size={10} />
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
        
        <div className="flex gap-2">
          <button onClick={handleAddBasemapUrl} className="flex-1 py-2 bg-white/5 hover:bg-white/10 text-white text-sm transition-colors rounded-full flex items-center justify-center gap-2">
            <Link size={16} /> {t("Add URL")}
          </button>
          <button onClick={handleUploadBasemapJson} className="flex-1 py-2 bg-white/5 hover:bg-white/10 text-white text-sm transition-colors rounded-full flex items-center justify-center gap-2">
            <Upload size={16} /> {t("Upload JSON")}
          </button>
          <input type="file" ref={basemapFileInputRef} className="hidden" />
        </div>

        <div className="flex items-center justify-between px-1 mt-2">
          <label className="text-[10px] text-white font-semibold tracking-wider">
            {t("Force Gotham Font")}
          </label>
          <button
            onClick={() =>
              setSettings((prev) => ({
                ...prev,
                replaceGothamFont: prev.replaceGothamFont === false ? true : false,
              }))
            }
            className={`w-9 h-5 rounded-full relative transition-colors shrink-0 ${settings.replaceGothamFont !== false ? "bg-white" : "bg-white/20"}`}
          >
            <div className={`w-3 h-3 rounded-full absolute top-1 transition-all ${settings.replaceGothamFont !== false ? "left-5 bg-black" : "left-1 bg-white"}`} />
          </button>
        </div>

        <div className="flex items-center justify-between px-1 mt-1">
          <label className="text-[10px] text-white font-semibold tracking-wider">
            {t("Globe Projection")}
          </label>
          <button
            onClick={() =>
              setSettings((prev) => ({
                ...prev,
                projection: prev.projection === "globe" ? "mercator" : "globe",
              }))
            }
            className={`w-9 h-5 rounded-full relative transition-colors shrink-0 ${settings.projection === "globe" ? "bg-white" : "bg-white/20"}`}
          >
            <div className={`w-3 h-3 rounded-full absolute top-1 transition-all ${settings.projection === "globe" ? "left-5 bg-black" : "left-1 bg-white"}`} />
          </button>
        </div>

        {isGeneratingScreenshotId && basemaps.find(b => b.id === isGeneratingScreenshotId) && (
          <ScreenshotMap 
            styleUrl={basemaps.find(b => b.id === isGeneratingScreenshotId)!.url}
            onReady={async (data) => {
              const bm = basemaps.find(b => b.id === isGeneratingScreenshotId);
              if (bm) {
                await fetch('/api.php?action=save_basemap', {
                  method: 'POST',
                  body: JSON.stringify({ ...bm, previewData: data })
                });
                refreshBasemaps();
              }
              setIsGeneratingScreenshotId(null);
            }}
          />
        )}
      </div>
    </details>
  );
};
