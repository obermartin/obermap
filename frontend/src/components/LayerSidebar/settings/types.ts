import type { MapLayer } from "../../../types";

export interface LayerSettingsProps {
  layer: MapLayer;
  isNestedChild?: boolean;
  toggleVisibility: (id: string) => void;
  removeLayer: (id: string) => void;
  renameLayer: (id: string, newName: string) => void;
  colorPalette: string[];
  activeGeojsonLayerId: string | null;
  setActiveGeojsonLayerId: (id: string | null) => void;
  selectedFeatureId: string | number | null;
  updateLayerStyle: (
    layerId: string,
    featureId: string | number | null,
    styleChanges: any,
  ) => void;
  updateLayerProperty: (
    layerId: string,
    property: keyof MapLayer,
    value: any,
  ) => void;
  updateLayerDates?: (
    layerId: string,
    startDate?: string,
    endDate?: string,
  ) => void;
  syncGlobalDate?: (layerId: string) => void;
  duplicateLayer?: (id: string) => void;
  saveAsPreset?: (layer: MapLayer) => void;
  toggleLive?: (layerId: string) => void;
  handleDragEnd?: (
    e: MouseEvent | TouchEvent | PointerEvent,
    layerId: string,
  ) => void;
  isDraggingLayer?: boolean;
  setIsDraggingLayer?: (isDragging: boolean) => void;
  selectedAircraftId?: string | null;
  selectedVesselMmsi?: string | null;
  mapviewButtons: any[];
  globalDateMode?: 'single' | 'range';
  globalStartDate?: string;
  globalEndDate?: string;
  exportReadyData: Record<string, { ready: boolean | string; id?: string }>;
}
