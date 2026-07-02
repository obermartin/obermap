async function safeFetchCemsJson(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    const text = await res.text();
    try {
      const data = JSON.parse(text);
      return data && data.features ? data.features : (data.type === 'Feature' ? [data] : []);
    } catch (err) {
      console.warn(`Failed to parse CEMS JSON normally for ${url}, attempting recovery`, err.message);
      const features = [];
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
    console.warn(`Fetch error for CEMS JSON ${url}`, e);
    return [];
  }
}

const f1 = await safeFetchCemsJson('https://rapidmapping-viewer.s3.eu-west-1.amazonaws.com/EMSR864/AOI02/DEL_MONIT01/EMSR864_AOI02_DEL_MONIT01_maximumFloodExtentA_v1.json');
console.log('maximumFloodExtentA', f1.length);
