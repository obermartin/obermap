// @ts-nocheck
import React, { useRef, useState, useEffect } from "react";
import type { AppSettings, MapLayer, BaseMapStyle } from "../../types";
import { Reorder, motion, AnimatePresence } from "framer-motion";
import { Upload, Link, X, Layers, Trash2, RefreshCcw, Copy, Settings, Save, Loader2, Image as ImageIcon, ChevronDown, ChevronRight, Video, Home, Tag, Download, Crop } from "lucide-react";
import { parseMapFileWithIds } from "../../utils/fileUtils";
import { updateLayerRecursively } from "../../utils/layerUtils";
import { customAlert, customConfirm, customPrompt } from "../../utils/dialogService";
import { useLayerManagement } from "../../hooks/useLayerManagement";
import { useTranslation } from "../../contexts/I18nContext";
import { globalLabelManager, type Theme } from "../../labels/LabelMarkerManager";
import { DEFAULT_LAYERS } from "./constants";
import { TemplatePreview } from "./TemplatePreview";
import { CategoryItem } from "./CategoryItem";
import { LayerItem } from "./LayerItem";
import { ScreenshotMap } from "./ScreenshotMap";
import { LayersTab } from "./tabs/LayersTab";
import { IconsTab } from "./tabs/IconsTab";
import { LabelsTab } from "./tabs/LabelsTab";
import { VideoTab } from "./tabs/VideoTab";
import { SettingsTab } from "./tabs/SettingsTab";
import type { LayerSidebarTabProps } from "./tabs/types";

export interface LayerSidebarProps {
  settings: AppSettings;
  setSettings: React.Dispatch<React.SetStateAction<AppSettings>>;
  annotations?: any[];
  currentShow?: string | null;
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  activeGeojsonLayerId: string | null;
  setActiveGeojsonLayerId: React.Dispatch<React.SetStateAction<string | null>>;
  selectedGeojsonFeatureId: string | number | null;
  onSave?: () => void;
  onSaveAndExit?: () => void;
  onExport?: () => void;
  isSaving?: boolean;
  activeMapViewId?: string;
  activeCropOverlay: 'landscape' | 'portrait' | 'square' | null;
  setActiveCropOverlay: React.Dispatch<React.SetStateAction<'landscape' | 'portrait' | 'square' | null>>;
}

