// @ts-nocheck
import React, { useRef, useState, useEffect } from "react";
import { Reorder, motion, AnimatePresence } from "framer-motion";
import { Upload, Link, X, Layers, Trash2, RefreshCcw, Copy, Settings, Save, Loader2, Image as ImageIcon, ChevronDown, ChevronRight, Video, Home, Tag, Download, Crop } from "lucide-react";
import { useTranslation } from "../../../contexts/I18nContext";
import { parseMapFileWithIds } from "../../../utils/fileUtils";
import { updateLayerRecursively } from "../../../utils/layerUtils";
import { customAlert, customConfirm, customPrompt } from "../../../utils/dialogService";
import { globalLabelManager } from "../../../labels/LabelMarkerManager";
import { DEFAULT_LAYERS } from "../constants";
import { TemplatePreview } from "../TemplatePreview";
import { CategoryItem } from "../CategoryItem";
import { LayerItem } from "../LayerItem";
import { LabelDensitySlider } from "./LabelDensitySlider";
import { PresetLayersPanel } from "./PresetLayersPanel";
import { AddUrlForm } from "./AddUrlForm";
import { ScreenshotMap } from "../ScreenshotMap";
import type { LayerSidebarTabProps } from "./types";

export const LayersTab = (props: LayerSidebarTabProps) => {
  const { t } = useTranslation();
  const {
    settings,
    setSettings,
    annotations,
    activeGeojsonLayerId,
    setActiveGeojsonLayerId,
    selectedGeojsonFeatureId,
    activeTab,
    setActiveTab,
    activeLabelTab,
    setActiveLabelTab,
    isDraggingLayer,
    setIsDraggingLayer,
    showPresetLayers,
    setShowPresetLayers,
    selectedAircraftId,
    setSelectedAircraftId,
    selectedVesselMmsi,
    setSelectedVesselMmsi,
    expandedCategories,
    setExpandedCategories,
    expandedLabelSettings,
    setExpandedLabelSettings,
    basemaps,
    isGeneratingScreenshotId,
    exportAspectRatios,
    setExportAspectRatios,
    videoFileTypes,
    setVideoFileTypes,
    videoDuration,
    setVideoDuration,
    videoBitrate,
    setVideoBitrate,
    exportReadyData,
    
    removeLayer,
    duplicateLayer,
    toggleLayerVisibility,
    renameLayer,
    handleDragEnd,
    handleZipUpload,
    handleFileUpload,
    handleGenerateBasemapPreview,
    
    saveAsPreset,
    handleUploadBasemapJson,
    fileInputRef,
    basemapFileInputRef,
    imageFilenamePrefix,
    setImageFilenamePrefix,
    activeCropOverlay,
    setActiveCropOverlay,
    currentShow,
    isOpen,
    setIsOpen,
    onSave,
    onSaveAndExit,
    onExport,
    isSaving,
    activeMapViewId,
    exportVideo,
    isExporting,
    exportProgress,
    cancelExport,
  } = props;

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

  const flatLayers = React.useMemo(() => {
    return settings.layers;
  }, [settings.layers]);

  const handleReorder = (newLayers: MapLayer[]) => {
    setSettings((prev) => ({ ...prev, layers: newLayers }));
  };

  const mapviewButtons = annotations?.filter((a: any) => (a.type === 'label' || a.type === 'highlight') && a.text && a.view) || [];

  return (
    <React.Fragment>
      <>
          <LabelDensitySlider settings={settings} setSettings={setSettings} />

          <div className="flex-1 overflow-hidden relative flex flex-col">
            <div
              data-drop-zone="root"
              className="flex-1 overflow-y-auto custom-scrollbar p-4 flex flex-col gap-2"
            >
              <label className="text-xs text-white mb-1 block font-semibold tracking-wider">
                {t("LAYER STACK")}
              </label>
              <Reorder.Group
                axis="y"
                values={flatLayers}
                onReorder={handleReorder}
                className="flex flex-col gap-2"
              >
                {flatLayers.map((layer) => {
                  return (
                    <LayerItem
                      key={layer.id}
                      exportReadyData={exportReadyData}
                      layer={layer}
                      isNestedChild={false}
                      isDraggingLayer={isDraggingLayer}
                      setIsDraggingLayer={setIsDraggingLayer}
                      handleDragEnd={handleDragEnd}
                      selectedAircraftId={selectedAircraftId}
                      selectedVesselMmsi={selectedVesselMmsi}
                      mapviewButtons={mapviewButtons}
                      toggleVisibility={toggleLayerVisibility}
                      removeLayer={removeLayer}
                      renameLayer={renameLayer}
                      colorPalette={settings.colorPalette}
                      activeGeojsonLayerId={activeGeojsonLayerId}
                      setActiveGeojsonLayerId={setActiveGeojsonLayerId}
                      selectedFeatureId={selectedGeojsonFeatureId}
                      globalDateMode={settings.globalDateMode}
                      globalStartDate={settings.globalStartDate}
                      globalEndDate={settings.globalEndDate}
                      saveAsPreset={saveAsPreset}
                      updateLayerStyle={(layerId, featureId, styleChanges) => {
                        setSettings((prev) => ({
                          ...prev,
                          layers: updateLayerRecursively(
                            prev.layers,
                            layerId,
                            (l) => {
                              if (!l.data || !l.data.features) return l;
                              const newData = {
                                ...l.data,
                                features: l.data.features.map((f: any) => {
                                  if (
                                    featureId === null ||
                                    f.properties?.id === featureId
                                  ) {
                                    return {
                                      ...f,
                                      properties: {
                                        ...f.properties,
                                        ...styleChanges,
                                      },
                                    };
                                  }
                                  return f;
                                }),
                              };
                              return { ...l, data: newData, _isDirty: true };
                            },
                          ),
                        }));
                      }}
                      updateLayerProperty={(layerId, property, value) => {
                        setSettings((prev) => ({
                          ...prev,
                          layers: updateLayerRecursively(
                            prev.layers,
                            layerId,
                            (l) => ({
                              ...l,
                              [property]: value,
                              _isDirty: true,
                            }),
                          ),
                        }));
                      }}
                      syncGlobalDate={(layerId) => {
                        setSettings((prev) => ({
                          ...prev,
                          layers: updateLayerRecursively(prev.layers, layerId, (l) => ({
                            ...l,
                            startDate: undefined,
                            endDate: undefined,
                            nighttimeDate: undefined,
                            useGlobalDate: true,
                            _isDirty: true,
                          }))
                        }));
                      }}
                      updateLayerDates={(layerId, startDate, endDate) => {
                        setSettings((prev) => ({
                          ...prev,
                          layers: updateLayerRecursively(
                            prev.layers,
                            layerId,
                            (l) => {
                              const newName =
                                l.type === "deepstate" &&
                                (l.name === "DeepStateMap Overlay" ||
                                  l.name === "DeepStateMap" ||
                                  l.name.startsWith("DSM ") ||
                                  l.name.startsWith("UKRAINE "))
                                  ? `UKRAINE ${(startDate || new Date().toISOString().split("T")[0]).split("-").reverse().join(".")}`
                                  : l.name;
                              return {
                                  ...l,
                                  startDate,
                                  endDate,
                                  name: newName,
                                  isLive: false,
                                  useGlobalDate: false,
                                  _isDirty: true,
                                };
                              },
                          ),
                        }));
                      }}
                      toggleLive={(layerId) => {
                        setSettings((prev) => ({
                          ...prev,
                          layers: updateLayerRecursively(
                            prev.layers,
                            layerId,
                            (l) => {
                              if (l.type !== "deepstate") return l;
                              const isCurrentlyLive = !!l.isLive;
                              const newName = !isCurrentlyLive
                                ? "UKRAINE CURRENT"
                                : `UKRAINE ${(l.startDate || new Date().toISOString().split("T")[0]).split("-").reverse().join(".")}`;
                              return {
                                ...l,
                                isLive: !isCurrentlyLive,
                                name: newName,
                                _isDirty: true,
                              };
                            },
                          ),
                        }));
                      }}
                      duplicateLayer={duplicateLayer}
                    />
                  );
                })}
              </Reorder.Group>
            </div>

            <PresetLayersPanel 
              settings={settings}
              setSettings={setSettings}
              showPresetLayers={showPresetLayers}
              setShowPresetLayers={setShowPresetLayers}
            />
          </div>

          <div className="p-4 border-t border-white/10 flex flex-col gap-3 relative z-30">
            <button
              onClick={() => setShowPresetLayers((prev) => !prev)}
              className="w-full py-2 bg-white/5 hover:bg-white/10 flex items-center justify-center gap-2 text-sm transition-colors rounded-full glass-bottom-btn"
            >
              <Layers size={16} /> {t("Preset layers")}
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-full py-2 bg-white/5 hover:bg-white/10 flex items-center justify-center gap-2 text-sm transition-colors rounded-full glass-bottom-btn"
            >
              <Upload size={16} /> {t("Upload GeoJSON/KML/KMZ")}
            </button>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              accept=".json,.geojson,.kml,.kmz"
              className="hidden"
            />

            <AddUrlForm setSettings={setSettings} />
          </div>
        </>
    </React.Fragment>
  );
};
