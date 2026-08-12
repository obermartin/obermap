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
import { LabelTemplateList } from "../settings/LabelTemplateList";
import type { LayerSidebarTabProps } from "./types";

export const LabelsTab = (props: LayerSidebarTabProps) => {
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
              {t("LABEL TEMPLATES")}
            </div>
          </div>

          <div className="p-4 flex flex-col gap-6 flex-1 overflow-y-auto custom-scrollbar">
            <div className="flex border border-white/20 rounded-full p-1 relative bg-transparent">
              <button
                onClick={() => setActiveLabelTab("regular")}
                className={`flex-1 px-4 py-2 text-sm relative z-10 transition-colors ${
                  activeLabelTab === "regular"
                    ? "text-black"
                    : "text-white/60 hover:text-white/80"
                }`}
              >
                {activeLabelTab === "regular" && (
                  <motion.div
                    layoutId="labeltab-active-bg"
                    className="absolute inset-0 bg-white rounded-full -z-10"
                    transition={{ type: "spring", stiffness: 400, damping: 30 }}
                  />
                )}
                {t("Label")}
              </button>
              <button
                onClick={() => setActiveLabelTab("highlight")}
                className={`flex-1 px-4 py-2 text-sm relative z-10 transition-colors ${
                  activeLabelTab === "highlight"
                    ? "text-black"
                    : "text-white/60 hover:text-white/80"
                }`}
              >
                {activeLabelTab === "highlight" && (
                  <motion.div
                    layoutId="labeltab-active-bg"
                    className="absolute inset-0 bg-white rounded-full -z-10"
                    transition={{ type: "spring", stiffness: 400, damping: 30 }}
                  />
                )}
                {t("Highlight")}
              </button>
              
              <button
                onClick={() => setActiveLabelTab("headline")}
                className={`flex-1 px-4 py-2 text-sm relative z-10 transition-colors ${
                  activeLabelTab === "headline"
                    ? "text-black"
                    : "text-white/60 hover:text-white/80"
                }`}
              >
                {activeLabelTab === "headline" && (
                  <motion.div
                    layoutId="labeltab-active-bg"
                    className="absolute inset-0 bg-white rounded-full -z-10"
                    transition={{ type: "spring", stiffness: 400, damping: 30 }}
                  />
                )}
                {t("Headline")}
              </button>
            </div>

            <div>
              <label className="text-[10px] text-white mb-2 block font-semibold tracking-wider">
                {t("AVAILABLE TEMPLATES")}
              </label>
              <div className="flex flex-col gap-3">
                <LabelTemplateList
                  settings={settings}
                  setSettings={setSettings}
                  activeLabelTab={activeLabelTab}
                  expandedLabelSettings={expandedLabelSettings}
                  setExpandedLabelSettings={setExpandedLabelSettings}
                />
              </div>
            </div>
          </div>
          <div className="p-4 border-t border-white/10 flex flex-col gap-3 relative z-30">
            <label className="w-full py-2 bg-white/5 hover:bg-white/10 flex items-center justify-center gap-2 text-sm transition-colors rounded-full cursor-pointer glass-bottom-btn">
              <Upload size={16} /> {t("Upload .ZIP template")}
              <input
                type="file"
                accept=".zip"
                className="hidden"
                onChange={handleZipUpload}
              />
            </label>
          </div>
        </>
    </React.Fragment>
  );
};
