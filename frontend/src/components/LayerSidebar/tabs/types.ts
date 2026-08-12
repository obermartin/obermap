import type { AppSettings, MapLayer, BaseMapStyle } from "../../../types";


export interface LayerSidebarTabProps {
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
  
  // Tab specific additions that are passed from LayerSidebar
  activeTab: "layers" | "icons" | "labels" | "basemap" | "video";
  setActiveTab: React.Dispatch<React.SetStateAction<"layers" | "icons" | "labels" | "basemap" | "video">>;
  activeLabelTab?: "regular" | "highlight" | "headline";
  setActiveLabelTab?: React.Dispatch<React.SetStateAction<"regular" | "highlight" | "headline">>;
  isDraggingLayer?: boolean;
  setIsDraggingLayer?: React.Dispatch<React.SetStateAction<boolean>>;
  showPresetLayers?: boolean;
  setShowPresetLayers?: React.Dispatch<React.SetStateAction<boolean>>;
  selectedAircraftId?: string | null;
  setSelectedAircraftId?: React.Dispatch<React.SetStateAction<string | null>>;
  selectedVesselMmsi?: string | null;
  setSelectedVesselMmsi?: React.Dispatch<React.SetStateAction<string | null>>;
  expandedCategories?: Record<string, boolean>;
  setExpandedCategories?: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  expandedLabelSettings?: Record<string, boolean>;
  setExpandedLabelSettings?: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  
  basemaps?: BaseMapStyle[];
  isGeneratingScreenshotId?: string | null;
  exportAspectRatios?: ("landscape" | "portrait" | "square")[];
  setExportAspectRatios?: React.Dispatch<React.SetStateAction<("landscape" | "portrait" | "square")[]>>;
  videoFileTypes?: ("mp4" | "jsx")[];
  setVideoFileTypes?: React.Dispatch<React.SetStateAction<("mp4" | "jsx")[]>>;
  videoDuration?: number;
  setVideoDuration?: React.Dispatch<React.SetStateAction<number>>;
  videoBitrate?: number;
  setVideoBitrate?: React.Dispatch<React.SetStateAction<number>>;
  exportReadyData?: Record<string, { ready: boolean | string; id?: string }>;
  
  // Helpers
  removeLayer?: (layerId: string) => void;
  duplicateLayer?: (layerId: string) => void;
  toggleLayerVisibility?: (layerId: string) => void;
  renameLayer?: (layerId: string, newName: string) => void;
  handleDragEnd?: (event: any, layerId: string) => void;
  handleZipUpload?: (e: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
  handleFileUpload?: (e: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
  saveAsPreset?: (layerToSave: MapLayer) => void;
  
  fileInputRef?: React.RefObject<HTMLInputElement | null>;
  imageFilenamePrefix?: string;
  setImageFilenamePrefix?: React.Dispatch<React.SetStateAction<string>>;
}
