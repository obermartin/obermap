import React, { useRef, useState } from "react";
import type { MapLayer } from "../../types";
import { Reorder, useDragControls, motion } from "framer-motion";
import { GripVertical, Eye, EyeOff, Trash2, Edit2 } from "lucide-react";
import { useTranslation } from "../../contexts/I18nContext";
import { LayerSettings } from "./settings/LayerSettings";

export function LayerItem(props: {
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
}) {
  const { t } = useTranslation();
  
  const {
    layer,
    isNestedChild = false,
    toggleVisibility,
    removeLayer,
    renameLayer,
    activeGeojsonLayerId,
    setActiveGeojsonLayerId,
    handleDragEnd,
    isDraggingLayer,
    setIsDraggingLayer,
  } = props;
  
  const isActiveEdit = activeGeojsonLayerId === layer.id;
  const setActiveEdit = () => {
    if (isActiveEdit) setActiveGeojsonLayerId(null);
    else setActiveGeojsonLayerId(layer.id);
  };
  
  const controls = useDragControls();
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(layer.name);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDoubleClick = () => {
    if (
      ["deepstate", "satellite", "wildfires"].includes(layer.type) ||
      ["deepstate", "satellite"].includes(layer.id)
    )
      return;
    setIsEditing(true);
    setEditName(layer.name);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const handleRenameSubmit = () => {
    setIsEditing(false);
    if (editName.trim() && editName !== layer.name) {
      renameLayer(layer.id, editName.trim());
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleRenameSubmit();
    if (e.key === "Escape") {
      setIsEditing(false);
      setEditName(layer.name);
    }
  };

  const Wrapper: any = isNestedChild ? motion.div : Reorder.Item;
  const wrapperProps: any = isNestedChild
    ? {
        drag: true,
        dragControls: controls,
        dragListener: false,
        dragSnapToOrigin: true,
        style: { zIndex: 50 },
        onDragStart: () => setIsDraggingLayer?.(true),
        onDragEnd: (e: any) => {
          setIsDraggingLayer?.(false);
          // Wait to allow drop zone detection
          setTimeout(() => {
            if (handleDragEnd) handleDragEnd(e, layer.id);
          }, 0);
        },
      }
    : {
        value: layer,
        dragListener: false,
        dragControls: controls,
        onDragStart: () => setIsDraggingLayer?.(true),
        onDragEnd: (e: any) => {
          setIsDraggingLayer?.(false);
          if (handleDragEnd) handleDragEnd(e, layer.id);
        },
      };

  const iconColor = layer.visible
    ? "text-ui-text"
    : "text-ui-text/50 hover:text-ui-text";
  const iconColorFaded = layer.visible
    ? "text-ui-text"
    : "text-ui-text/30 hover:text-ui-text/70";

  return (
    <div className={`flex flex-col ${isActiveEdit ? "gap-0" : "gap-[2px]"}`}>
      <Wrapper
        {...wrapperProps}
        data-drop-zone={
          layer.type === "split" || isNestedChild ? "split-container" : "root"
        }
        data-layer-id={layer.id}
        className="w-full relative"
      >
        <div
          className={`glass-outlined-container relative flex flex-col transition-all duration-300 w-full ${isDraggingLayer && layer.type === "split" ? "bg-ui-text/5" : ""} rounded-3xl`}
        >
          <div
            className={`relative p-3 flex items-center gap-3 select-none group transition-opacity duration-200 ${isActiveEdit ? "bg-ui-bg z-10" : layer.visible ? "bg-ui-bg" : "bg-transparent"} ${!layer.visible ? "opacity-40" : "opacity-100"} ${isNestedChild ? "ml-6" : ""}`}
          >
            <div
              className={`cursor-grab active:cursor-grabbing ${iconColorFaded}`}
              onPointerDown={(e) => controls.start(e)}
              style={{ touchAction: "none" }}
            >
              <GripVertical size={16} />
            </div>
            <div
              data-layer-id={layer.id}
              className="absolute inset-0 pointer-events-none"
            />

            <button
              onClick={() => toggleVisibility(layer.id)}
              className={`transition-colors flex-shrink-0 ${iconColor}`}
            >
              {layer.visible ? <Eye size={18} /> : <EyeOff size={18} />}
            </button>

            <div className="flex-1 min-w-0" onDoubleClick={handleDoubleClick}>
              {layer.type === "split" ? (
                <div className="flex flex-col gap-2 w-full">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-semibold truncate text-ui-text">
                        {t("Split View Container")}
                      </div>
                      <div className="text-[10px] text-ui-text/40 uppercase tracking-wider">
                        {layer.splitLayers?.[0]?.name
                          ? t(layer.splitLayers[0].name)
                          : t("Empty")}{" "}
                        |{" "}
                        {layer.splitLayers?.[1]?.name
                          ? t(layer.splitLayers[1].name)
                          : t("Empty")}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  {isEditing ? (
                    <input
                      ref={inputRef}
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onBlur={handleRenameSubmit}
                      onKeyDown={handleKeyDown}
                      className="w-full bg-ui-bg border border-ui-border text-sm font-medium px-1 outline-none text-ui-text focus:border-ui-text/50"
                    />
                  ) : (
                    <div
                      className="text-sm font-medium truncate cursor-text"
                      title={t(layer.name)}
                    >
                      {t(layer.name)}
                    </div>
                  )}
                  <div className="text-[10px] text-ui-text/40 uppercase tracking-wider">
                    {layer.type}
                  </div>
                </>
              )}
            </div>

            {layer.type !== "split" &&
              (layer.type === "geojson" ||
                layer.type === "raster" ||
                layer.type === "satellite" ||
                layer.type === "deepstate" ||
                layer.type === "flights" ||
                layer.type === "vessels" ||
                layer.type === "weather_forecast" ||
                layer.type === "gdacs_earthquakes" ||
                layer.type === "cems_rapid_mapping" ||
                layer.type === "gdacs_volcanoes" ||
                layer.type === "wildfires" ||
                layer.type === "gdacs_cyclones" ||
                layer.type === "nighttime") && (
                <button
                  onClick={() => {
                    if (!layer.visible) toggleVisibility(layer.id);
                    setActiveEdit();
                  }}
                  className={`transition-colors ${isActiveEdit ? "text-ui-text" : iconColorFaded}`}
                  title={`Toggle ${layer.type === "geojson" ? "GeoJSON" : layer.type === "flights" ? "Air Traffic" : layer.type === "vessels" ? "Maritime Traffic" : layer.type === "weather_forecast" ? "Weather Forecast" : "Layer"} Edit Mode`}
                >
                  <Edit2 size={16} />
                </button>
              )}

            {!isNestedChild && (
                <button
                  onClick={() => removeLayer(layer.id)}
                  className={`transition-colors ml-1 ${iconColor} rounded-full`}
                >
                  <Trash2 size={16} />
                </button>
              )}
          </div>

          {(isActiveEdit || layer.type === "split") && (
            <LayerSettings {...props} />
          )}
        </div>
      </Wrapper>
    </div>
  );
}
