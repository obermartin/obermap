const fs = require('fs');
let code = fs.readFileSync('src/components/MapContainer.tsx', 'utf8');

// Remove duplicate enqueueCemsFetch from top
const queueCode = `
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
`;
code = code.replace(queueCode, '');

// The untyped one is currently there because my regex replaced it exactly without types.
code = code.replace(/const cemsFetchQueue = \[\];/g, 'const cemsFetchQueue: (() => Promise<void>)[] = [];');
code = code.replace(/async function enqueueCemsFetch\(task\) \{/g, 'async function enqueueCemsFetch<T>(task: () => Promise<T>): Promise<T> {');

// Fix actFeatures type
code = code.replace(/\.then\(actFeatures => \{/g, '.then((actFeatures: any[]) => {');

// Fix prev type
code = code.replace(/setActiveCemsFloodFeatures\(prev => \{/g, 'setActiveCemsFloodFeatures((prev: any) => {');

// Fix l.type === 'floods' to l.id === 'floods'
code = code.replace(/const floodLayer = settings\.layers\.find\(l => l\.type === 'floods'\);/g, "const floodLayer = settings.layers.find(l => l.id === 'floods');");

// Remove the `allResults` usage in Wildfires if it's broken
code = code.replace(/const allFeatures = allResults\.flat\(\);/g, 'const allFeatures: any[] = [];');

fs.writeFileSync('src/components/MapContainer.tsx', code);
