import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import mlcontour from 'maplibre-contour';
import type { AppSettings, MapLayer } from '../../types';

let contourSourceInitialized = false;
let demSource: any = null;

export const useContourLayer = ({
  map,
  mapLoaded,
  mapStyleLoaded,
  mapStyleTick,
  settings,
}: {
  map: maplibregl.Map | null;
  mapLoaded: boolean;
  mapStyleLoaded?: boolean;
  mapStyleTick?: number;
  settings: AppSettings;
}) => {
  const sourceId = 'contour-source';
  
  const contourLayers = settings.layers.filter((l: MapLayer) => l.type === 'contour_lines' && l.visible);
  
  // Track active layer IDs to remove ones that are no longer visible
  const activeLayersRef = useRef<string[]>([]);

  useEffect(() => {
    if (!map || !mapLoaded || !mapStyleLoaded || !(map as any)._loaded || !(map as any).style || !(map as any).style._loaded) return;

    if (!contourSourceInitialized) {
      demSource = new mlcontour.DemSource({
        url: "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png",
        encoding: "terrarium",
        maxzoom: 13
      });
      demSource.setupMaplibre(maplibregl);
      contourSourceInitialized = true;
    }

    if (contourLayers.length > 0) {
      if (!map.getSource(sourceId)) {
        map.addSource(sourceId, {
          type: "vector",
          tiles: [
            demSource.contourProtocolUrl({
              thresholds: {
                1: [1000, 5000],
                4: [500, 2500],
                7: [200, 1000],
                9: [100, 500],
                11: [50, 250],
                14: [10, 50]
              },
              elevationKey: "ele",
              levelKey: "level",
              contourLayer: "contours"
            })
          ],
          maxzoom: 15
        });
      }

      contourLayers.forEach(layer => {
        const layerId = `dynamic-layer-${layer.id}`;
        
        if (!map.getLayer(layerId)) {
          map.addLayer({
            id: layerId,
            type: "line",
            source: sourceId,
            "source-layer": "contours",
            paint: {
              "line-color": layer.contourColor || "#ffffff",
              "line-width": [
                "match",
                ["get", "level"],
                1, layer.contourWidth || 1,
                2, (layer.contourWidth || 1) * 2,
                layer.contourWidth || 1
              ],
              "line-opacity": layer.opacity !== undefined ? layer.opacity : 0.5
            }
          });
          activeLayersRef.current.push(layerId);
        } else {
          map.setPaintProperty(layerId, "line-color", layer.contourColor || "#ffffff");
          map.setPaintProperty(layerId, "line-width", [
            "match",
            ["get", "level"],
            1, layer.contourWidth || 1,
            2, (layer.contourWidth || 1) * 2,
            layer.contourWidth || 1
          ]);
          map.setPaintProperty(layerId, "line-opacity", layer.opacity !== undefined ? layer.opacity : 0.5);
        }
      });
    }

    // Remove layers that are no longer in contourLayers
    const currentLayerIds = contourLayers.map(l => `dynamic-layer-${l.id}`);
    activeLayersRef.current.forEach(id => {
      if (!currentLayerIds.includes(id)) {
        if (map.getLayer(id)) map.removeLayer(id);
      }
    });
    activeLayersRef.current = currentLayerIds;

    if (contourLayers.length === 0 && map.getSource(sourceId)) {
      map.removeSource(sourceId);
    }
  }, [map, mapLoaded, mapStyleLoaded, mapStyleTick, settings.layers]);
};
