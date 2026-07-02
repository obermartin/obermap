const fs = require('fs');
let code = fs.readFileSync('src/components/MapContainer.tsx', 'utf8');

// Add tolerance to Mapbox sources to save RAM
const searchWf = `        map.addSource('active-wildfire-cems-vt-source', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] }
        });`;
const replaceWf = `        map.addSource('active-wildfire-cems-vt-source', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
          tolerance: 0.5 // Reduce geometry complexity to save Web Worker RAM
        });`;

const searchFlood = `      map.addSource('active-flood-cems-vt-source', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
      });`;
const replaceFlood = `      map.addSource('active-flood-cems-vt-source', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
        tolerance: 0.5 // Reduce geometry complexity to save Web Worker RAM
      });`;

code = code.replace(searchWf, replaceWf);
code = code.replace(searchFlood, replaceFlood);

fs.writeFileSync('src/components/MapContainer.tsx', code);
console.log('Fixed tolerance');
