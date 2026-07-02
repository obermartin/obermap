const fs = require('fs');
let code = fs.readFileSync('src/components/MapContainer.tsx', 'utf8');

const fetchLogic = `
// Simple concurrency limiter for CEMS fetches
const cemsFetchQueue: (() => Promise<void>)[] = [];
let activeCemsFetches = 0;
const MAX_CONCURRENT_CEMS_FETCHES = 10;

async function enqueueCemsFetch<T>(task: () => Promise<T>): Promise<T> {
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

async function safeFetchCemsJson(url: string) {
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
`;

// Insert it right after the imports
code = code.replace(/let omProtocolRegistered = false;/g, fetchLogic + '\nlet omProtocolRegistered = false;');

fs.writeFileSync('src/components/MapContainer.tsx', code);
console.log('Added safeFetchCemsJson');
