import { useEffect } from 'react';
import type { BaseLayerVisibilityProps } from './types';
import { getEffectiveLayerDates } from '../../utils/layerUtils';

export interface RasterVisibilityProps extends BaseLayerVisibilityProps {
  setLayerFade: (id: string, type: string, isVisible: boolean, maxOpacity?: number, sidebarVisible?: boolean) => void;
}

export const useRasterVisibility = (props: RasterVisibilityProps) => {
  const {
    map, mapLoaded, mapStyleLoaded, mapStyleTick, settings, layers, firstAdminId, setLayerFade
  } = props;

  useEffect(() => {
    if (!map || !mapLoaded || !mapStyleLoaded || !(map as any)._loaded || !(map as any).style || !(map as any).style._loaded) return;

    const rasterLayers = layers.filter(l => l.type === 'raster' || l.type === 'satellite' || l.type === 'nighttime');
    
    rasterLayers.forEach((layer) => {
      const sourceId = `dynamic-source-${layer.id}`;
      const layerId = `dynamic-layer-${layer.id}`;

      if (layer.type === 'raster' && layer._isDirty) {
        if (map.getSource(sourceId)) {
          if (map.getLayer(layerId)) map.removeLayer(layerId);
          if (map.getLayer(`dynamic-line-${layer.id}`)) map.removeLayer(`dynamic-line-${layer.id}`);
          map.removeSource(sourceId);
        }
        layer._isDirty = false;
        const originalLayer = settings.layers.find(l => l.id === layer.id);
        if (originalLayer) originalLayer._isDirty = false;
      }

      if (!map.getSource(sourceId)) {
        if (layer.type === 'nighttime') {
          map.addSource(sourceId, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
        } else if (layer.type === 'raster' && layer.url) {
          let processedUrl = layer.url;
          const { effectiveStartDate: startVal, effectiveEndDate: endVal } = getEffectiveLayerDates(layer, settings);
          
          processedUrl = processedUrl.replace(/%7Bdate-today%7D/g, '{date-end}').replace(/%7Bdate-7d%7D/g, '{date-start}');
          processedUrl = processedUrl.replace(/{date-today}/g, '{date-end}').replace(/{date-7d}/g, '{date-start}');
          processedUrl = processedUrl.replace(/{date-start}/g, startVal).replace(/{date-end}/g, endVal);
          
          const sourceConfig: any = { type: 'raster', tiles: [processedUrl], tileSize: 256 };
          if (layer.maxZoom !== undefined) {
            sourceConfig.maxzoom = layer.maxZoom;
          }
          map.addSource(sourceId, sourceConfig);
        } else if (layer.type === 'satellite') {
          map.addSource(sourceId, { 
            type: 'raster', 
            tiles: [
              'https://ecn.t0.tiles.virtualearth.net/tiles/a{quadkey}.jpeg?g=129',
              'https://ecn.t1.tiles.virtualearth.net/tiles/a{quadkey}.jpeg?g=129',
              'https://ecn.t2.tiles.virtualearth.net/tiles/a{quadkey}.jpeg?g=129',
              'https://ecn.t3.tiles.virtualearth.net/tiles/a{quadkey}.jpeg?g=129'
            ], 
            tileSize: 256, 
            maxzoom: 19 
          });
        }
      }

      if (!map.getLayer(layerId) && map.getSource(sourceId)) {
        if (layer.type === 'nighttime') {
          map.addLayer({
            id: layerId,
            type: 'fill',
            source: sourceId,
            layout: { visibility: layer.visible ? 'visible' : 'none' },
            paint: {
              'fill-color': '#000000',
              'fill-opacity': layer.opacity ?? 0.5
            }
          }, firstAdminId);
        } else if (layer.type === 'raster' || layer.type === 'satellite') {
          const bMin = layer.brightness !== undefined && layer.brightness > 0 ? layer.brightness : 0;
          const bMax = layer.brightness !== undefined && layer.brightness < 0 ? 1 + layer.brightness : 1;
          const targetBeforeId = (firstAdminId && map.getLayer(firstAdminId)) ? firstAdminId : undefined;
          const isEffectiveVis = layer._effectiveOpacityVisible ?? true;
          const initialOpacity = isEffectiveVis ? (layer.opacity ?? 1.0) : 0;
          map.addLayer({
            id: layerId,
            type: 'raster',
            source: sourceId,
            layout: { visibility: (layer.visible && isEffectiveVis) ? 'visible' : 'none' },
            paint: { 
              'raster-opacity': initialOpacity,
              'raster-contrast': layer.contrast ?? 0,
              'raster-saturation': layer.saturation ?? 0,
              'raster-hue-rotate': layer.hue ?? 0,
              'raster-brightness-min': bMin,
              'raster-brightness-max': bMax
            }
          }, targetBeforeId);
        }
      }

      if (map.getLayer(layerId)) {
        map.setLayoutProperty(layerId, 'visibility', layer.visible ? 'visible' : 'none');
        if (layer.type === 'nighttime') {
          setLayerFade(layerId, 'fill', layer._effectiveOpacityVisible ?? true, layer.opacity ?? 0.5, layer.visible);
        } else if (layer.type === 'raster' || layer.type === 'satellite') {
          setLayerFade(layerId, 'raster', layer._effectiveOpacityVisible ?? true, layer.opacity ?? 1.0, layer.visible);
          const bMin = layer.brightness !== undefined && layer.brightness > 0 ? layer.brightness : 0;
          const bMax = layer.brightness !== undefined && layer.brightness < 0 ? 1 + layer.brightness : 1;
          map.setPaintProperty(layerId, 'raster-contrast', layer.contrast ?? 0);
          map.setPaintProperty(layerId, 'raster-saturation', layer.saturation ?? 0);
          map.setPaintProperty(layerId, 'raster-hue-rotate', layer.hue ?? 0);
          map.setPaintProperty(layerId, 'raster-brightness-min', bMin);
          map.setPaintProperty(layerId, 'raster-brightness-max', bMax);
        }
      }
    });
  }, [map, mapLoaded, mapStyleLoaded, mapStyleTick, settings, layers, firstAdminId, setLayerFade]);
};
