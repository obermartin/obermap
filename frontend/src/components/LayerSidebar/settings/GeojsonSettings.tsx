import { useState } from "react";
import { useTranslation } from "../../../contexts/I18nContext";
import type { LayerSettingsProps } from "./types";
import { Square, RefreshCcw, BookmarkPlus, Copy, RotateCcw } from "lucide-react";

export const GeojsonSettings = (props: LayerSettingsProps) => {
  const { t } = useTranslation();
  const { layer, updateLayerProperty, updateLayerStyle, saveAsPreset, duplicateLayer, selectedFeatureId, colorPalette } = props;

  const [editTarget, setEditTarget] = useState<"fill" | "outline">("fill");
  const feature = selectedFeatureId !== null 
    ? layer.data?.features?.find((f: any) => f.id === selectedFeatureId) 
    : null;
    
  const currentFillColor = feature?.properties?.fill || layer.defaultStyle?.fill || "#3b82f6";
  const currentFillOpacity = feature?.properties?.["fill-opacity"] ?? layer.defaultStyle?.fillOpacity ?? 0.5;
  const currentOutlineColor = feature?.properties?.stroke || layer.defaultStyle?.color || "#2563eb";
  const currentOutlineOpacity = feature?.properties?.["stroke-opacity"] ?? layer.defaultStyle?.opacity ?? 1;
  const currentOutlineWidth = feature?.properties?.["stroke-width"] ?? layer.defaultStyle?.weight ?? 2;

  const handleColorClick = (color: string) => {
    if (editTarget === "fill") {
      updateLayerStyle(layer.id, selectedFeatureId, { fill: color });
    } else {
      updateLayerStyle(layer.id, selectedFeatureId, { stroke: color });
    }
  };

  const handleOpacityChange = (opacity: number) => {
    if (editTarget === "fill") {
      updateLayerStyle(layer.id, selectedFeatureId, { "fill-opacity": opacity });
    } else {
      updateLayerStyle(layer.id, selectedFeatureId, { "stroke-opacity": opacity });
    }
  };

  const handleWidthChange = (width: number) => {
    updateLayerStyle(layer.id, selectedFeatureId, { "stroke-width": width });
  };
  
  const handleReset = () => {
    updateLayerStyle(layer.id, selectedFeatureId, {
      fill: layer.defaultStyle?.fill,
      stroke: layer.defaultStyle?.color,
      "fill-opacity": layer.defaultStyle?.fillOpacity,
      "stroke-opacity": layer.defaultStyle?.opacity,
      "stroke-width": layer.defaultStyle?.weight,
    });
  };

  const handleSwap = () => {
    updateLayerStyle(layer.id, selectedFeatureId, {
      fill: currentOutlineColor,
      stroke: currentFillColor,
      "fill-opacity": currentOutlineOpacity,
      "stroke-opacity": currentFillOpacity,
    });
  };

  const renderColorSwatch = (color: string) => (
    <button
      key={color}
      onClick={() => handleColorClick(color)}
      className="w-5 h-5 rounded-sm border border-white/20 transition-transform hover:scale-110 flex-shrink-0"
      style={{ backgroundColor: color }}
    />
  );

  return (
    <div className="flex flex-col gap-4 pb-2">
      {/* Swatches */}
      <div className="flex flex-wrap gap-1">
        {colorPalette.map(renderColorSwatch)}
        {renderColorSwatch("transparent")}
      </div>

      <div className="flex items-center justify-between">
        {/* Toggle fill / outline target & Swap */}
        <div className="flex gap-2">
          <button
            onClick={() => setEditTarget("fill")}
            className={`p-1 flex items-center justify-center transition-colors ${editTarget === "fill" ? "text-white" : "text-white/50 hover:text-white"}`}
            title={t("Edit Fill")}
          >
            <Square size={16} fill="currentColor" stroke="none" />
          </button>
          <button
            onClick={() => setEditTarget("outline")}
            className={`p-1 flex items-center justify-center transition-colors ${editTarget === "outline" ? "text-white" : "text-white/50 hover:text-white"}`}
            title={t("Edit Outline")}
          >
            <Square size={16} />
          </button>
          <button
            onClick={handleSwap}
            className="text-white/50 hover:text-white transition-colors p-1 rounded-full"
            title={t("Swap Fill and Outline")}
          >
            <RefreshCcw size={16} />
          </button>
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          {saveAsPreset && (
            <button
              onClick={() => saveAsPreset(layer)}
              className="text-white/50 hover:text-white transition-colors p-1"
              title={t("Save as Preset")}
            >
              <BookmarkPlus size={16} />
            </button>
          )}
          {duplicateLayer && (
            <button
              onClick={() => duplicateLayer(layer.id)}
              className="text-white/50 hover:text-white transition-colors p-1"
              title={t("Duplicate Layer")}
            >
              <Copy size={16} />
            </button>
          )}
          <button
            onClick={handleReset}
            className="text-white/50 hover:text-white transition-colors p-1 rounded-full"
            title={t("Reset Styles")}
          >
            <RotateCcw size={16} />
          </button>
        </div>
      </div>

      {/* Opacity slider */}
      <div className="flex flex-col gap-1">
        <div className="flex justify-between items-end">
          <label className="text-[10px] text-white font-semibold tracking-wider">
            {t("OPACITY")}
          </label>
          <span className="text-[10px] text-white/70 font-mono">
            {Math.round(
              (editTarget === "fill"
                ? currentFillOpacity
                : currentOutlineOpacity) * 100,
            )}
            %
          </span>
        </div>
        <input
          type="range"
          min="0"
          max="100"
          value={
            (editTarget === "fill"
              ? currentFillOpacity
              : currentOutlineOpacity) * 100
          }
          onChange={(e) =>
            handleOpacityChange(Number(e.target.value) / 100)
          }
          className="w-full accent-white h-1 bg-white/20 appearance-none cursor-pointer"
        />
      </div>

      {/* Outline width slider */}
      <div className="flex flex-col gap-1 pb-2">
        <div className="flex justify-between items-end">
          <label className="text-[10px] text-white font-semibold tracking-wider">
            {t("STROKE WIDTH")}
          </label>
          <span className="text-[10px] text-white/70 font-mono">
            {currentOutlineWidth}px
          </span>
        </div>
        <input
          type="range"
          min="0"
          max="20"
          value={currentOutlineWidth}
          onChange={(e) =>
            handleWidthChange(Number(e.target.value))
          }
          className="w-full accent-white h-1 bg-white/20 appearance-none cursor-pointer"
        />
      </div>

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
              updateLayerProperty(
                layer.id,
                "dataSource",
                e.target.value,
              )
            }
            className="w-full bg-black border border-white/20 px-2 py-1 text-xs text-white outline-none focus:border-white/50 mb-3"
          />
        </div>
      )}
    </div>
  );
};
