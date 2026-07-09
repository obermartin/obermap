export function downloadGeoJSON(data: any, filename: string) {
  const jsonStr = JSON.stringify(data, null, 2);
  const blob = new Blob([jsonStr], { type: "application/geo+json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function processCycloneGeometry(geojsonData: any) {
  if (!geojsonData || !Array.isArray(geojsonData.features)) return geojsonData;
  
  const coneFeatures: any[] = [];
  const lineSegments: number[][][] = [];
  const otherFeatures: any[] = [];
  
  for (const feature of geojsonData.features) {
    if (feature.geometry?.type === 'Polygon' && feature.properties?.Class === 'Poly_Cones') {
      coneFeatures.push(feature);
    } else if (feature.geometry?.type === 'LineString') {
      lineSegments.push(feature.geometry.coordinates);
    }
  }
  
  if (lineSegments.length > 0) {
    let currentPath = [...lineSegments[0]];
    const unvisited = lineSegments.slice(1);
    
    let added = true;
    while (added && unvisited.length > 0) {
      added = false;
      for (let i = 0; i < unvisited.length; i++) {
        const seg = unvisited[i];
        const start = seg[0];
        const end = seg[seg.length - 1];
        const pathStart = currentPath[0];
        const pathEnd = currentPath[currentPath.length - 1];
        
        if (start[0] === pathEnd[0] && start[1] === pathEnd[1]) {
          currentPath.push(...seg.slice(1));
          unvisited.splice(i, 1);
          added = true;
          break;
        } else if (end[0] === pathStart[0] && end[1] === pathStart[1]) {
          currentPath.unshift(...seg.slice(0, seg.length - 1));
          unvisited.splice(i, 1);
          added = true;
          break;
        } else if (start[0] === pathStart[0] && start[1] === pathStart[1]) {
          const reversedSeg = [...seg].reverse();
          currentPath.unshift(...reversedSeg.slice(0, reversedSeg.length - 1));
          unvisited.splice(i, 1);
          added = true;
          break;
        } else if (end[0] === pathEnd[0] && end[1] === pathEnd[1]) {
          const reversedSeg = [...seg].reverse();
          currentPath.push(...reversedSeg.slice(1));
          unvisited.splice(i, 1);
          added = true;
          break;
        }
      }
    }
    
    if (unvisited.length === 0) {
      otherFeatures.push({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: currentPath },
        properties: { description: 'Combined Hurricane Path' }
      });
    } else {
       otherFeatures.push({
         type: 'Feature',
         geometry: { type: 'MultiLineString', coordinates: [currentPath, ...unvisited] },
         properties: { description: 'Hurricane Path (some disjoint segments)' }
       });
    }
  }
  
  return {
    type: 'FeatureCollection',
    features: [...coneFeatures, ...otherFeatures]
  };
}

export function processVolcanoGeometry(geojsonData: any) {
  if (!geojsonData || !Array.isArray(geojsonData.features)) return geojsonData;
  
  const processedFeatures = geojsonData.features.map((feature: any) => {
    let name = "Volcano Hazard Zone";
    
    if (feature.geometry?.type === 'Point' || feature.properties?.Class === 'Point_Centroid') {
      name = "Volcano Vent (Centroid)";
    } else if (feature.geometry?.type === 'Polygon') {
      if (feature.properties?.Class === 'Poly_Circle') {
        const radius = feature.properties?.polygonlabel || "Unknown Radius";
        name = `Impact Buffer (${radius})`;
      } else {
        const label = feature.properties?.polygonlabel || feature.properties?.Class || "Wedge/Sector";
        name = `Ashfall Dispersion Forecast (${label})`;
      }
    }
    
    return {
      ...feature,
      properties: {
        ...feature.properties,
        name: name,
        description: name
      }
    };
  });
  
  return {
    ...geojsonData,
    features: processedFeatures
  };
}

export function processEarthquakeGeometry(geojsonData: any) {
  if (!geojsonData || !Array.isArray(geojsonData.features)) return geojsonData;
  
  const processedFeatures = geojsonData.features.map((feature: any) => {
    let name = "Earthquake Shakemap Zone";
    
    if (feature.properties?.intensity !== undefined) {
      name = `Shake Intensity (MMI: ${feature.properties.intensity})`;
    } else if (feature.properties?.polygonlabel) {
      name = `Shake Intensity (${feature.properties.polygonlabel})`;
    }
    
    return {
      ...feature,
      properties: {
        ...feature.properties,
        name: name,
        description: name
      }
    };
  });
  
  return {
    ...geojsonData,
    features: processedFeatures
  };
}

export function processCemsGeometry(geojsonData: any) {
  if (!geojsonData || !Array.isArray(geojsonData.features)) return geojsonData;
  
  const filteredFeatures = geojsonData.features.filter((feature: any) => {
    const damageGra = feature.properties?.damage_gra?.toLowerCase() || '';
    const objType = feature.properties?.obj_type?.toLowerCase() || '';
    
    if (damageGra === 'no visible damage' || damageGra === 'not analysed' || damageGra === 'not analyzed') return false;
    if (objType === 'not analysed' || objType === 'not analyzed') return false;
    
    return true;
  });
  
  const processedFeatures = filteredFeatures.map((feature: any) => {
    let name = "CEMS Damage Assessment";
    
    if (feature.properties?.isExtent) {
      name = `CEMS Area of Interest Extent (${feature.properties.aoiName || 'Unknown'})`;
    } else if (feature.properties?.damage_gra && feature.properties?.damage_gra !== 'Not Applicable') {
      name = `Infrastructure Damage (${feature.properties.damage_gra})`;
      if (feature.properties?.obj_type && !feature.properties.obj_type.includes('Unclassified')) {
        name = `${feature.properties.obj_type.replace(/^\d+-/, '')} - ${feature.properties.damage_gra}`;
      }
    } else if (feature.properties?.obj_desc && feature.properties?.value) {
      name = `${feature.properties.obj_desc}: ${feature.properties.value}`;
    } else if (feature.properties?.obj_type && feature.properties?.obj_type !== 'Not Applicable') {
      name = `${feature.properties.obj_type.replace(/^\d+-/, '')}`;
      if (feature.properties?.obj_desc && feature.properties?.obj_desc !== 'Not Applicable') {
         name += ` (${feature.properties.obj_desc.replace(/^\d+-/, '')})`;
      }
    } else if (feature.properties?.obj_desc && feature.properties?.obj_desc !== 'Not Applicable') {
      name = feature.properties.obj_desc.replace(/^\d+-/, '');
    }
    
    return {
      ...feature,
      properties: {
        ...feature.properties,
        name: name,
        description: name
      }
    };
  });
  
  // Sort features by severity
  const severityRank: Record<string, number> = {
    'destroyed': 1,
    'damaged': 2,
    'possibly damaged': 3,
  };

  processedFeatures.sort((a: any, b: any) => {
    if (a.properties?.isExtent && !b.properties?.isExtent) return -1;
    if (!a.properties?.isExtent && b.properties?.isExtent) return 1;

    const rankA = severityRank[a.properties?.damage_gra?.toLowerCase()] || 4;
    const rankB = severityRank[b.properties?.damage_gra?.toLowerCase()] || 4;
    
    if (rankA !== rankB) return rankA - rankB;
    
    // Fallback to alphabetical sorting by name if severity is the same
    return (a.properties?.name || '').localeCompare(b.properties?.name || '');
  });
  
  return {
    ...geojsonData,
    features: processedFeatures
  };
}
