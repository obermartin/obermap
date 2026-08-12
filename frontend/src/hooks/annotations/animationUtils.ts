import * as turf from '@turf/turf';
import maplibregl from 'maplibre-gl';
import { createCirclePolygon, createArrowFeatures } from '../../utils/mapUtils';
import type { Annotation } from '../../types';

export const animateLineDraw = (
  ann: Annotation,
  currentFeatures: GeoJSON.Feature[],
  baseFeatures: GeoJSON.Feature[],
  cachedTurfData: Record<string, any>,
  annProgress: number
) => {
  if (!ann.coordinates) return;
  
  const featureIndices = currentFeatures
    .map((f: any, i: number) => (f.id === ann.id || f.properties?.id === ann.id) ? i : -1)
    .filter((i: number) => i !== -1);

  featureIndices.forEach((idx: number) => {
    const f = currentFeatures[idx];
    const baseF = baseFeatures[idx];

    if (f.geometry.type === 'LineString' && baseF.geometry.type === 'LineString') {
      if (annProgress === 0) {
        f.geometry.coordinates = [];
      } else if (annProgress < 1) {
        const baseCoords = baseF.geometry.coordinates;
        if (baseCoords.length >= 2) {
          if (!cachedTurfData[`${f.id}-line`]) {
            const line = turf.lineString(baseCoords as any);
            cachedTurfData[`${f.id}-line`] = {
              line,
              dist: turf.length(line, { units: 'kilometers' })
            };
          }
          const cache = cachedTurfData[`${f.id}-line`];
          const targetDist = cache.dist * annProgress;
          if (targetDist > 0) {
            const sliced = turf.lineSliceAlong(cache.line, 0, targetDist, { units: 'kilometers' });
            f.geometry.coordinates = sliced.geometry.coordinates;
          } else {
            f.geometry.coordinates = [];
          }
        } else {
          f.geometry.coordinates = [];
        }
      } else {
        f.geometry.coordinates = baseF.geometry.coordinates;
      }
    } else if (f.geometry.type === 'MultiLineString' && baseF.geometry.type === 'MultiLineString') {
      if (annProgress === 0) {
        f.geometry.coordinates = [];
      } else if (annProgress < 1) {
        const baseCoords = baseF.geometry.coordinates as [number, number][][];
        const totalSegments = baseCoords.length;
        const targetSegments = Math.max(1, Math.floor(totalSegments * annProgress));
        f.geometry.coordinates = baseCoords.slice(0, targetSegments);
      } else {
        f.geometry.coordinates = baseF.geometry.coordinates;
      }
    }
  });
};

export const animateArrow = (
  ann: Annotation,
  currentFeatures: GeoJSON.Feature[],
  annProgress: number
) => {
  if (!ann.coordinates || ann.coordinates.length !== 2) return;

  const p1 = ann.coordinates[0];
  const p2 = ann.coordinates[1];
  const shaftIdx = currentFeatures.findIndex((f: any) => f.properties?.id === ann.id && f.properties?._type === 'LineString');
  const headIdx = currentFeatures.findIndex((f: any) => f.properties?.id === ann.id && f.properties?._type === 'ArrowHead');
  
  if (annProgress === 0) {
    if (shaftIdx !== -1) (currentFeatures[shaftIdx].geometry as any).coordinates = [];
    if (headIdx !== -1) (currentFeatures[headIdx].geometry as any).coordinates = [];
  } else {
    const pCurr = [
      p1[0] + (p2[0] - p1[0]) * annProgress,
      p1[1] + (p2[1] - p1[1]) * annProgress
    ];
    const arrowFeats = createArrowFeatures(p1, pCurr as [number, number], ann.color || '#ffffff', ann.id);
    
    if (arrowFeats) {
      if (shaftIdx !== -1) currentFeatures[shaftIdx].geometry = arrowFeats.shaft.geometry;
      if (headIdx !== -1) {
        currentFeatures[headIdx].geometry = arrowFeats.head.geometry;
        currentFeatures[headIdx].properties!.bearing = arrowFeats.head.properties?.bearing;
      }
    }
  }
};

export const animateCircle = (
  ann: Annotation,
  currentFeatures: GeoJSON.Feature[],
  cachedTurfData: Record<string, any>,
  annProgress: number
) => {
  if (!ann.radius || !ann.coordinates) return;

  const featureIdx = currentFeatures.findIndex((f: any) => f.id === ann.id || f.properties?.id === ann.id);
  if (featureIdx !== -1 && currentFeatures[featureIdx].geometry.type === 'Polygon') {
    if (annProgress === 0) {
      currentFeatures[featureIdx].geometry.coordinates = [];
    } else if (annProgress < 1) {
      if (!cachedTurfData[`${ann.id}-full-poly`]) {
        const center = turf.center(turf.polygon(ann.coordinates)).geometry.coordinates as [number, number];
        cachedTurfData[`${ann.id}-center`] = center;
        cachedTurfData[`${ann.id}-full-poly`] = createCirclePolygon(center, ann.radius);
      }
      const center = cachedTurfData[`${ann.id}-center`];
      const fullPoly = cachedTurfData[`${ann.id}-full-poly`];
      
      if (fullPoly && fullPoly.geometry.coordinates[0]) {
        const scaledCoords = fullPoly.geometry.coordinates[0].map((coord: [number, number]) => [
          center[0] + (coord[0] - center[0]) * annProgress,
          center[1] + (coord[1] - center[1]) * annProgress
        ]);
        currentFeatures[featureIdx].geometry.coordinates = [scaledCoords];
      }
    } else {
      currentFeatures[featureIdx].geometry.coordinates = JSON.parse(JSON.stringify(ann.coordinates));
    }
  }
};

