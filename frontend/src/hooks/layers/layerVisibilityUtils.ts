import maplibregl from 'maplibre-gl';

export const setLayerFade = (
  map: maplibregl.Map,
  layerFadeTimeoutsRef: React.MutableRefObject<Record<string, any>>,
  fadeDuration: number,
  mapLibreLayerId: string,
  layerType: string,
  isVisible: boolean,
  maxOpacity: any = 1,
  layerSidebarVisible: boolean = true
) => {
  if (!map.getLayer(mapLibreLayerId)) return;
  
  if (!layerSidebarVisible) {
    map.setLayoutProperty(mapLibreLayerId, 'visibility', 'none');
    if (layerFadeTimeoutsRef.current[mapLibreLayerId]) {
      clearTimeout(layerFadeTimeoutsRef.current[mapLibreLayerId]);
      delete layerFadeTimeoutsRef.current[mapLibreLayerId];
    }
    return;
  }
  
  if (layerFadeTimeoutsRef.current[mapLibreLayerId]) {
    clearTimeout(layerFadeTimeoutsRef.current[mapLibreLayerId]);
    delete layerFadeTimeoutsRef.current[mapLibreLayerId];
  }
  
  const transition = { duration: fadeDuration, delay: 0 };
  const opacityProp = `${layerType}-opacity`;
  const currentVisibility = map.getLayoutProperty(mapLibreLayerId, 'visibility');
  
  if (isVisible) {
    if (currentVisibility === 'none') {
      map.setLayoutProperty(mapLibreLayerId, 'visibility', 'visible');
      setTimeout(() => {
        if (!map.getLayer(mapLibreLayerId)) return;
        map.setPaintProperty(mapLibreLayerId, opacityProp + '-transition', transition);
        map.setPaintProperty(mapLibreLayerId, opacityProp, maxOpacity);
      }, 30);
    } else {
      map.setPaintProperty(mapLibreLayerId, opacityProp + '-transition', transition);
      map.setPaintProperty(mapLibreLayerId, opacityProp, maxOpacity);
    }
  } else {
    map.setPaintProperty(mapLibreLayerId, opacityProp + '-transition', transition);
    map.setPaintProperty(mapLibreLayerId, opacityProp, 0);
    
    layerFadeTimeoutsRef.current[mapLibreLayerId] = setTimeout(() => {
      if (map.getLayer(mapLibreLayerId)) {
        map.setLayoutProperty(mapLibreLayerId, 'visibility', 'none');
      }
      delete layerFadeTimeoutsRef.current[mapLibreLayerId];
    }, fadeDuration);
  }
};

export const getBaseMapLayersInfo = (map: maplibregl.Map, settings: any) => {
  let style;
  try {
    style = map.getStyle();
  } catch(e) {
    return null;
  }
  
  const styleLayers = style?.layers || [];
  const firstSymbolId = styleLayers.find(l => l.type === 'symbol')?.id;
  
  let lastWaterIndex = -1;
  for (let i = 0; i < styleLayers.length; i++) {
    if (styleLayers[i].type === 'fill' && (styleLayers[i].id.includes('water') || styleLayers[i].id.includes('marine') || styleLayers[i].id.includes('ocean'))) {
      lastWaterIndex = i;
    }
  }
  
  let firstAdminId = undefined;
  for (let i = lastWaterIndex + 1; i < styleLayers.length; i++) {
    const l = styleLayers[i];
    if ((l.type === 'line' || l.type === 'symbol') &&
        (l.id.includes('admin') || l.id.includes('border') || l.id.includes('boundar') || l.id.includes('country'))) {
      firstAdminId = l.id;
      break;
    }
  }
  firstAdminId = firstAdminId || firstSymbolId;
  let firstSymbolFont = ['Open Sans Regular'];
  for (let i = 0; i < styleLayers.length; i++) {
    if (styleLayers[i].type === 'symbol') {
      const font = (styleLayers[i] as any).layout?.['text-font'];
      if (font && Array.isArray(font) && font.length > 0 && typeof font[0] === 'string') {
         firstSymbolFont = font;
         break;
      }
    }
  }

  const fallbackFont = settings.replaceGothamFont !== false ? ['Gotham Condensed Bold', ...firstSymbolFont] : firstSymbolFont;

  return { firstSymbolId, firstAdminId, fallbackFont, styleLayers };
};

export const cleanupDeletedDynamicLayers = (map: maplibregl.Map, layers: any[], styleLayers: any[]) => {
  const dynamicLayers = styleLayers.filter(l => l.id.startsWith('dynamic-layer-') || l.id.startsWith('dynamic-line-'));
  const allSources = Object.keys(map.getStyle()?.sources || {});
  const dynamicSources = allSources.filter(s => s.startsWith('dynamic-source-'));

  const isLayerActive = (idSuffix: string) => {
    return layers.some(l => l.id === idSuffix || idSuffix.startsWith(`${l.id}-`));
  };

  dynamicLayers.forEach(layer => {
    let suffix = '';
    if (layer.id.startsWith('dynamic-layer-')) suffix = layer.id.replace('dynamic-layer-', '');
    else if (layer.id.startsWith('dynamic-line-')) suffix = layer.id.replace('dynamic-line-', '');
    
    if (suffix && !isLayerActive(suffix)) {
      if (map.getLayer(layer.id)) map.removeLayer(layer.id);
    }
  });

  dynamicSources.forEach(sourceId => {
    const suffix = sourceId.replace('dynamic-source-', '');
    if (suffix && !isLayerActive(suffix)) {
      // Must remove any layers referencing this source before removing the source itself
      const layersUsingSource = styleLayers.filter(l => (l as any).source === sourceId);
      layersUsingSource.forEach(l => {
        if (map.getLayer(l.id)) map.removeLayer(l.id);
      });
      if (map.getSource(sourceId)) {
        map.removeSource(sourceId);
      }
    }
  });
};
