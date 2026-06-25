const fs = require('fs');

const fixGeoJsonPolygons = (geoJson) => {
  if (!geoJson || !geoJson.features) return geoJson;
  const newFeatures = geoJson.features.map((feature) => {
    if (feature.geometry && (feature.geometry.type === 'Polygon' || feature.geometry.type === 'MultiPolygon')) {
      const coords = feature.geometry.coordinates;
      const fixRing = (ring) => {
        if (ring.length > 0) {
          const first = ring[0];
          const last = ring[ring.length - 1];
          if (first[0] !== last[0] || first[1] !== last[1]) {
            ring.push([...first]);
          }
        }
      };
      
      if (feature.geometry.type === 'Polygon') {
        coords.forEach(fixRing);
      } else {
        coords.forEach((polygon) => polygon.forEach(fixRing));
      }
    }
    return feature;
  });
  return { ...geoJson, features: newFeatures };
};

fetch('https://earthquake.usgs.gov/product/dyfi/us7000nzf3/us/1757529664634/dyfi_geo_10km.geojson')
  .then(res => res.json())
  .then(data => {
    const fixed = fixGeoJsonPolygons(data);
    fs.writeFileSync('fixed.json', JSON.stringify(fixed, null, 2));
    console.log('Done');
  })
  .catch(err => console.error(err));
