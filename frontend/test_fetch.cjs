const fs = require('fs');
async function test() {
  const url = "https://rapidmapping-viewer.s3.eu-west-1.amazonaws.com/EMSR864/AOI02/DEL_MONIT01/EMSR864_AOI02_DEL_MONIT01_maximumFloodExtentA_v1.json";
  const res = await fetch(url);
  const text = await res.text();
  
      try {
        const data = JSON.parse(text);
        console.log("Standard parsed", data.features ? data.features.length : 1);
      } catch (err) {
        console.log("Standard parsing failed, starting recovery");
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
        console.log("Recovered parsed", features.length);
      }
}
test();
