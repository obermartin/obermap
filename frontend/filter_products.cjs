const fs = require('fs');
let code = fs.readFileSync('src/components/MapContainer.tsx', 'utf8');

const searchRegex = /if \(aoi\.products\) \{\n                    \/\/ Fetch VT layers concurrently as well\n                    const vtPromises: Promise<any>\[\] = \[\];\n                    for \(const product of aoi\.products\) \{\n                      if \(product\.layers\) \{/g;

const replace = `if (aoi.products && aoi.products.length > 0) {
                    // Only process the single most recent product (highest monitoringNumber) per AOI to save massive amounts of memory
                    const latestProduct = aoi.products.reduce((prev: any, current: any) => {
                      return (prev.monitoringNumber || 0) > (current.monitoringNumber || 0) ? prev : current;
                    });
                    
                    // Fetch VT layers concurrently as well
                    const vtPromises: Promise<any>[] = [];
                    const product = latestProduct;
                    if (product && product.layers) {`;

code = code.replace(searchRegex, replace);
fs.writeFileSync('src/components/MapContainer.tsx', code);
console.log('Filtered products to latest only');
