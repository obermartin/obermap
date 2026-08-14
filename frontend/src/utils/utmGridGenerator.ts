import proj4 from 'proj4';
import * as mgrs from 'mgrs';

export interface UtmGridFeatureCollection {
  type: 'FeatureCollection';
  features: any[];
}

export function generateUtmGrid(
  bounds: [number, number, number, number],
  zoom: number
): UtmGridFeatureCollection {
  const features: any[] = [];
  const [minLonRaw, minLatRaw, maxLonRaw, maxLatRaw] = bounds;

  // Clamp bounds to valid UTM ranges
  const minLat = Math.max(-80, minLatRaw);
  const maxLat = Math.min(84, maxLatRaw);
  let minLon = minLonRaw;
  let maxLon = maxLonRaw;
  
  if (minLat > 84 || maxLat < -80) {
    return { type: 'FeatureCollection', features } as UtmGridFeatureCollection;
  }

  // Determine step size based on zoom level
  let stepSize = 100000; // 100km by default
  let accuracy = 1; // 10km MGRS string for labels? Actually 100km is 0, 10km is 1.
  if (zoom < 6) {
    // Zoom < 6: just draw the 6x8 zones
    return generateZoneGrid(minLon, minLat, maxLon, maxLat) as UtmGridFeatureCollection;
  } else if (zoom < 10) {
    stepSize = 100000; // 100km
    accuracy = 1; // Used for mgrs.forward, wait mgrs.forward(pt, 1) gives 10km? accuracy=0 gives 100km
  } else if (zoom < 13) {
    stepSize = 10000; // 10km
    accuracy = 2; // 1km
  } else if (zoom < 15) {
    stepSize = 1000; // 1km
    accuracy = 3; // 100m
  } else {
    stepSize = 100; // 100m
    accuracy = 4; // 10m
  }

  const startZone = Math.floor((minLon + 180) / 6) + 1;
  const endZone = Math.floor((maxLon + 180) / 6) + 1;

  for (let z = startZone; z <= endZone; z++) {
    const zone = ((z - 1) % 60) + 1;
    const zoneMinLon = (zone - 1) * 6 - 180;
    const zoneMaxLon = zone * 6 - 180;

    const zMinLon = Math.max(minLon, zoneMinLon);
    const zMaxLon = Math.min(maxLon, zoneMaxLon);
    if (zMinLon >= zMaxLon) continue;

    // We process northern and southern hemispheres separately for a zone
    // because UTM projection has different false northings (+south)
    if (minLat < 0) {
      generateForHemisphere(zone, zMinLon, Math.min(0, maxLat), zMinLon, zMaxLon, true, stepSize, accuracy, features);
    }
    if (maxLat > 0) {
      generateForHemisphere(zone, Math.max(0, minLat), maxLat, zMinLon, zMaxLon, false, stepSize, accuracy, features);
    }
  }

  return { type: 'FeatureCollection', features } as UtmGridFeatureCollection;
}

