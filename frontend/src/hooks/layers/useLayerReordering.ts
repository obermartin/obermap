import { useEffect } from 'react';
import type { BaseLayerVisibilityProps } from './types';

export interface LayerReorderingProps extends BaseLayerVisibilityProps {
  weatherForecastLayerIdsRef: React.MutableRefObject<string[]>;
}

export const useLayerReordering = (props: LayerReorderingProps) => {
  const { map, mapLoaded, mapStyleLoaded, mapStyleTick, layers, firstAdminId, weatherForecastLayerIdsRef } = props;

  useEffect(() => {
    if (!map || !mapLoaded || !mapStyleLoaded || !(map as any)._loaded || !(map as any).style || !(map as any).style._loaded) return;

    for (let i = layers.length - 1; i >= 0; i--) {
      const layer = layers[i];
      const idsToMoveAdmin: string[] = [];
      const idsToMoveTop: string[] = [];
      
      if (layer.type === 'weather_forecast') {
        idsToMoveAdmin.push(...weatherForecastLayerIdsRef.current);
      } else if (layer.type === 'wildfires') {
        idsToMoveAdmin.push(`dynamic-layer-${layer.id}-effis`);
        idsToMoveAdmin.push('active-wildfire-cems-vt-extent');
        idsToMoveAdmin.push('active-wildfire-cems-vt-polygons');
        idsToMoveAdmin.push('active-wildfire-cems-vt-lines');
        idsToMoveAdmin.push('active-wildfire-cems-vt-points');
      } else if (layer.id === 'floods') {
        idsToMoveAdmin.push(`dynamic-layer-${layer.id}`);
        if (map.getLayer(`dynamic-line-${layer.id}`)) {
          idsToMoveAdmin.push(`dynamic-line-${layer.id}`);
        }
        idsToMoveAdmin.push('active-flood-cems-vt-extent');
        idsToMoveAdmin.push('active-flood-cems-vt-polygons');
        idsToMoveAdmin.push('active-flood-cems-vt-lines');
        idsToMoveAdmin.push('active-flood-cems-vt-points');
      } else if (layer.type === 'gdacs_earthquakes' || layer.type === 'cems_rapid_mapping') {
        idsToMoveAdmin.push('selected-earthquake-shakemap-fill');
        idsToMoveAdmin.push('selected-earthquake-shakemap-line');
        idsToMoveAdmin.push('selected-usgs-dyfi-10km-fill');
        idsToMoveAdmin.push('selected-usgs-dyfi-1km-fill');
        idsToMoveAdmin.push('selected-usgs-landslide-raster');
        idsToMoveAdmin.push('selected-usgs-liquefaction-raster');
        idsToMoveAdmin.push('selected-cems-vt-extent');
        idsToMoveAdmin.push('selected-cems-vt-polygons');
        idsToMoveAdmin.push('selected-cems-vt-lines');
        idsToMoveAdmin.push('selected-cems-vt-points');
        idsToMoveTop.push(`dynamic-layer-${layer.id}`);
        if (map.getLayer(`dynamic-layer-${layer.id}-label`)) {
          idsToMoveTop.push(`dynamic-layer-${layer.id}-label`);
        }
      } else if (layer.type === 'gdacs_volcanoes') {
        idsToMoveAdmin.push('selected-volcano-polygon-fill');
        idsToMoveAdmin.push('selected-volcano-polygon-line');
        idsToMoveTop.push(`dynamic-layer-${layer.id}`);
      } else {
        idsToMoveAdmin.push(`dynamic-layer-${layer.id}`);
        if (map.getLayer(`dynamic-line-${layer.id}`)) {
          idsToMoveAdmin.push(`dynamic-line-${layer.id}`);
        }
      }
      
      idsToMoveAdmin.forEach(id => {
        if (map.getLayer(id)) {
          try {
            const targetBeforeId = (firstAdminId && map.getLayer(firstAdminId)) 
              ? firstAdminId 
              : (map.getLayer('custom-polygons') ? 'custom-polygons' : undefined);
            if (targetBeforeId) {
              if (targetBeforeId !== id) {
                map.moveLayer(id, targetBeforeId);
              }
            } else {
              map.moveLayer(id);
            }
          } catch (e) {}
        }
      });
      idsToMoveTop.forEach(id => {
        if (map.getLayer(id)) {
          try {
            map.moveLayer(id);
          } catch (e) {}
        }
      });
    }
  }, [map, mapLoaded, mapStyleLoaded, mapStyleTick, layers, firstAdminId, weatherForecastLayerIdsRef.current]);
};
