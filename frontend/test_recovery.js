const text = `{"type": "FeatureCollection", "features": [{"type":"Feature","properties":{},"geometry":{"type":"Point","coordinates":[0,0]}}]}
<some garbage>`;
let depth = 0;
let endIdx = -1;
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
    else if (char === '{') depth++;
    else if (char === '}') {
      depth--;
      if (depth === 0) {
        endIdx = i;
        break;
      }
    }
  }
}
console.log(text.substring(0, endIdx + 1));
