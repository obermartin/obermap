const fs = require('fs');
let code = fs.readFileSync('src/components/MapContainer.tsx', 'utf8');

// The flood loop
const search = `                        for (const layer of product.layers) {
                          if (layer.format === 'vt' && layer.json) {
                            vtPromises.push(safeFetchCemsJson(layer.json));
                          }
                        }`;

const replaceFlood = `                        for (const layer of product.layers) {
                          if (layer.format === 'vt' && layer.json) {
                            // Filter massive layers to prevent OOM
                            // For floods we only want the actual flood polygons, not the entire country's roads and rivers
                            if (layer.name && (layer.name.includes('floodDepthA') || layer.name.includes('maximumFloodExtentA'))) {
                              vtPromises.push(safeFetchCemsJson(layer.json));
                            }
                          }
                        }`;

// We need to make sure we only replace the Flood one, so let's find it.
// The flood one is around line 5380.
// Actually, let's just use string replace but limit it to the Flood useEffect by taking a larger block.
const floodBlockSearch = `          return cemsFeatureCacheRef.current[act.code].catch((e: any) => {
            console.error('[CEMS Debug] Failed to fetch detailed CEMS activation', e);
            delete cemsFeatureCacheRef.current[act.code];
            return [];
          });
        });

        const allResults = await Promise.all(fetchPromises);
        const allFeatures = allResults.flat();`;

// Wait, the block with `layer.format === 'vt'` is INSIDE the cache creation!
const fullSearch = `                  if (aoi.products && aoi.products.length > 0) {
                    // Only process the single most recent product (highest monitoringNumber) per AOI to save massive amounts of memory
                    const latestProduct = [...aoi.products].sort((a: any, b: any) => (b.monitoringNumber || 0) - (a.monitoringNumber || 0))[0];
                    const productsToProcess = latestProduct ? [latestProduct] : [];
                    for (const product of productsToProcess) {
                      if (product.layers) {
                        for (const layer of product.layers) {
                          if (layer.format === 'vt' && layer.json) {
                            vtPromises.push(safeFetchCemsJson(layer.json));
                          }
                        }
                      }
                    }`;

const fullReplace = `                  if (aoi.products && aoi.products.length > 0) {
                    // Only process the single most recent product (highest monitoringNumber) per AOI to save massive amounts of memory
                    const latestProduct = [...aoi.products].sort((a: any, b: any) => (b.monitoringNumber || 0) - (a.monitoringNumber || 0))[0];
                    const productsToProcess = latestProduct ? [latestProduct] : [];
                    for (const product of productsToProcess) {
                      if (product.layers) {
                        for (const layer of product.layers) {
                          if (layer.format === 'vt' && layer.json) {
                            // Filter to ONLY the critical flood layers to prevent OOM
                            if (layer.name && (layer.name.includes('floodDepthA') || layer.name.includes('maximumFloodExtentA'))) {
                              vtPromises.push(safeFetchCemsJson(layer.json));
                            }
                          }
                        }
                      }
                    }`;

code = code.replace(fullSearch, fullReplace);

fs.writeFileSync('src/components/MapContainer.tsx', code);
console.log('Restricted layer fetching');
