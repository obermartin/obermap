import { useTranslation } from "../../../contexts/I18nContext";
import type { LayerSettingsProps } from "./types";

export const VesselsSettings = (props: LayerSettingsProps) => {
  const { t } = useTranslation();
  const { layer, updateLayerProperty, selectedVesselMmsi, colorPalette } = props;

  return (
    <>
      <div className="flex flex-col gap-4 pb-2">
                  <div className="flex flex-col gap-2">
                    <label className="text-[10px] text-white font-semibold tracking-wider uppercase">
                      {selectedVesselMmsi
                        ? `${t("color")} (VESSEL MMSI: ${selectedVesselMmsi})`
                        : t("global vessel color")}
                    </label>
                    <div className="flex flex-wrap gap-1">
                      {colorPalette.map((color) => (
                        <button
                          key={color}
                          onClick={() => {
                            if (selectedVesselMmsi) {
                              const existingColors = layer.vesselColors || {};
                              updateLayerProperty(layer.id, "vesselColors", {
                                ...existingColors,
                                [String(selectedVesselMmsi)]: color,
                              });
                            } else {
                              updateLayerProperty(
                                layer.id,
                                "globalVesselColor",
                                color,
                              );
                            }
                          }}
                          className="w-6 h-6 flex-shrink-0 transition-colors relative"
                          style={{ backgroundColor: color }}
                          title={color}
                        >
                          {((selectedVesselMmsi &&
                            layer.vesselColors?.[String(selectedVesselMmsi)] ===
                              color) ||
                            (!selectedVesselMmsi &&
                              layer.globalVesselColor === color)) && (
                            <div className="absolute inset-0 flex items-center justify-center mix-blend-difference text-white text-xs">
                              ✓
                            </div>
                          )}
                        </button>
                      ))}
                      <button
                        key="transparent"
                        onClick={() => {
                          if (selectedVesselMmsi) {
                            const existingColors = { ...layer.vesselColors };
                            delete existingColors[String(selectedVesselMmsi)];
                            updateLayerProperty(
                              layer.id,
                              "vesselColors",
                              existingColors,
                            );
                          } else {
                            updateLayerProperty(
                              layer.id,
                              "globalVesselColor",
                              undefined,
                            );
                          }
                        }}
                        className="w-6 h-6 relative overflow-hidden flex-shrink-0 transition-colors"
                        title={t("Reset to Default White")}
                      >
                        <div className="absolute inset-0 bg-white/10 flex items-center justify-center">
                          <div className="w-full h-0 border-t border-red-500 transform rotate-45"></div>
                        </div>
                      </button>
                    </div>
                  </div>
                </div>
    </>
  );
};
