import React, { useState, useRef } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useTranslation } from "../../../../contexts/I18nContext";
import { customAlert } from "../../../../utils/dialogService";
import type { AppSettings } from "../../../../types";

export interface ColorPaletteSettingsProps {
  settings: AppSettings;
  setSettings: React.Dispatch<React.SetStateAction<AppSettings>>;
}

export const ColorPaletteSettings: React.FC<ColorPaletteSettingsProps> = ({ settings, setSettings }) => {
  const { t } = useTranslation();
  
  const [addingColor, setAddingColor] = useState(false);
  const [newColorHex, setNewColorHex] = useState("#000000");

  const dragItem = useRef<number | null>(null);
  const dragOverItem = useRef<number | null>(null);

  const handleDragStart = (e: React.DragEvent, index: number) => {
    dragItem.current = index;
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragEnter = (index: number) => {
    dragOverItem.current = index;
  };

  const handleColorDragEnd = () => {
    const fromIndex = dragItem.current;
    const toIndex = dragOverItem.current;

    if (fromIndex !== null && toIndex !== null && fromIndex !== toIndex) {
      setSettings((prev) => {
        const newColors = [...prev.colorPalette];
        const draggedColor = newColors[fromIndex];
        newColors.splice(fromIndex, 1);
        newColors.splice(toIndex, 0, draggedColor);
        return { ...prev, colorPalette: newColors };
      });
    }
    dragItem.current = null;
    dragOverItem.current = null;
  };

  const confirmAddColor = async () => {
    if (/^#[0-9A-F]{6}$/i.test(newColorHex)) {
      setSettings((prev) => ({
        ...prev,
        colorPalette: [...prev.colorPalette, newColorHex.toUpperCase()],
      }));
      setAddingColor(false);
    } else {
      await customAlert(t("Invalid hex color format. Use #RRGGBB"));
    }
  };

  const removeColor = (color: string) => {
    setSettings((prev) => ({
      ...prev,
      colorPalette: prev.colorPalette.filter((c) => c !== color),
    }));
  };

  return (
    <details className="glass-outlined-container group w-full shrink-0" open>
      <summary className="relative p-3 flex items-center gap-2 bg-black text-xs text-white font-semibold tracking-wider cursor-pointer list-none outline-none [&::-webkit-details-marker]:hidden">
        <ChevronRight size={14} className="text-white/50 group-hover:text-white transition-colors group-open:hidden shrink-0" />
        <ChevronDown size={14} className="text-white/50 group-hover:text-white transition-colors hidden group-open:block shrink-0" />
        <span>{t("COLOR PALETTE")}</span>
      </summary>
      <div className="p-3 flex flex-col gap-4 bg-black mt-[2px]">
        <div className="flex flex-wrap gap-2 items-center">
          {settings.colorPalette.map((c, index) => (
            <div
              key={c}
              className="w-8 h-8 border border-white/20 relative group cursor-grab active:cursor-grabbing"
              draggable
              onDragStart={(e) => handleDragStart(e, index)}
              onDragEnter={() => handleDragEnter(index)}
              onDragEnd={handleColorDragEnd}
              onDragOver={(e) => e.preventDefault()}
            >
              <div className="w-full h-full" style={{ backgroundColor: c }} />
              <button
                onClick={() => removeColor(c)}
                className="absolute inset-0 bg-black/60 text-white hidden group-hover:flex items-center justify-center text-xs font-bold transition-opacity"
                title={t("Remove color")}
              >
                ×
              </button>
            </div>
          ))}
          {!addingColor ? (
            <button
              onClick={() => setAddingColor(true)}
              className="w-8 h-8 border border-white/20 flex items-center justify-center hover:bg-white hover:text-black transition-colors shrink-0"
              title={t("Add color")}
            >
              +
            </button>
          ) : (
            <div className="flex gap-1 items-center shrink-0 bg-white/5 border border-white/20 p-1">
              <input
                type="color"
                className="w-8 h-8 p-0 border-0 cursor-pointer bg-transparent"
                value={newColorHex}
                onChange={(e) => setNewColorHex(e.target.value.toUpperCase())}
                title={t("Choose a color")}
              />
              <input
                autoFocus
                className="w-24 bg-transparent px-1 outline-none font-mono text-xs border border-transparent focus:border-white/50 transition-colors h-8 uppercase"
                value={newColorHex}
                onChange={(e) => setNewColorHex(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") confirmAddColor();
                  if (e.key === "Escape") setAddingColor(false);
                }}
              />
              <button
                onClick={confirmAddColor}
                className="text-white hover:bg-white hover:text-black px-3 font-semibold border border-white/20 text-xs h-8 rounded-full"
              >
                {t("OK")}
              </button>
            </div>
          )}
        </div>
      </div>
    </details>
  );
};
