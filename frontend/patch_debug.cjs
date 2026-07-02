const fs = require('fs');
let code = fs.readFileSync('src/components/MapContainer.tsx', 'utf8');

// Add debug logs to queue
code = code.replace(/processCemsFetchQueue\(\);\n  \}\);\n\}/g, `processCemsFetchQueue();\n  });\n}\n\n// @ts-ignore\nwindow.cemsDebugInfo = () => ({ q: cemsFetchQueue.length, active: activeCemsFetches });`);

// Add debug log to allFeatures
code = code.replace(/const allFeatures = allResults\.flat\(\);/g, `const allFeatures = allResults.flat();\n        console.log('[CEMS Debug] FLOOD FEATURES RESOLVED:', allFeatures.length);`);

fs.writeFileSync('src/components/MapContainer.tsx', code);
