const fs = require('fs');
let code = fs.readFileSync('src/components/MapContainer.tsx', 'utf8');

const search = `for (const product of aoi.products) {`;
const replace = `const latestProduct = [...aoi.products].sort((a: any, b: any) => (b.monitoringNumber || 0) - (a.monitoringNumber || 0))[0];
                    const productsToProcess = latestProduct ? [latestProduct] : [];
                    for (const product of productsToProcess) {`;

code = code.replace(new RegExp(search.replace(/[.*+?^$\{\}\(\)|\[\]\\]/g, '\\$&'), 'g'), replace);

// Fix the `type === 'floods'` TS error again
code = code.replace(/const floodLayer = settings\.layers\.find\(l => l\.type === 'floods'\);/g, "const floodLayer = settings.layers.find(l => l.id === 'floods');");

fs.writeFileSync('src/components/MapContainer.tsx', code);
console.log('Safe filter applied');
