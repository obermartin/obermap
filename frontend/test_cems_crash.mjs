const text = `{"type": "Feature", "properties": {"name": "hello \\" world"}}`;

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

console.log(features.length);
