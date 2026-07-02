const fs = require('fs');
let code = fs.readFileSync('src/components/MapContainer.tsx', 'utf8');

// 1. Remove cache clearing
code = code.replace(/cemsFeatureCacheRef\.current = \{\};/g, '// cemsFeatureCacheRef.current = {}; // Removed to prevent memory leaks from dangling promises');

// 2. Separate setData for Wildfires
const wfRenderSearch = `    const source = map.getSource('active-wildfire-cems-vt-source') as maplibregl.GeoJSONSource;
    if (source) {
      source.setData(activeCemsWildfireFeatures || { type: 'FeatureCollection', features: [] });
    }

    const wfLayer = settings.layers.find(l => l.type === 'wildfires');`;

const wfRenderReplace = `    const wfLayer = settings.layers.find(l => l.type === 'wildfires');`;

const wfSetDataEffect = `
  // Heavy setData operation isolated to prevent memory leaks on settings save
  useEffect(() => {
    if (!mapLoaded || !mapRef.current) return;
    const source = mapRef.current.getSource('active-wildfire-cems-vt-source') as maplibregl.GeoJSONSource;
    if (source) {
      source.setData(activeCemsWildfireFeatures || { type: 'FeatureCollection', features: [] });
    }
  }, [activeCemsWildfireFeatures, mapLoaded]);
`;

code = code.replace(wfRenderSearch, wfRenderReplace);
code = code.replace(`  // Wildfire CEMS VT rendering`, wfSetDataEffect + `\n  // Wildfire CEMS VT rendering`);

// 3. Separate setData for Floods
const floodRenderSearch = `    const source = map.getSource('active-flood-cems-vt-source') as maplibregl.GeoJSONSource;
    if (source) {
      source.setData(activeCemsFloodFeatures || { type: 'FeatureCollection', features: [] });
    }

    const floodLayer = settings.layers.find(l => l.id === 'floods');`;

const floodRenderReplace = `    const floodLayer = settings.layers.find(l => l.id === 'floods');`;

const floodSetDataEffect = `
  // Heavy setData operation isolated to prevent memory leaks on settings save
  useEffect(() => {
    if (!mapLoaded || !mapRef.current) return;
    const source = mapRef.current.getSource('active-flood-cems-vt-source') as maplibregl.GeoJSONSource;
    if (source) {
      source.setData(activeCemsFloodFeatures || { type: 'FeatureCollection', features: [] });
    }
  }, [activeCemsFloodFeatures, mapLoaded]);
`;

code = code.replace(floodRenderSearch, floodRenderReplace);
code = code.replace(`  // Flood CEMS VT rendering`, floodSetDataEffect + `\n  // Flood CEMS VT rendering`);


fs.writeFileSync('src/components/MapContainer.tsx', code);
console.log('Fixed memory leaks');
