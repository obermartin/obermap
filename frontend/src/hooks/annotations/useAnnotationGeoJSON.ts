import { useEffect } from 'react';
import maplibregl from 'maplibre-gl';
import type { Annotation } from '../../types';
import { calculateDistance, createArrowFeatures } from '../../utils/mapUtils';

interface UseAnnotationGeoJSONProps {
  map: maplibregl.Map | null;
  mapLoaded: boolean;
  mapStyleLoaded: boolean;
  mapStyleTick: number;
  annotations: Annotation[];
  baseFeaturesRef: React.MutableRefObject<GeoJSON.Feature[]>;
  activeFeaturesRef: React.MutableRefObject<GeoJSON.Feature[]>;
  cachedTurfDataRef: React.MutableRefObject<{ [id: string]: any }>;
}

export const useAnnotationGeoJSON = ({
  map,
  mapLoaded,
  mapStyleLoaded,
  mapStyleTick,
  annotations,
  baseFeaturesRef,
  activeFeaturesRef,
  cachedTurfDataRef
}: UseAnnotationGeoJSONProps) => {
  useEffect(() => {
    if (!map || !mapLoaded || !mapStyleLoaded) return;
    const source = map.getSource('custom-annotations') as maplibregl.GeoJSONSource;
    if (!source) return;
    
    cachedTurfDataRef.current = {};
    
    const features: GeoJSON.Feature[] = annotations.reduce((acc: GeoJSON.Feature[], ann) => {
      if (ann.type === 'paint') {
        acc.push({
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: ann.coordinates },
          properties: { color: ann.color, id: ann.id, type: ann.type, strokeType: ann.strokeType || 'solid' }
        });
      } else if (ann.type === 'measure') {
        const dist = calculateDistance(ann.coordinates);
        acc.push({
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: ann.coordinates },
          properties: { color: ann.color, id: ann.id, type: ann.type, textLabel: `${dist.toFixed(2)} km`, strokeType: ann.strokeType || 'solid' }
        });
      } else if (ann.type === 'circle') {
        acc.push({
          type: 'Feature',
          geometry: { type: 'Polygon', coordinates: ann.coordinates },
          properties: { color: ann.color, id: ann.id, type: ann.type, textLabel: `${ann.radius?.toFixed(2)} km`, strokeType: ann.strokeType || 'solid', fillOpacity: ann.fillOpacity ?? 0.5 }
        });
      } else if (ann.type === 'polygon') {
        acc.push({
          type: 'Feature',
          geometry: { type: 'Polygon', coordinates: ann.coordinates },
          properties: { color: ann.color, id: ann.id, type: ann.type, strokeType: ann.strokeType || 'solid', fillOpacity: ann.fillOpacity ?? 0.5 }
        });
      } else if (ann.type === 'arrow' && ann.coordinates && ann.coordinates.length === 2) {
        const arrowFeats = createArrowFeatures(ann.coordinates[0], ann.coordinates[1], ann.color || '#ffffff', ann.id);
        if (arrowFeats) {
          arrowFeats.shaft.properties!.strokeType = ann.strokeType || 'solid';
          arrowFeats.head.properties!.strokeType = 'solid';
          arrowFeats.shaft.properties!.type = 'arrow';
          arrowFeats.head.properties!.type = 'arrow';
          acc.push(arrowFeats.shaft, arrowFeats.head);
        }
      } else if (ann.type === 'highlight' && ann.polygonGeometry) {
        if (ann.polygonGeometry.type === 'Polygon' || ann.polygonGeometry.type === 'MultiPolygon') {
          acc.push({
            type: 'Feature',
            geometry: ann.polygonGeometry,
            properties: { color: ann.color, id: ann.id, type: 'polygon', strokeType: ann.strokeType || 'solid', fillOpacity: ann.fillOpacity ?? 0.5 }
          });
        }
      } else if (ann.type === 'route' && ann.routeGeometry) {
        acc.push({
          type: 'Feature',
          geometry: ann.routeGeometry,
          properties: { color: ann.color, id: ann.id, type: ann.type, strokeType: ann.strokeType || 'solid' }
        });
      }

      if (ann.type === 'highlight' && ann.text && ann.coordinates) {
        acc.push({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: ann.coordinates },
          properties: {
            id: `${ann.id}-collision`,
            type: 'invisible-collision-box',
            text: ann.text
          }
        });
      }

      return acc;
    }, []).map(f => {
      const targetId = f.id ?? (f.properties ? f.properties.id : undefined);
      if (targetId && f.properties) {
        f.id = targetId;
      }
      return f;
    });

    baseFeaturesRef.current = features;
    activeFeaturesRef.current = JSON.parse(JSON.stringify(features));
    // Debug removed

  }, [annotations, mapLoaded, mapStyleLoaded, mapStyleTick, map, baseFeaturesRef, activeFeaturesRef, cachedTurfDataRef]);
};
