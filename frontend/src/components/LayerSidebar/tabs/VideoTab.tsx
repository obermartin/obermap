// @ts-nocheck
import React, { useRef, useState, useEffect } from "react";
import { Reorder, motion, AnimatePresence } from "framer-motion";
import { Upload, Link, X, Layers, Trash2, RefreshCcw, Copy, Settings, Save, Loader2, Image as ImageIcon, ChevronDown, ChevronRight, Video, Home, Tag, Download, Crop } from "lucide-react";
import { useTranslation } from "../../../contexts/I18nContext";
import { parseMapFileWithIds } from "../../../utils/fileUtils";
import { customAlert, customConfirm, customPrompt } from "../../../utils/dialogService";
import { globalLabelManager } from "../../../labels/LabelMarkerManager";
import { DEFAULT_LAYERS } from "../constants";
import { TemplatePreview } from "../TemplatePreview";
import { CategoryItem } from "../CategoryItem";
import { LayerItem } from "../LayerItem";
import { ScreenshotMap } from "../ScreenshotMap";
import type { LayerSidebarTabProps } from "./types";

export const VideoTab = (props: LayerSidebarTabProps) => {
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
  } = props;

  return (
    <React.Fragment>
      <>
          <div className="p-4 pb-2 border-b border-white/20">
            <div className="text-xs font-semibold tracking-wider text-white">
              {t("EXPORT")}
            </div>
          </div>

          <div className="p-4 flex flex-col flex-1 overflow-y-auto custom-scrollbar gap-6">
            <div className="space-y-4">
              <div>
                <label className="text-xs text-white/60 mb-2 block font-semibold tracking-wider">
                  {t("ASPECT RATIO")}
                </label>
                <div className="flex flex-col gap-1 mt-2">
                  {[
                    { id: "landscape", label: "Landscape", labelDe: "Quer" },
                    { id: "portrait", label: "Portrait", labelDe: "Hochkant" },
                    { id: "square", label: "Square", labelDe: "Quadratisch" }
                  ].map((fmt) => {
                    const isEnabled = exportAspectRatios.includes(fmt.id as any);
                    const isCropping = activeCropOverlay === fmt.id;
                    return (
                      <div key={fmt.id} className="flex items-center justify-between py-1">
                        <span className="text-sm font-medium text-white">{t(fmt.label)}</span>
                        <div className="flex items-center gap-3">
                          <button
                            title={t("Image Crop")}
                            onClick={() => {
                              if (isCropping) {
                                setActiveCropOverlay(null);
                              } else {
                                setActiveCropOverlay(fmt.id as any);
                                // Ensure it's enabled if they try to crop it
                                if (!isEnabled) {
                                  setExportAspectRatios(prev => [...prev, fmt.id as any]);
                                }
                              }
                            }}
                            className={`p-1 rounded transition-colors ${isCropping ? 'bg-white text-black' : 'text-white/50 hover:bg-white/10 hover:text-white'}`}
                          >
                            <Crop size={14} />
                          </button>
                          <button
                            onClick={() => {
                              setExportAspectRatios(prev => 
                                prev.includes(fmt.id as any) 
                                  ? prev.filter(f => f !== fmt.id) 
                                  : [...prev, fmt.id as any]
                              );
                              if (isCropping) setActiveCropOverlay(null);
                            }}
                            className={`w-9 h-5 rounded-full relative transition-colors ${isEnabled ? "bg-white" : "bg-white/20"}`}
                          >
                            <div className={`w-3 h-3 rounded-full absolute top-1 transition-all ${isEnabled ? "left-5 bg-black" : "left-1 bg-white"}`} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="mt-8 mb-6">
                <label className="text-xs text-white/60 mb-2 block font-semibold tracking-wider">
                  {t("VIDEO FILE TYPE")}
                </label>
                <div className="flex flex-col gap-1 mt-2">
                  {[
                    { id: "mp4", label: "Video (mp4)" },
                    { id: "jsx", label: "After Effects data (jsx)" }
                  ].map((fmt) => {
                    const isEnabled = videoFileTypes.includes(fmt.id as any);
                    return (
                      <div key={fmt.id} className="flex items-center justify-between py-1">
                        <span className="text-sm font-medium text-white">{t(fmt.label)}</span>
                        <button
                          onClick={() => {
                            setVideoFileTypes(prev => 
                              prev.includes(fmt.id as any) 
                                ? prev.filter(f => f !== fmt.id) 
                                : [...prev, fmt.id as any]
                            );
                          }}
                          className={`w-9 h-5 rounded-full relative transition-colors ${isEnabled ? "bg-white" : "bg-white/20"}`}
                        >
                          <div className={`w-3 h-3 rounded-full absolute top-1 transition-all ${isEnabled ? "left-5 bg-black" : "left-1 bg-white"}`} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="text-xs text-white/60 mb-2 flex justify-between font-semibold tracking-wider">
                  <span>{t("STEP DURATION")}</span>
                  <span>{videoDuration}s</span>
                </label>
                <input
                  type="range"
                  min="1"
                  max="10"
                  step="1"
                  value={videoDuration}
                  onChange={(e) => setVideoDuration(parseInt(e.target.value))}
                  className="w-full accent-white"
                />
              </div>

              <div>
                <label className="text-xs text-white/60 mb-2 flex justify-between font-semibold tracking-wider">
                  <span>{t("VIDEO BITRATE")}</span>
                  <span>{videoBitrate} Mbps</span>
                </label>
                <input
                  type="range"
                  min="5"
                  max="100"
                  step="5"
                  value={videoBitrate}
                  onChange={(e) => setVideoBitrate(parseInt(e.target.value))}
                  className="w-full accent-white"
                />
              </div>

              <div className="mt-6">
                <div className="space-y-4">
                  <div>
                    <label className="text-[10px] font-bold text-white/50 tracking-wider uppercase mb-1.5 block">
                      {t("STILL IMAGE FILENAME")}
                    </label>
                    <input
                      type="text"
                      value={imageFilenamePrefix}
                      onChange={(e) => setImageFilenamePrefix(e.target.value)}
                      className="w-full bg-black/40 border border-white/20 rounded px-3 py-1.5 text-sm text-white placeholder-white/30 focus:outline-none focus:border-white transition-colors"
                      placeholder={t("Enter filename...")}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="p-4 border-t border-white/10 flex flex-col gap-3">
            {!annotations?.some(
              (a) =>
                (a.type === "label" || a.type === "highlight") &&
                a.text &&
                a.view,
            ) && (
              <div className="text-xs text-red-400/80 text-center px-2 py-1 leading-relaxed bg-red-500/10 rounded">
                {t(
                  "Video export requires custom map views to be set. Please use the highlight or label tools or manually add map views with the camera button.",
                )}
              </div>
            )}
            <button
              disabled={
                exportAspectRatios.length === 0 || videoFileTypes.length === 0 ||
                !annotations?.some(
                  (a) =>
                    (a.type === "label" || a.type === "highlight") &&
                    a.text &&
                    a.view,
                )
              }
              onClick={() => {
                const event = new CustomEvent("startVideoExport", {
                  detail: {
                    formats: exportAspectRatios,
                    fileTypes: videoFileTypes,
                    duration: videoDuration,
                    dynamicLabels: true,
                    bitrate: videoBitrate,
                    showName: settings.title || currentShow,
                  },
                });
                window.dispatchEvent(event);
                setIsOpen(false);
              }}
              className={`w-full py-2 flex items-center justify-center gap-2 text-sm transition-colors ${
                annotations?.some(
                  (a) =>
                    (a.type === "label" || a.type === "highlight") &&
                    a.text &&
                    a.view,
                )
                  ? "bg-white/5 hover:bg-white/10"
                  : "bg-white/5 text-white/30 cursor-not-allowed"
              } rounded-full glass-bottom-btn`}
            >
              <Video size={16} /> {t("Export Video")}
            </button>
            <button
              disabled={exportAspectRatios.length === 0}
              onClick={() => {
                const event = new CustomEvent("startImageExport", {
                  detail: { formats: exportAspectRatios, filenamePrefix: imageFilenamePrefix },
                });
                window.dispatchEvent(event);
                setIsOpen(false);
              }}
              className={`w-full py-2 flex items-center justify-center gap-2 text-sm transition-colors ${
                exportAspectRatios.length > 0
                  ? "bg-white/5 hover:bg-white/10"
                  : "bg-white/5 text-white/30 cursor-not-allowed"
              } rounded-full glass-bottom-btn`}
            >
              <ImageIcon size={16} /> {exportAspectRatios.length > 1 ? t("Export images") : t("Export image")}
            </button>
            {annotations?.some(a => a.coordinates || a.polygonGeometry || a.routeGeometry) && (
              <button
                onClick={() => onExport?.()}
                className="w-full py-2 flex items-center justify-center gap-2 text-sm transition-colors bg-white/5 hover:bg-white/10 rounded-full glass-bottom-btn"
              >
                <Download size={16} /> {t("Export Annotations")}
              </button>
            )}
          </div>
        </>
    </React.Fragment>
  );
};