export function LayerSidebar({
  settings,
  setSettings,
  annotations,
  currentShow,
  isOpen,
  setIsOpen,
  activeGeojsonLayerId,
  setActiveGeojsonLayerId,
  selectedGeojsonFeatureId,
  onSave,
  onSaveAndExit,
  onExport,
  isSaving,
  activeMapViewId,
  activeCropOverlay,
  setActiveCropOverlay,
}: LayerSidebarProps) {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const getDefaultFilename = () => {
    if (!activeMapViewId || activeMapViewId === 'overview') {
      return settings.title || 'obermap';
    }
    const mapview = annotations?.find(a => a.id === activeMapViewId);
    return mapview?.text || settings.title || 'obermap';
  };
  
  const [imageFilenamePrefix, setImageFilenamePrefix] = useState<string>(getDefaultFilename());
  
  useEffect(() => {
    setImageFilenamePrefix(getDefaultFilename());
  }, [activeMapViewId, settings.title, annotations]);


  const [activeTab, setActiveTab] = useState<
    "layers" | "icons" | "labels" | "basemap" | "video"
  >("layers");
  const [activeLabelTab, setActiveLabelTab] = useState<"regular" | "highlight" | "headline">(
    "regular",
  );
  const [isDraggingLayer, setIsDraggingLayer] = useState(false);
  const [showPresetLayers, setShowPresetLayers] = useState(false);
  const [selectedAircraftId, setSelectedAircraftId] = useState<string | null>(
    null,
  );
  const [selectedVesselMmsi, setSelectedVesselMmsi] = useState<string | null>(
    null,
  );
  const [expandedCategories, setExpandedCategories] = useState<
    Record<string, boolean>
  >({});
  const [expandedLabelSettings, setExpandedLabelSettings] = useState<
    Record<string, boolean>
  >({});
  // Export State
  const [exportAspectRatios, setExportAspectRatios] = useState<("landscape" | "portrait" | "square")[]>(["landscape"]);
  const [videoFileTypes, setVideoFileTypes] = useState<("mp4" | "jsx")[]>(["mp4"]);
  const [videoDuration, setVideoDuration] = useState<number>(3);

  const [videoBitrate, setVideoBitrate] = useState<number>(15);

  const [exportReadyData, setExportReadyData] = useState<Record<string, { ready: boolean | string; id?: string }>>({});

  useEffect(() => {
    const handler = (e: CustomEvent<string | null>) =>
      setSelectedAircraftId(e.detail);
    window.addEventListener("aircraftSelected", handler as EventListener);

    const vesselHandler = (e: CustomEvent<string | null>) =>
      setSelectedVesselMmsi(e.detail);
    window.addEventListener("vesselSelected", vesselHandler as EventListener);

    const exportReadyHandler = (e: CustomEvent) => {
      if (e.detail?.type) {
        setExportReadyData(prev => ({ ...prev, [e.detail.type]: { ready: e.detail.ready, id: e.detail.id } }));
      }
    };
    window.addEventListener("exportDataReady", exportReadyHandler as EventListener);

    return () => {
      window.removeEventListener("aircraftSelected", handler as EventListener);
      window.removeEventListener(
        "vesselSelected",
        vesselHandler as EventListener,
      );
      window.removeEventListener("exportDataReady", exportReadyHandler as EventListener);
    };
  }, []);


  // Fetch available templates
  useEffect(() => {
    fetch("/api/templates")
      .then((r) => r.json())
      .then((list) => {
        if (!Array.isArray(list)) list = [];
        setSettings((prev) => ({
          ...prev,
          labelTemplates: {
            ...prev.labelTemplates,
            availableTemplates: list,
          },
        }));
      })
      .catch((e) => console.error("Error fetching templates", e));
  }, [setSettings]);

  const handleZipUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await fetch("/api/upload-template", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (data.success) {
        customAlert(t("Template uploaded successfully"));
        fetch("/api/templates")
          .then((r) => r.json())
          .then((list) => {
            setSettings((prev) => ({
              ...prev,
              labelTemplates: {
                ...prev.labelTemplates,
                availableTemplates: list,
                hiddenTemplates: (
                  prev.labelTemplates?.hiddenTemplates || []
                ).filter((id) => id !== data.name),
              },
            }));
          });
      } else {
        customAlert(t("Upload failed") + ": " + data.error);
      }
    } catch (err) {
      console.error(err);
      customAlert(t("Error uploading template"));
    }
  };

  const {
    saveAsPreset,
    toggleLayerVisibility,
    removeLayer,
    renameLayer,
    duplicateLayer,
    handleDragEnd,
    handleFileUpload
  } = useLayerManagement({ setSettings, t, fileInputRef });



  
  const tabProps: LayerSidebarTabProps = {
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
    saveAsPreset,
    fileInputRef,
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
  };
