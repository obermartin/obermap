const fs = require('fs');
let code = fs.readFileSync('src/components/MapContainer.tsx', 'utf8');

// Replace blocking fetch in what looks like the detailed click handler
code = code.replace(/const layerRes = await fetch\(layer\.json\);\n                        if \(layerRes\.ok\) \{\n                          const layerData = await layerRes\.json\(\);\n                          if \(layerData && layerData\.features\) \{\n                            allFeatures\.push\(\.\.\.layerData\.features\);\n                          \}\n                        \}/g, `const features = await safeFetchCemsJson(layer.json);\n                        if (features && features.length) {\n                          allFeatures.push(...features);\n                        }`);

// Replace promise push for wildfires and floods
const promiseSearch = `                            vtPromises.push(
                              fetch(layer.json)
                                .then(res => res.ok ? res.json() : null)
                                .then(layerData => {
                                  if (layerData && layerData.features) {
                                    return layerData.features;
                                  }
                                  return [];
                                })
                                .catch(err => {
                                  console.warn('Failed to fetch CEMS VT layer', err);
                                  return [];
                                })
                            );`;
const promiseReplace = `                            vtPromises.push(safeFetchCemsJson(layer.json));`;

code = code.replace(new RegExp(promiseSearch.replace(/[.*+?^$\{\}\(\)|\[\]\\]/g, '\\$&'), 'g'), promiseReplace);

fs.writeFileSync('src/components/MapContainer.tsx', code);
console.log('Replaced fetches');
