import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Layers, X } from "lucide-react";
import { useTranslation } from "../../../contexts/I18nContext";
import type { AppSettings } from "../../../types";
import { DEFAULT_LAYERS } from "../constants";

export interface PresetLayersPanelProps {
  settings: AppSettings;
  setSettings: React.Dispatch<React.SetStateAction<AppSettings>>;
  showPresetLayers: boolean;
  setShowPresetLayers: React.Dispatch<React.SetStateAction<boolean>>;
}

export const PresetLayersPanel: React.FC<PresetLayersPanelProps> = ({
  settings,
  setSettings,
  showPresetLayers,
  setShowPresetLayers,
}) => {
  const { t } = useTranslation();

  const toggleDefaultLayer = (defaultLayer: any) => {
    const exists = settings.layers.some((l: any) => l.id === defaultLayer.id);
    if (exists) {
      setSettings((prev: any) => ({
        ...prev,
        layers: prev.layers.filter((l: any) => l.id !== defaultLayer.id),
        _isDirty: true,
      }));
    } else {
      setSettings((prev: any) => ({
        ...prev,
        layers: [...prev.layers, { ...defaultLayer, visible: true }],
        _isDirty: true,
      }));
    }
  };

  return (
    <AnimatePresence>
      {showPresetLayers && (
        <motion.div
          initial={{ y: "100%" }}
          animate={{ y: 0 }}
          exit={{ y: "100%" }}
          transition={{ type: "spring", damping: 25, stiffness: 200 }}
          className="absolute inset-0 z-50 flex flex-col p-4 custom-scrollbar overflow-y-auto"
          style={{ backgroundColor: "#18181b" }}
        >
          <div className="flex items-center justify-between mb-4 pb-2 border-b border-white/10">
            <label className="text-xs text-white font-semibold tracking-wider flex items-center gap-2">
              <Layers size={14} /> {t("PRESET LAYERS")}
            </label>
            <button
              onClick={() => setShowPresetLayers(false)}
              className="text-white/50 hover:text-white transition-colors bg-white/5 hover:bg-white/10 rounded-full p-1.5"
            >
              <X size={16} />
            </button>
          </div>
          <div className="flex flex-col gap-2">
            {[...DEFAULT_LAYERS, ...(settings.presetLayers || [])].map(
              (layer) => {
                const isEnabled = settings.layers.some(
                  (l) => l.id === layer.id,
                );
                return (
                  <div
                    key={layer.id}
                    className="flex items-center justify-between px-2 py-2"
                  >
                    <span className="text-sm font-medium text-white">
                      {t(layer.name)}
                    </span>
                    <button
                      onClick={() => toggleDefaultLayer(layer)}
                      className={`w-9 h-5 rounded-full relative transition-colors ${isEnabled ? "bg-white" : "bg-white/20"}`}
                    >
                      <div
                        className={`w-3 h-3 rounded-full absolute top-1 transition-all ${isEnabled ? "left-5 bg-black" : "left-1 bg-white"}`}
                      />
                    </button>
                  </div>
                );
              },
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
