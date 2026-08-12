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

export const IconsTab = (props: LayerSidebarTabProps) => {
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
              {t("ICON SETS")}
            </div>
          </div>

          <div className="p-4 flex flex-col flex-1 overflow-y-auto custom-scrollbar">
            <Reorder.Group
              axis="y"
              values={settings.icons || []}
              onReorder={(newCategories) =>
                setSettings((prev) => ({ ...prev, icons: newCategories }))
              }
              className="flex flex-col gap-4"
            >
              {settings.icons?.map((category, catIndex) => (
                <CategoryItem
                  key={category.id}
                  category={category}
                  catIndex={catIndex}
                  expandedCategories={expandedCategories}
                  setExpandedCategories={setExpandedCategories}
                  setSettings={setSettings}
                />
              ))}
            </Reorder.Group>
          </div>

          <div className="p-4 border-t border-white/10 flex flex-col gap-3">
            <button
              onClick={() => {
                setSettings((prev) => ({
                  ...prev,
                  icons: [
                    ...(prev.icons || []),
                    {
                      id: `cat-${Date.now()}`,
                      name: t("New Icon Set"),
                      icons: [],
                    },
                  ],
                }));
              }}
              className="w-full py-2 bg-white/5 hover:bg-white/10 flex items-center justify-center gap-2 text-sm transition-colors rounded-full glass-bottom-btn"
            >
              + {t("New Icon Set")}
            </button>

            <label className="w-full py-2 bg-white/5 hover:bg-white/10 flex items-center justify-center gap-2 text-sm transition-colors cursor-pointer rounded-full glass-bottom-btn">
              <Upload size={16} /> {t("Upload Icon Set")}
              <input
                type="file"
                accept=".svg"
                multiple
                className="hidden"
                onChange={async (e) => {
                  const files = e.target.files;
                  if (!files || files.length === 0) return;

                  const catName = await customPrompt(
                    t(
                      `Enter a name for the new category containing {{count}} icons:`,
                      { count: files.length },
                    ),
                    t("New Category"),
                  );
                  if (!catName) {
                    e.target.value = "";
                    return;
                  }

                  const newIcons: { id: string; svg: string }[] = [];
                  for (let i = 0; i < files.length; i++) {
                    const file = files[i];
                    const text = await new Promise<string>((resolve) => {
                      const reader = new FileReader();
                      reader.onload = (event) =>
                        resolve(event.target?.result as string);
                      reader.readAsText(file);
                    });
                    if (text.includes("<svg")) {
                      newIcons.push({
                        id: `icon-${Date.now()}-${i}`,
                        svg: text,
                      });
                    }
                  }

                  if (newIcons.length > 0) {
                    setSettings((prev) => ({
                      ...prev,
                      icons: [
                        ...(prev.icons || []),
                        {
                          id: `cat-${Date.now()}`,
                          name: catName,
                          icons: newIcons,
                        },
                      ],
                    }));
                  }
                  e.target.value = "";
                }}
              />
            </label>
          </div>
        </>
    </React.Fragment>
  );
};
