import { useState, useEffect } from "react";
import { useTranslation } from "../../../contexts/I18nContext";
import type { LayerSettingsProps } from "./types";
import { Loader2, Download } from "lucide-react";

export const FlightsSettings = (props: LayerSettingsProps) => {
  const { t } = useTranslation();
  const { layer, updateLayerProperty, selectedAircraftId, exportReadyData, colorPalette } = props;

  const [aircraftSearchError, setAircraftSearchError] = useState<boolean>(false);

  useEffect(() => {
    const handleSearchAircraftResult = (e: Event) => {
      const customEvent = e as CustomEvent<{ found: boolean }>;
      setAircraftSearchError(!customEvent.detail.found);
    };
    window.addEventListener("searchAircraftResult", handleSearchAircraftResult);
    return () => window.removeEventListener("searchAircraftResult", handleSearchAircraftResult);
  }, []);

  return (
    <>
      <div className="flex flex-col gap-4 pb-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-white font-semibold tracking-wider uppercase">
                      {t("3d mode")}
                    </span>
                    <button
                      onClick={() =>
                        updateLayerProperty(
                          layer.id,
                          "is3DMode",
                          !layer.is3DMode,
                        )
                      }
                      className={`relative inline-flex h-4 w-7 items-center rounded-full transition-colors ${
                        layer.is3DMode ? "bg-white" : "bg-white/20"
                      }`}
                    >
                      <span
                        className={`inline-block h-3 w-3 transform rounded-full bg-black transition-transform ${
                          layer.is3DMode ? "translate-x-3.5" : "translate-x-0.5"
                        }`}
                      />
                    </button>
                  </div>


                  <div className="flex flex-col gap-2">
                    <label className="text-[10px] text-white font-semibold tracking-wider">
                      {t("SEARCH CALLSIGN / REGISTRATION")}
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="Enter callsign..."
                        className="w-full bg-black/50 border border-white/10 px-3 py-1.5 text-sm outline-none focus:border-white/30"
                        onChange={() => setAircraftSearchError(false)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            const val = e.currentTarget.value
                              .trim()
                              .toUpperCase();
                            if (val) {
                              setAircraftSearchError(false);
                              const event = new CustomEvent("searchAircraft", {
                                detail: val,
                              });
                              window.dispatchEvent(event);
                            }
                          }
                        }}
                      />
                    </div>
                    {aircraftSearchError && (
                      <div className="text-red-500 text-[10px] mt-1">
                        {t("Callsign not found in visible airspace, try zooming out")}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col gap-2">
                    <label className="text-[10px] text-white font-semibold tracking-wider uppercase">
                      {selectedAircraftId
                        ? `${t("color")} (AIRCRAFT ${selectedAircraftId})`
                        : t("global aircraft color")}
                    </label>
                    <div className="flex flex-wrap gap-1">
                      {colorPalette.map((color) => (
                        <button
                          key={color}
                          onClick={() => {
                            if (selectedAircraftId) {
                              const existingColors = layer.aircraftColors || {};
                              updateLayerProperty(layer.id, "aircraftColors", {
                                ...existingColors,
                                [String(selectedAircraftId)]: color,
                              });
                            } else {
                              updateLayerProperty(
                                layer.id,
                                "globalAircraftColor",
                                color,
                              );
                            }
                          }}
                          className="w-6 h-6 flex-shrink-0 transition-colors relative"
                          style={{ backgroundColor: color }}
                          title={color}
                        >
                          {((selectedAircraftId &&
                            layer.aircraftColors?.[
                              String(selectedAircraftId)
                            ] === color) ||
                            (!selectedAircraftId &&
                              layer.globalAircraftColor === color)) && (
                            <div className="absolute inset-0 flex items-center justify-center mix-blend-difference text-white text-xs">
                              ✓
                            </div>
                          )}
                        </button>
                      ))}
                      <button
                        key="transparent"
                        onClick={() => {
                          if (selectedAircraftId) {
                            const existingColors = { ...layer.aircraftColors };
                            delete existingColors[String(selectedAircraftId)];
                            updateLayerProperty(
                              layer.id,
                              "aircraftColors",
                              existingColors,
                            );
                          } else {
                            updateLayerProperty(
                              layer.id,
                              "globalAircraftColor",
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

                  <div className="flex flex-col gap-1 mt-2 border-t border-white/10 pt-3">
                    <div className="flex justify-between items-end">
                      <label className="text-[10px] text-white font-semibold tracking-wider">
                        {t("FLIGHTPATH OPACITY")}
                      </label>
                      <span className="text-[10px] text-white/70 font-mono">
                        {Math.round((layer.flightpathOpacity ?? 0.8) * 100)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={(layer.flightpathOpacity ?? 0.8) * 100}
                      onChange={(e) =>
                        updateLayerProperty(
                          layer.id,
                          "flightpathOpacity",
                          Number(e.target.value) / 100,
                        )
                      }
                      className="w-full accent-white h-1 bg-white/20 appearance-none cursor-pointer"
                    />
                  </div>
                  
                  {selectedAircraftId && exportReadyData["flights"]?.id && exportReadyData["flights"].ready !== 'empty' && (
                    <div className="flex flex-col gap-2 pt-2 border-t border-white/10 mt-1">
                      <button
                        disabled={!exportReadyData["flights"].ready}
                        onClick={() => {
                          window.dispatchEvent(
                            new CustomEvent("requestGeoJsonExport", {
                              detail: { type: "flights", id: selectedAircraftId },
                            })
                          );
                        }}
                        className={`text-xs py-1.5 px-3 rounded flex items-center gap-2 justify-center transition-colors ${
                          exportReadyData["flights"].ready
                            ? "bg-white/10 hover:bg-white/20 text-white cursor-pointer"
                            : "bg-white/5 text-white/50 cursor-not-allowed"
                        }`}
                      >
                        {exportReadyData["flights"].ready ? (
                          <>
                            <Download size={14} />
                            {t("Export Selected")}
                          </>
                        ) : (
                          <>
                            <Loader2 size={14} className="animate-spin" />
                            {t("Loading...")}
                          </>
                        )}
                      </button>
                    </div>
                  )}

                </div>
    </>
  );
};
