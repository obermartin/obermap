const fs = require('fs');
let code = fs.readFileSync('src/components/MapContainer.tsx', 'utf8');

// 1. Add cemsFetchQueue and processCemsFetchQueue before safeFetchCemsJson
const queueCode = `
// Simple concurrency limiter for CEMS fetches
const cemsFetchQueue = [];
let activeCemsFetches = 0;
const MAX_CONCURRENT_CEMS_FETCHES = 10;

async function enqueueCemsFetch(task) {
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

code = code.replace(/async function safeFetchCemsJson\(url: string\) \{/g, queueCode + '\nasync function safeFetchCemsJson(url: string) {');

// 2. Wrap safeFetchCemsJson inner body in enqueueCemsFetch
code = code.replace(/async function safeFetchCemsJson\(url: string\) \{\n  try \{/g, 'async function safeFetchCemsJson(url: string) {\n  return enqueueCemsFetch(async () => {\n  try {');
code = code.replace(/    return \[\];\n  \}\n\}/g, '    return [];\n  }\n  });\n}');

// 3. Clear cache when toggled off
code = code.replace(/if \(!floodLayer \|\| !floodLayer\.visible \|\| !floodLayer\.copernicusEnabled\) \{\n      if \(activeCemsFloodFeatures\) setActiveCemsFloodFeatures\(null\);\n      return;/g, 'if (!floodLayer || !floodLayer.visible || !floodLayer.copernicusEnabled) {\n      if (activeCemsFloodFeatures) setActiveCemsFloodFeatures(null);\n      cemsFeatureCacheRef.current = {};\n      return;');

// 4. Change Mapbox updating from monolithic to incremental
const searchBlock = `        const allResults = await Promise.all(fetchPromises);
        const allFeatures = allResults.flat();
        if (isSubscribed) {
          const actCollection: GeoJSON.FeatureCollection = {
            type: 'FeatureCollection',
            features: allFeatures
          };
          setActiveCemsFloodFeatures(actCollection);
        }`;

const replaceBlock = `        // Replaced monolithic assembly with incremental updates in the promise chain
        // We still await all to handle loading states if needed
        await Promise.all(fetchPromises);`;

code = code.replace(searchBlock, replaceBlock);

// 5. Add incremental update logic to the map loop
const mapReturnSearch = `          return cemsFeatureCacheRef.current[act.code].catch((e: any) => {`;
const mapReturnReplace = `          return cemsFeatureCacheRef.current[act.code].then(actFeatures => {
            if (isSubscribed && actFeatures.length > 0) {
              setActiveCemsFloodFeatures(prev => {
                const currentFeatures = prev && prev.features ? prev.features : [];
                return {
                  type: 'FeatureCollection',
                  features: [...currentFeatures, ...actFeatures]
                };
              });
            }
            return actFeatures;
          }).catch((e: any) => {`;

code = code.replace(mapReturnSearch, mapReturnReplace);

// 6. Add customAlert back to the effect that updates map source
const customAlertSearch = `        customAlert(\`Success: \${activeCemsFloodFeatures.features.length} CEMS flood features loaded and passed to Mapbox engine.\`);`;
if (!code.includes('customAlert(`Success:')) {
  const sourceSetSearch = `      source.setData(activeCemsFloodFeatures || { type: 'FeatureCollection', features: [] });`;
  const sourceSetReplace = `      source.setData(activeCemsFloodFeatures || { type: 'FeatureCollection', features: [] });
      if (activeCemsFloodFeatures && activeCemsFloodFeatures.features && activeCemsFloodFeatures.features.length > 0) {
        customAlert(\`Success: \${activeCemsFloodFeatures.features.length} CEMS flood features loaded and passed to Mapbox engine.\`);
      }`;
  code = code.replace(sourceSetSearch, sourceSetReplace);
}


fs.writeFileSync('src/components/MapContainer.tsx', code);
console.log('Patched MapContainer.tsx successfully');
