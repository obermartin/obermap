import * as turf from '@turf/turf';

export const createCirclePolygon = (center: [number, number], radiusKm: number, points: number = 64) => {
  if (!center || radiusKm <= 0) return null;
  return turf.circle(center, radiusKm, { steps: points, units: 'kilometers' });
};

export const calculateDistance = (coords: [number, number][]) => {
  if (coords.length < 2) return 0;
  const line = turf.lineString(coords);
  return turf.length(line, { units: 'kilometers' });
};

// Simplified freehand using turf simplify
export const simplifyLine = (coords: [number, number][], tolerance: number = 0.001) => {
  if (coords.length < 2) return coords;
  const line = turf.lineString(coords);
  const simplified = turf.simplify(line, { tolerance, highQuality: false });
  return simplified.geometry.coordinates as [number, number][];
};
