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



export const getMmsiFlagHtml = (mmsi: string | number) => {
  const mStr = String(mmsi);
  if (mStr.length !== 9) return '';
  const mid = parseInt(mStr.substring(0, 3));
  const midMap: Record<number, string> = {
    211: 'DE', 218: 'DE', 232: 'GB', 233: 'GB', 234: 'GB', 235: 'GB',
    338: 'US', 366: 'US', 367: 'US', 368: 'US', 369: 'US', 226: 'FR', 227: 'FR', 228: 'FR',
    247: 'IT', 224: 'ES', 225: 'ES', 316: 'CA', 503: 'AU', 431: 'JP', 432: 'JP',
    412: 'CN', 413: 'CN', 414: 'CN', 273: 'RU', 272: 'UA', 261: 'PL', 271: 'TR',
    244: 'NL', 245: 'NL', 246: 'NL', 269: 'CH', 265: 'SE', 266: 'SE', 257: 'NO', 258: 'NO', 259: 'NO',
    219: 'DK', 220: 'DK', 230: 'FI', 203: 'AT', 205: 'BE', 710: 'BR', 345: 'MX', 419: 'IN',
    601: 'ZA', 250: 'IE', 237: 'GR', 238: 'GR', 239: 'GR', 240: 'GR', 241: 'GR', 263: 'PT',
    512: 'NZ', 563: 'SG', 564: 'SG', 565: 'SG', 566: 'SG', 470: 'AE', 403: 'SA', 428: 'IL',
    440: 'KR', 441: 'KR', 416: 'TW', 477: 'HK', 567: 'TH', 533: 'MY', 525: 'ID', 574: 'VN',
    548: 'PH', 622: 'EG', 242: 'MA',
    351: 'PA', 352: 'PA', 353: 'PA', 354: 'PA', 355: 'PA', 356: 'PA', 357: 'PA', 370: 'PA', 371: 'PA', 372: 'PA', 373: 'PA', 374: 'PA',
    636: 'LR', 637: 'LR', 538: 'MH', 215: 'MT', 229: 'MT', 248: 'MT', 249: 'MT', 256: 'MT',
    308: 'BS', 309: 'BS', 311: 'BS', 209: 'CY', 210: 'CY', 212: 'CY', 304: 'AG', 305: 'AG',
    375: 'VC', 376: 'VC', 377: 'VC', 576: 'VU', 577: 'VU', 319: 'KY', 310: 'BM', 236: 'GI', 231: 'FO'
  };
  const code = midMap[mid];
  if (!code) return '';
  return `<img src="https://flagcdn.com/w20/${code.toLowerCase()}.png" width="16" alt="${code}" style="vertical-align: middle; border-radius: 1px;" />`;
};




// Simple concurrency limiter for CEMS fetches

const MAX_CONCURRENT_CEMS_FETCHES = 10;

export function enqueueCemsFetch<T>(task: () => Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    cemsFetchQueue.push(async () => {
      try {
        resolve(await task());
      } catch (e) {
        reject(e);
      }
    });
    processCemsFetchQueue();
  });
}

function processCemsFetchQueue() {
  while (activeCemsFetches < MAX_CONCURRENT_CEMS_FETCHES && cemsFetchQueue.length > 0) {
    const task = cemsFetchQueue.shift();
    if (task) {
      activeCemsFetches++;
      task().finally(() => {
        activeCemsFetches--;
        processCemsFetchQueue();
      });
    }
  }
}

const cemsFetchQueue: (() => Promise<void>)[] = [];
let activeCemsFetches = 0;


export async function safeFetchCemsJson(url: string) {
  return enqueueCemsFetch(async () => {
    try {
      const res = await fetch(url);
      if (!res.ok) return [];
      const text = await res.text();
      try {
        const data = JSON.parse(text);
        return data && data.features ? data.features : (data.type === 'Feature' ? [data] : []);
      } catch (err: any) {
        const features: any[] = [];
        let depth = 0;
        let startIdx = -1;
        let inString = false;
        let escape = false;

        for (let i = 0; i < text.length; i++) {
          const char = text[i];
          if (inString) {
            if (escape) escape = false;
            else if (char === '\\') escape = true;
            else if (char === '"') inString = false;
          } else {
            if (char === '"') inString = true;
            else if (char === '{') {
              if (depth === 0) startIdx = i;
              depth++;
            }
            else if (char === '}') {
              depth--;
              if (depth === 0 && startIdx !== -1) {
                try {
                  const obj = JSON.parse(text.substring(startIdx, i + 1));
                  if (obj.type === 'FeatureCollection' && obj.features) {
                    features.push(...obj.features);
                  } else if (obj.type === 'Feature') {
                    features.push(obj);
                  }
                } catch (e) {}
                startIdx = -1;
              }
            }
          }
        }
        return features;
      }
    } catch (e) {
      return [];
    }
  });
}