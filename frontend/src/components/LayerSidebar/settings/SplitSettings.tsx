import type { LayerSettingsProps } from "./types";
import { LayerItem } from "../LayerItem";
import type { MapLayer } from "../../../types";

export const SplitSettings = (props: LayerSettingsProps) => {
  const { layer, isDraggingLayer } = props;

  return (
    <div className="flex flex-col w-full">
      {layer.splitLayers?.map((child: MapLayer) => (
        <LayerItem
          key={child.id}
          {...props}
          layer={child}
          isNestedChild={true}
        />
      ))}
      {Array.from({ length: 2 - (layer.splitLayers?.length || 0) }).map(
        (_, i) => (
          <div
            key={`empty-${i}`}
            data-drop-zone="split-container"
            data-layer-id={layer.id}
            className={`ml-6 transition-all duration-300 ${isDraggingLayer ? "h-12 mt-[2px]" : "h-0 overflow-hidden"}`}
          >
            <div
              className={`relative h-full flex items-center justify-center select-none transition-colors duration-200 border-2 border-dashed ${isDraggingLayer ? "border-white bg-white/5" : "border-transparent bg-transparent"} rounded-full`}
            >
              <span className="text-xs text-white/40 font-semibold tracking-wider uppercase">
                DROP LAYER HERE
              </span>
            </div>
          </div>
        ),
      )}
    </div>
  );
};
