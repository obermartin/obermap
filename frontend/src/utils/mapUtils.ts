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
export const simplifyLine = (coords: [number, number][], tolerance: number = 0.00001) => {
  if (coords.length < 2) return coords;
  const line = turf.lineString(coords);
  const simplified = turf.simplify(line, { tolerance, highQuality: false });
  return simplified.geometry.coordinates as [number, number][];
};

export const transliterateToGerman = (text: string, isRussian: boolean = false): string => {
  if (!text) return text;
  
  const isAllCaps = text === text.toUpperCase() && text !== text.toLowerCase();
  
  const map: Record<string, string> = {
    'А': 'A', 'а': 'a',
    'Б': 'B', 'б': 'b',
    'В': 'W', 'в': 'w',
    'Г': isRussian ? 'G' : 'H', 'г': isRussian ? 'g' : 'h',
    'Ґ': 'G', 'ґ': 'g',
    'Д': 'D', 'д': 'd',
    // 'Е' is handled contextually
    'Є': isAllCaps ? 'JE' : 'Je', 'є': 'je',
    'Ё': isAllCaps ? 'JO' : 'Jo', 'ё': 'jo',
    'Ж': isAllCaps ? 'SCH' : 'Sch', 'ж': 'sch',
    'З': 'S', 'з': 's',
    'И': isRussian ? 'I' : 'Y', 'и': isRussian ? 'i' : 'y',
    'І': 'I', 'і': 'i',
    'Ї': isAllCaps ? 'JI' : 'Ji', 'ї': 'ji',
    'Й': 'J', 'й': 'j',
    'К': 'K', 'к': 'k',
    'Л': 'L', 'л': 'l',
    'М': 'M', 'м': 'm',
    'Н': 'N', 'н': 'n',
    'О': 'O', 'о': 'o',
    'П': 'P', 'п': 'p',
    'Р': 'R', 'р': 'r',
    'С': 'S', 'с': 's',
    'Т': 'T', 'т': 't',
    'У': 'U', 'у': 'u',
    'Ф': 'F', 'ф': 'f',
    'Х': isAllCaps ? 'CH' : 'Ch', 'х': 'ch',
    'Ц': 'Z', 'ц': 'z',
    'Ч': isAllCaps ? 'TSCH' : 'Tsch', 'ч': 'tsch',
    'Ш': isAllCaps ? 'SCH' : 'Sch', 'ш': 'sch',
    'Щ': isAllCaps ? 'SCHTSCH' : 'Schtsch', 'щ': 'schtsch',
    'Ь': '', 'ь': '',
    'Ю': isAllCaps ? 'JU' : 'Ju', 'ю': 'ju',
    'Я': isAllCaps ? 'JA' : 'Ja', 'я': 'ja',
    'Ы': 'Y', 'ы': 'y',
    'Э': 'E', 'э': 'e',
    'Ъ': '', 'ъ': ''
  };

  const vowels = new Set(['А', 'а', 'Е', 'е', 'Є', 'є', 'Ё', 'ё', 'И', 'и', 'І', 'і', 'Ї', 'ї', 'О', 'о', 'У', 'у', 'Ы', 'ы', 'Э', 'э', 'Ю', 'ю', 'Я', 'я']);
  
  let result = '';
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    
    // Contextual rule for 'Е' -> 'Je' in Russian
    if (char === 'Е' || char === 'е') {
      if (isRussian) {
        const isStart = i === 0 || text[i-1] === ' ' || text[i-1] === '-';
        const prevChar = i > 0 ? text[i-1] : '';
        const afterVowelOrSign = prevChar ? (vowels.has(prevChar) || prevChar === 'Ь' || prevChar === 'ь' || prevChar === 'Ъ' || prevChar === 'ъ') : false;
        
        if (isStart || afterVowelOrSign) {
           result += char === 'Е' ? (isAllCaps ? 'JE' : 'Je') : 'je';
           continue;
        } else {
           result += char === 'Е' ? 'E' : 'e';
           continue;
        }
      } else {
        result += char === 'Е' ? 'E' : 'e';
        continue;
      }
    }
    
    result += map[char] !== undefined ? map[char] : char;
  }
  
  // Fix for Ukrainian 'ьо' which maps to 'jo'
  result = result.replace(/ьо/g, 'jo').replace(/Ьо/g, isAllCaps ? 'JO' : 'Jo').replace(/ЬО/g, 'JO');
  
  return result;
};

export const createArrowFeatures = (start: [number, number], end: [number, number], color: string, id: string = '') => {
  const distance = turf.distance(start, end, { units: 'kilometers' });
  if (distance === 0) return null;

  const startCoord: [number, number] = [start[0], start[1]];
  const endCoord: [number, number] = [end[0], end[1]];

  const shaft: GeoJSON.Feature<GeoJSON.LineString> = {
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: [startCoord, endCoord] },
    properties: { color, $type: 'LineString', id }
  };

  const bearing = turf.bearing(startCoord, endCoord);

  const head: GeoJSON.Feature<GeoJSON.Point> = {
    type: 'Feature',
    geometry: {
      type: 'Point',
      coordinates: endCoord
    },
    properties: { color, $type: 'ArrowHead', id, bearing }
  };

  return { shaft, head };
};

export const decodePolyline = (str: string, precision: number = 5): [number, number][] => {
  let index = 0,
    lat = 0,
    lng = 0,
    coordinates: [number, number][] = [],
    shift = 0,
    result = 0,
    byte = null,
    latitude_change,
    longitude_change,
    factor = Math.pow(10, precision);

  while (index < str.length) {
    byte = null;
    shift = 0;
    result = 0;
    do {
      byte = str.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    latitude_change = ((result & 1) ? ~(result >> 1) : (result >> 1));
    shift = result = 0;
    do {
      byte = str.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    longitude_change = ((result & 1) ? ~(result >> 1) : (result >> 1));
    lat += latitude_change;
    lng += longitude_change;
    coordinates.push([lng / factor, lat / factor]);
  }
  return coordinates;
};

export const parseWKT = (wkt: string): any => {
  if (!wkt) return null;
  wkt = wkt.trim();
  
  if (wkt.startsWith('POINT')) {
    const coordsStr = wkt.match(/POINT\s*\(\s*(.*?)\s*\)/)?.[1];
    if (coordsStr) {
      const parts = coordsStr.split(/\s+/).map(Number);
      if (parts.length >= 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
        return turf.point([parts[0], parts[1]]);
      }
    }
  } else if (wkt.startsWith('POLYGON')) {
    const coordsStr = wkt.match(/POLYGON\s*\(\((.*?)\)\)/)?.[1];
    if (coordsStr) {
      const points = coordsStr.split(',').map(pair => {
        const parts = pair.trim().split(/\s+/).map(Number);
        return [parts[0], parts[1]];
      });
      // Turf requires polygons to be closed (first == last)
      if (points.length > 0) {
        if (points[0][0] !== points[points.length - 1][0] || points[0][1] !== points[points.length - 1][1]) {
          points.push([...points[0]]);
        }
        return turf.polygon([points]);
      }
    }
  }
  return null;
};

export const haversineDistance = (coords1: [number, number], coords2: [number, number]) => {
  const toRad = (x: number) => x * Math.PI / 180;
  const lon1 = coords1[0];
  const lat1 = coords1[1];
  const lon2 = coords2[0];
  const lat2 = coords2[1];

  const R = 6371; // km
  const x1 = lat2 - lat1;
  const dLat = toRad(x1);
  const x2 = lon2 - lon1;
  const dLon = toRad(x2);
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};