return (
    <div
      className={`absolute top-0 left-0 h-full w-80 bg-ui-bg border-r border-ui-border flex flex-col shadow-2xl z-40 text-ui-text transition-all duration-300 ease-in-out ${isOpen ? "translate-x-0" : "-translate-x-full"} ui-glass-panel`}
      style={{ paddingBottom: `${settings?.uiBottomPadding || 0}px` }}
    >
      <div className="p-4 flex justify-start items-center bg-black/20">
        <button
          onClick={onSaveAndExit || (() => setIsOpen(false))}
          className="text-ui-text/50 hover:text-ui-text transition-colors"
          title={onSaveAndExit ? t("Save & Exit to Overview") : t("Close")}
        >
          <Home size={18} />
        </button>
      </div>

      <div className="p-3">
        <div className="flex border border-ui-border glass-outlined-container rounded-full p-1 relative bg-transparent text-xs font-semibold tracking-wider">
          <button
            onClick={() => setActiveTab("layers")}
            className={`flex-1 py-2 flex items-center justify-center relative z-10 transition-colors ${activeTab === "layers" ? "text-ui-bg" : "text-ui-text/50 hover:text-ui-text/80"}`}
            title={t("Layers")}
          >
            {activeTab === "layers" && (
              <motion.div
                layoutId="tab-active-bg"
                className="absolute inset-0 bg-ui-text glass-tab-active rounded-full -z-10"
                transition={{ type: "spring", stiffness: 400, damping: 30 }}
              />
            )}
            <Layers size={18} />
          </button>
          <button
            onClick={() => setActiveTab("icons")}
            className={`flex-1 py-2 flex items-center justify-center relative z-10 transition-colors ${activeTab === "icons" ? "text-ui-bg" : "text-ui-text/50 hover:text-ui-text/80"}`}
            title={t("Icon Library")}
          >
            {activeTab === "icons" && (
              <motion.div
                layoutId="tab-active-bg"
                className="absolute inset-0 bg-ui-text glass-tab-active rounded-full -z-10"
                transition={{ type: "spring", stiffness: 400, damping: 30 }}
              />
            )}
            <ImageIcon size={18} />
          </button>
          <button
            onClick={() => setActiveTab("labels")}
            className={`flex-1 py-2 flex items-center justify-center relative z-10 transition-colors ${activeTab === "labels" ? "text-ui-bg" : "text-ui-text/50 hover:text-ui-text/80"}`}
            title={t("Label Templates")}
          >
            {activeTab === "labels" && (
              <motion.div
                layoutId="tab-active-bg"
                className="absolute inset-0 bg-ui-text glass-tab-active rounded-full -z-10"
                transition={{ type: "spring", stiffness: 400, damping: 30 }}
              />
            )}
            <Tag size={18} />
          </button>
          <button
            onClick={() => setActiveTab("basemap")}
            className={`flex-1 py-2 flex items-center justify-center relative z-10 transition-colors ${activeTab === "basemap" ? "text-ui-bg" : "text-ui-text/50 hover:text-ui-text/80"}`}
            title={t("Base Map & Settings")}
          >
            {activeTab === "basemap" && (
              <motion.div
                layoutId="tab-active-bg"
                className="absolute inset-0 bg-ui-text glass-tab-active rounded-full -z-10"
                transition={{ type: "spring", stiffness: 400, damping: 30 }}
              />
            )}
            <Settings size={18} />
          </button>
          <button
            onClick={() => setActiveTab("video")}
            className={`flex-1 py-2 flex items-center justify-center relative z-10 transition-colors ${activeTab === "video" ? "text-ui-bg" : "text-ui-text/50 hover:text-ui-text/80"}`}
            title={t("Export Video")}
          >
            {activeTab === "video" && (
              <motion.div
                layoutId="tab-active-bg"
                className="absolute inset-0 bg-ui-text glass-tab-active rounded-full -z-10"
                transition={{ type: "spring", stiffness: 400, damping: 30 }}
              />
            )}
            <Video size={18} />
          </button>
          {onSave && <div className="w-[1px] bg-ui-border mx-1 my-1" />}
          {onSave && (
            <button
              onClick={onSave}
              disabled={isSaving}
              className={`w-12 flex items-center justify-center transition-colors rounded-full shrink-0 ${isSaving ? "text-ui-text cursor-wait bg-ui-text/5" : "text-ui-text/50 hover:bg-ui-text/10 hover:text-ui-text"}`}
              title={t("Save Map & Settings")}
            >
              {isSaving ? (
                <Loader2 className="animate-spin" size={18} />
              ) : (
                <Save size={18} />
              )}
            </button>
          )}
        </div>
      </div>

      {activeTab === "layers" ? (
        <LayersTab {...tabProps} />
      ) : activeTab === "icons" ? (
        <IconsTab {...tabProps} />
      ) : activeTab === "labels" ? (
        <LabelsTab {...tabProps} />
      ) : activeTab === "video" ? (
        <VideoTab {...tabProps} />
      ) : (
        <SettingsTab {...tabProps} />
      )}
    </div>
  );
}
