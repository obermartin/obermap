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

const input = {
  "type": "FeatureCollection",
  "features": [
    {
      "geometry": {
        "coordinates": [[[153,-27.39331],[153.10114,-27.39328],[153.10106,-27.30299],[153,-27.30303]]],
        "type": "Polygon"
      },
      "type": "Feature",
      "properties": {"cdi": 1}
    }
  ]
};

console.log(JSON.stringify(fixGeoJsonPolygons(input).features[0].geometry.coordinates[0]));
