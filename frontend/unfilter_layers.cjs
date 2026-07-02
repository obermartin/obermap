const fs = require('fs');
let code = fs.readFileSync('src/components/MapContainer.tsx', 'utf8');

const search = `                            // Filter to ONLY the critical flood layers to prevent OOM
                            if (layer.name && (layer.name.includes('floodDepthA') || layer.name.includes('maximumFloodExtentA'))) {
                              vtPromises.push(safeFetchCemsJson(layer.json));
                            }`;

const replace = `                            vtPromises.push(safeFetchCemsJson(layer.json));`;

code = code.replace(search, replace);
fs.writeFileSync('src/components/MapContainer.tsx', code);
console.log('Unfiltered layers');
