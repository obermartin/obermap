import * as turf from '@turf/turf';
import { decodePolyline } from './mapUtils';
import type { RouteMode } from '../types';

export const fetchRouteSegment = async (
  p1: [number, number],
  p2: [number, number],
  rMode: RouteMode,
  googleMapsToken?: string
): Promise<{ coords: [number, number][], leg: { distance: number, duration: number } }> => {
  if (rMode === 'train') {
    if (googleMapsToken) {
      try {
        const res = await fetch(`./api.php?action=google_directions&origin=${p1[1]},${p1[0]}&destination=${p2[1]},${p2[0]}&key=${googleMapsToken}`);
        const data = await res.json();
        if (data.routes && data.routes[0]) {
          const route = data.routes[0];
          const leg = route.legs[0];
          let points: [number, number][] = [];
          if (leg.steps && leg.steps.length > 0) {
            const transitSteps = leg.steps.filter((s: any) => s.travel_mode === 'TRANSIT');
            if (transitSteps.length > 0) {
              transitSteps.forEach((step: any) => {
                points.push(...decodePolyline(step.polyline.points));
              });
            } else {
              points = decodePolyline(route.overview_polyline.points);
            }
          } else {
            points = decodePolyline(route.overview_polyline.points);
          }
          return { coords: points, leg: { distance: leg.distance.value, duration: leg.duration.value } };
        }
      } catch (err) {
        console.error('Google Transit API error:', err);
      }
    }
    const distKm = turf.distance(turf.point(p1), turf.point(p2), { units: 'kilometers' });
    return { coords: [p2], leg: { distance: distKm * 1000, duration: (distKm / 100) * 3600 } };
  } else {
    const endpoint = rMode === 'walking' 
      ? 'https://routing.openstreetmap.de/routed-foot/route/v1/driving' 
      : 'https://router.project-osrm.org/route/v1/driving';
    try {
      const res = await fetch(`${endpoint}/${p1[0]},${p1[1]};${p2[0]},${p2[1]}?overview=full&geometries=geojson`);
      const data = await res.json();
      if (data.routes && data.routes[0]) {
        const route = data.routes[0];
        return { coords: route.geometry.coordinates.slice(1), leg: { distance: route.distance, duration: route.duration } };
      }
    } catch (err) {
      console.error('OSRM API error:', err);
    }
    const distKm = turf.distance(turf.point(p1), turf.point(p2), { units: 'kilometers' });
    return { coords: [p2], leg: { distance: distKm * 1000, duration: (distKm / (rMode === 'walking' ? 5 : 60)) * 3600 } };
  }
};

export const fetchFullRoute = async (
  coords: [number, number][],
  rMode: RouteMode,
  googleMapsToken?: string
): Promise<{ fullCoords: [number, number][], fullLegs: { distance: number, duration: number }[] }> => {
  const fullCoords = [coords[0]];
  const fullLegs: { distance: number, duration: number }[] = [];

  const segmentPromises = [];
  for (let i = 1; i < coords.length; i++) {
    segmentPromises.push(fetchRouteSegment(coords[i - 1], coords[i], rMode, googleMapsToken));
  }
  
  const segments = await Promise.all(segmentPromises);
  
  for (const seg of segments) {
    fullCoords.push(...seg.coords);
    fullLegs.push(seg.leg);
  }

  return { fullCoords, fullLegs };
};