function generateForHemisphere(
  zone: number,
  minLat: number,
  maxLat: number,
  minLon: number,
  maxLon: number,
  isSouth: boolean,
  stepSize: number,
  accuracy: number,
  features: any[]
) {
  const projStr = `+proj=utm +zone=${zone}${isSouth ? ' +south' : ''} +datum=WGS84 +units=m +no_defs`;
  
  // Project the 4 corners
  const corners = [
    proj4('EPSG:4326', projStr, [minLon, minLat]),
    proj4('EPSG:4326', projStr, [maxLon, minLat]),
    proj4('EPSG:4326', projStr, [maxLon, maxLat]),
    proj4('EPSG:4326', projStr, [minLon, maxLat])
  ];

  let minE = Infinity, maxE = -Infinity, minN = Infinity, maxN = -Infinity;
  corners.forEach(c => {
    minE = Math.min(minE, c[0]);
    maxE = Math.max(maxE, c[0]);
    minN = Math.min(minN, c[1]);
    maxN = Math.max(maxN, c[1]);
  });

  // Clamp to some reasonable UTM bounds to avoid projection infinity
  minE = Math.max(100000, minE);
  maxE = Math.min(900000, maxE);
  minN = Math.max(0, minN);
  maxN = Math.min(10000000, maxN);

  const startE = Math.floor(minE / stepSize) * stepSize;
  const startN = Math.floor(minN / stepSize) * stepSize;

  const segmentLength = stepSize / 10; // For curvature

  // Vertical lines (Easting)
  for (let e = startE; e <= maxE; e += stepSize) {
    const coords: [number, number][] = [];
    for (let n = minN; n <= maxN; n += segmentLength) {
      const ll = proj4(projStr, 'EPSG:4326', [e, n]);
      if (ll[0] >= minLon && ll[0] <= maxLon && ll[1] >= minLat && ll[1] <= maxLat) {
        coords.push([ll[0], ll[1]]);
      }
    }
    if (coords.length > 1) {
      features.push({
        type: 'Feature',
        properties: {},
        geometry: { type: 'LineString', coordinates: coords }
      });
    }
  }

  // Horizontal lines (Northing)
  for (let n = startN; n <= maxN; n += stepSize) {
    const coords: [number, number][] = [];
    for (let e = minE; e <= maxE; e += segmentLength) {
      const ll = proj4(projStr, 'EPSG:4326', [e, n]);
      if (ll[0] >= minLon && ll[0] <= maxLon && ll[1] >= minLat && ll[1] <= maxLat) {
        coords.push([ll[0], ll[1]]);
      }
    }
    if (coords.length > 1) {
      features.push({
        type: 'Feature',
        properties: {},
        geometry: { type: 'LineString', coordinates: coords }
      });
    }
  }

  // Generate labels at intersections
  for (let e = startE; e <= maxE; e += stepSize) {
    for (let n = startN; n <= maxN; n += stepSize) {
      const ll = proj4(projStr, 'EPSG:4326', [e, n]);
      if (ll[0] >= minLon && ll[0] <= maxLon && ll[1] >= minLat && ll[1] <= maxLat) {
        try {
          const mgrsStr = mgrs.forward(ll as [number, number], accuracy);
          features.push({
            type: 'Feature',
            properties: { label: mgrsStr },
            geometry: { type: 'Point', coordinates: [ll[0], ll[1]] }
          });
        } catch (err) {
          // Ignore projection errors
        }
      }
    }
  }
}

function generateZoneGrid(minLon: number, minLat: number, maxLon: number, maxLat: number) {
  const features: any[] = [];
  
  // Latitudes C to X (-80 to 84, steps of 8, last is 12)
  const lats = [];
  for (let l = -80; l < 72; l += 8) lats.push(l);
  lats.push(72);
  lats.push(84);

  // Longitudes 1 to 60 (-180 to 180, steps of 6)
  const lons = [];
  for (let l = -180; l <= 180; l += 6) lons.push(l);

  // Vertical lines
  for (const lon of lons) {
    if (lon >= minLon && lon <= maxLon) {
      features.push({
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'LineString',
          coordinates: [[lon, Math.max(-80, minLat)], [lon, Math.min(84, maxLat)]]
        }
      });
    }
  }

  // Horizontal lines
  for (const lat of lats) {
    if (lat >= minLat && lat <= maxLat) {
      features.push({
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'LineString',
          coordinates: [[Math.max(-180, minLon), lat], [Math.min(180, maxLon), lat]]
        }
      });
    }
  }

  // Zone labels
  for (let lonIdx = 0; lonIdx < lons.length - 1; lonIdx++) {
    const centerLon = lons[lonIdx] + 3;
    if (centerLon >= minLon && centerLon <= maxLon) {
      for (let latIdx = 0; latIdx < lats.length - 1; latIdx++) {
        const centerLat = lats[latIdx] + (lats[latIdx+1] - lats[latIdx]) / 2;
        if (centerLat >= minLat && centerLat <= maxLat) {
          try {
            const mgrsStr = mgrs.forward([centerLon, centerLat] as [number, number], 0);
            const zoneLabel = mgrsStr.substring(0, 3); // e.g. "32U"
            features.push({
              type: 'Feature',
              properties: { label: zoneLabel },
              geometry: { type: 'Point', coordinates: [centerLon, centerLat] }
            });
          } catch(e) {}
        }
      }
    }
  }

  return { type: 'FeatureCollection', features } as UtmGridFeatureCollection;
}
