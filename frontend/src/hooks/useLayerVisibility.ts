import { useMemo } from 'react';
import type { LayerVisibilityProps } from './useLayerVisibilityProps';
import { useLayerFade } from './layers/useLayerFade';
import { useWeatherVisibility } from './layers/useWeatherVisibility';
import { useRasterVisibility } from './layers/useRasterVisibility';
import { useCustomLayerVisibility } from './layers/useCustomLayerVisibility';
import { useDisasterVisibility } from './layers/useDisasterVisibility';
import { useLayerReordering } from './layers/useLayerReordering';

export const useLayerVisibility = (props: LayerVisibilityProps) => {
  const {
    map, mapLoaded, mapStyleLoaded, mapStyleTick, settings, activeTool, revealedTriggers, hiddenTriggers,
    annotations, selectedAircraftId, selectedVesselMmsi, selectedWeatherTime, weatherValidTimes,
    weatherForecastLayerIdsRef, weatherForecastSourceIdsRef, lastActiveWeatherTimeRef,
    weatherAllValidTimesRef, windLastFetchRef
  } = props;

  const { setLayerFade } = useLayerFade(map, settings.labelAnimationDuration ?? 1000);

  const { firstAdminId, firstSymbolId, fallbackFont, computedLayers } = useMemo(() => {
    let style;
    try {
      if (map && (map as any).style && (map as any).style._loaded) {
        style = map.getStyle();
      }
    } catch(e) {}
    
    const layers = (settings.layers || []).map(layer => {
      const triggerExists = (id: string | undefined) => id ? annotations.some(a => a.id === id) : false;
      const hasRevealTrigger = !!layer.animationTriggerId && triggerExists(layer.animationTriggerId);
      const hasHideTrigger = !!layer.hideAnimationTriggerId && triggerExists(layer.hideAnimationTriggerId);
      
      const overrideVisible = activeTool !== 'none';
      const isRevealed = overrideVisible || (!hasRevealTrigger || revealedTriggers.has(layer.animationTriggerId!));
      const isHidden = !overrideVisible && (hasHideTrigger && hiddenTriggers.has(layer.hideAnimationTriggerId!));
      
      const isTriggerVisible = isRevealed && !isHidden;
      
      return { ...layer, _effectiveOpacityVisible: isTriggerVisible };
    });
    
    const styleLayers = style?.layers || [];
    const fSymbolId = styleLayers.find(l => l.type === 'symbol')?.id;
    
    let lastWaterIndex = -1;
    for (let i = 0; i < styleLayers.length; i++) {
      if (styleLayers[i].type === 'fill' && (styleLayers[i].id.includes('water') || styleLayers[i].id.includes('marine') || styleLayers[i].id.includes('ocean'))) {
        lastWaterIndex = i;
      }
    }
    
    let fAdminId = undefined;
    for (let i = lastWaterIndex + 1; i < styleLayers.length; i++) {
      const l = styleLayers[i];
      if ((l.type === 'line' || l.type === 'symbol') &&
          (l.id.includes('admin') || l.id.includes('border') || l.id.includes('boundar') || l.id.includes('country'))) {
        fAdminId = l.id;
        break;
      }
    }
    fAdminId = fAdminId || fSymbolId;
    
    let fSymbolFont = ['Open Sans Regular'];
    for (let i = 0; i < styleLayers.length; i++) {
      if (styleLayers[i].type === 'symbol') {
        const font = (styleLayers[i] as any).layout?.['text-font'];
        if (font && Array.isArray(font) && font.length > 0 && typeof font[0] === 'string') {
           fSymbolFont = font;
           break;
        }
      }
    }

    const fallbFont = settings.replaceGothamFont !== false ? ['Gotham Condensed Bold', ...fSymbolFont] : fSymbolFont;

    return { firstAdminId: fAdminId, firstSymbolId: fSymbolId, fallbackFont: fallbFont, computedLayers: layers };
  }, [map, mapStyleLoaded, settings, annotations, activeTool, revealedTriggers, hiddenTriggers]);

  const baseProps = {
    map,
    mapLoaded,
    mapStyleLoaded,
    mapStyleTick,
    settings,
    layers: computedLayers,
    firstAdminId,
    firstSymbolId,
    fallbackFont
  };

  useWeatherVisibility({
    ...baseProps,
    setLayerFade,
    selectedWeatherTime,
    weatherValidTimes,
    weatherForecastLayerIdsRef,
    weatherForecastSourceIdsRef,
    lastActiveWeatherTimeRef,
    weatherAllValidTimesRef,
    windLastFetchRef
  });

  useRasterVisibility({
    ...baseProps,
    setLayerFade
  });

  useDisasterVisibility({
    ...baseProps,
    setLayerFade
  });

  useCustomLayerVisibility({
    ...baseProps,
    setLayerFade,
    selectedAircraftId,
    selectedVesselMmsi
  });

  useLayerReordering({
    ...baseProps,
    weatherForecastLayerIdsRef
  });
};
