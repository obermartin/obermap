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
