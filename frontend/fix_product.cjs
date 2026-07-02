const fs = require('fs');
let code = fs.readFileSync('src/components/MapContainer.tsx', 'utf8');

const search = `const latestProduct = [...aoi.products].sort((a: any, b: any) => (b.monitoringNumber || 0) - (a.monitoringNumber || 0))[0];`;

const replace = `// Find the latest product that actually contains VT layers!
const productsWithVt = aoi.products.filter((p: any) => p.layers && p.layers.some((l: any) => l.format === 'vt'));
const latestProduct = productsWithVt.length > 0 ? productsWithVt.sort((a: any, b: any) => (b.monitoringNumber || 0) - (a.monitoringNumber || 0))[0] : null;`;

code = code.replace(search, replace);

fs.writeFileSync('src/components/MapContainer.tsx', code);
console.log('Fixed product selection logic');
