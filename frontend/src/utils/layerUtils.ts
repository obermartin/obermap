import type { MapLayer } from '../types';

export const updateLayerRecursively = (
  layers: MapLayer[],
  targetId: string,
  updater: (l: MapLayer) => MapLayer,
): MapLayer[] => {
  return layers.map((layer) => {
    if (layer.id === targetId) return updater(layer);
    if (layer.type === "split" && layer.splitLayers) {
      return {
        ...layer,
        splitLayers: updateLayerRecursively(
          layer.splitLayers,
          targetId,
          updater,
        ),
      };
    }
    return layer;
  });
};

export const getEffectiveLayerDates = (
  layer: MapLayer,
  settings: {
    globalDateMode?: 'single' | 'range';
    globalStartDate?: string | null;
    globalEndDate?: string | null;
  }
) => {
  let defaultStartDate = "";
  let defaultEndDate = "";
  const todayStr = new Date().toISOString().split("T")[0];
  
  if (layer.type === "wildfires") {
    defaultEndDate = todayStr;
    const past7d = new Date(new Date().getTime() - 7 * 24 * 60 * 60 * 1000);
    defaultStartDate = past7d.toISOString().split("T")[0];
  } else {
    defaultStartDate = todayStr;
    defaultEndDate = todayStr;
  }

  const useGlobal = layer.useGlobalDate !== false;
  const isGlobalRange = settings.globalDateMode === 'range';
  
  let effectiveStartDate = layer.startDate || defaultStartDate;
  let effectiveEndDate = layer.endDate || defaultEndDate;

  if (useGlobal) {
    if (layer.type === 'deepstate' || layer.type === 'nighttime' || layer.type === 'weather_forecast') {
      // Single date layers
      effectiveStartDate = isGlobalRange ? (settings.globalEndDate || defaultStartDate) : (settings.globalStartDate || defaultStartDate);
    } else {
      // Range layers
      effectiveStartDate = settings.globalStartDate || defaultStartDate;
      effectiveEndDate = isGlobalRange ? (settings.globalEndDate || defaultEndDate) : (settings.globalStartDate || defaultEndDate);
    }
  }

  if (effectiveStartDate === 'today') effectiveStartDate = todayStr;
  if (effectiveEndDate === 'today') effectiveEndDate = todayStr;

  return { effectiveStartDate, effectiveEndDate };
};
