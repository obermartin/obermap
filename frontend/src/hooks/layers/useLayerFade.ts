import { useRef, useCallback } from 'react';

export const useLayerFade = (map: maplibregl.Map | null, defaultDuration: number = 1000) => {
  const layerFadeTimeoutsRef = useRef<Record<string, any>>({});

  const setLayerFade = useCallback((
    mapLibreLayerId: string, 
    layerType: string, 
    isVisible: boolean, 
    maxOpacity: any = 1, 
    layerSidebarVisible: boolean = true
  ) => {
    if (!map || !map.getLayer(mapLibreLayerId)) return;
    
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
    
    const opacityProp = `${layerType}-opacity`;
    const currentVisibility = map.getLayoutProperty(mapLibreLayerId, 'visibility');
    const transition = { duration: defaultDuration, delay: 0 };
    
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
      }, defaultDuration);
    }
  }, [map, defaultDuration]);

  return { setLayerFade, layerFadeTimeoutsRef };
};