export const animateMarkers = (
  ann: Annotation,
  markersRef: React.MutableRefObject<{ [id: string]: maplibregl.Marker }>,
  currentFeatures: GeoJSON.Feature[],
  annProgress: number,
  labelAnnProgress: number,
  isRevealed: boolean
) => {
  const marker = markersRef.current[ann.id];
  if (marker) {
    const el = marker.getElement();
    let p = annProgress;
    if (ann.type === 'label' || ann.type === 'highlight' || ann.type === 'icon') {
      p = labelAnnProgress;
    }
    
    if (ann.type === 'highlight' || ann.type === 'label') {
      el.style.transition = 'none';
      const isVisible = isRevealed && p > 0;
      
      el.style.opacity = isVisible ? '1' : '0';
      el.style.display = isVisible ? 'block' : 'none';
      el.style.pointerEvents = isVisible ? 'auto' : 'none';
      
      const isLabel = el.querySelector('.label-marker') !== null;
      const plateSel = isLabel ? '.backplate.primary' : '.custom-highlight-plate, .custom-country-plate';
      const textSel = isLabel ? '.text' : '.custom-highlight-text, .custom-country-text';
      
      const plate = el.querySelector(plateSel) as HTMLElement;
      const text = el.querySelector(textSel) as HTMLElement;
      const pointer = el.querySelector(isLabel ? '.pointer' : '.custom-marker-pointer') as HTMLElement;
      
      if (pointer) {
        pointer.style.opacity = isVisible ? '1' : '0';
      }
      
      if (plate && text) {
        if (p <= 0.5) {
          const plateP = p * 2;
          if (isLabel) {
            plate.style.clipPath = `inset(${100 - plateP * 100}% 0 0 0)`;
          } else {
            plate.style.clipPath = `inset(0 ${100 - plateP * 100}% 0 0)`;
          }
          text.style.transform = `translateY(100%)`;
        } else {
          const textP = (p - 0.5) * 2;
          plate.style.clipPath = `inset(0 0% 0 0)`;
          text.style.transform = `translateY(${(1 - textP) * 100}%)`;
        }
      }
    } else {
      el.style.transition = 'none';
      el.style.opacity = p.toString();
      el.style.display = p > 0 ? 'flex' : 'none';
      el.style.pointerEvents = p > 0.5 ? 'auto' : 'none';
    }
  }
  
  if (ann.type === 'circle') {
    const centerMarker = markersRef.current[`${ann.id}-circle-center`];
    const radiusMarker = markersRef.current[`${ann.id}-circle-radius`];
    const isVisible = isRevealed && annProgress > 0;
    
    if (centerMarker) {
      centerMarker.getElement().style.transition = 'none';
      centerMarker.getElement().style.opacity = isVisible ? '1' : '0';
      centerMarker.getElement().style.display = isVisible ? 'flex' : 'none';
      centerMarker.getElement().style.pointerEvents = isVisible ? 'auto' : 'none';
    }
    if (radiusMarker) {
      radiusMarker.getElement().style.transition = 'none';
      radiusMarker.getElement().style.opacity = isVisible ? '1' : '0';
      radiusMarker.getElement().style.display = isVisible ? 'flex' : 'none';
      radiusMarker.getElement().style.pointerEvents = isVisible ? 'auto' : 'none';
      
      const featureIdx = currentFeatures.findIndex((f: any) => f.id === ann.id || f.properties?.id === ann.id);
      if (featureIdx !== -1 && currentFeatures[featureIdx].geometry.type === 'Polygon') {
        const polyCoords = currentFeatures[featureIdx].geometry.coordinates;
        if (polyCoords && polyCoords[0] && polyCoords[0][0]) {
          radiusMarker.setLngLat(polyCoords[0][0] as [number, number]);
        }
      }
    }
  }
  
  if (ann.type === 'measure' && ann.coordinates) {
    ann.coordinates.forEach((_: any, i: number) => {
      const measureMarker = markersRef.current[`${ann.id}-measure-${i}`];
      if (measureMarker) {
        const threshold = ann.coordinates!.length > 1 ? i / (ann.coordinates!.length - 1) : 0;
        const visible = isRevealed && annProgress > 0 && annProgress >= threshold;
        measureMarker.getElement().style.transition = 'none';
        measureMarker.getElement().style.opacity = visible ? '1' : '0';
        measureMarker.getElement().style.display = visible ? 'flex' : 'none';
        measureMarker.getElement().style.pointerEvents = visible ? 'auto' : 'none';
      }
    });
  }
  
  if (ann.type === 'route' && ann.coordinates) {
    ann.coordinates.forEach((_: any, i: number) => {
      const routeMarker = markersRef.current[`${ann.id}-route-${i}`];
      if (routeMarker) {
        const threshold = ann.coordinates!.length > 1 ? i / (ann.coordinates!.length - 1) : 0;
        const visible = isRevealed && annProgress > 0 && annProgress >= threshold;
        routeMarker.getElement().style.transition = 'none';
        routeMarker.getElement().style.opacity = visible ? '1' : '0';
        routeMarker.getElement().style.display = visible ? 'flex' : 'none';
        routeMarker.getElement().style.pointerEvents = visible ? 'auto' : 'none';
      }
    });
  }
};
