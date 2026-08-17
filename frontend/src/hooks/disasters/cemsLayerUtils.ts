import maplibregl from 'maplibre-gl';

export const addLayerSafely = (map: maplibregl.Map, layer: any, explicitBeforeId?: string | null) => {
  if (map.getLayer(layer.id)) return;
  
  let beforeId = explicitBeforeId !== undefined ? explicitBeforeId : (map.getLayer('custom-polygons') ? 'custom-polygons' : undefined);
  
  if (!beforeId && explicitBeforeId === undefined) {
    if (typeof (map as any)._cachedBeforeAdminId !== 'undefined') {
      const cached = (map as any)._cachedBeforeAdminId;
      if (cached === null || map.getLayer(cached)) {
        beforeId = cached === null ? undefined : cached;
      } else {
        (map as any)._cachedBeforeAdminId = undefined;
      }
    }
    
    if (typeof (map as any)._cachedBeforeAdminId === 'undefined') {
      const layers = map.getStyle()?.layers || [];
      for (let i = 0; i < layers.length; i++) {
        const id = layers[i].id;
        if ((layers[i].type === 'line' || layers[i].type === 'symbol') &&
            (id.includes('admin') || id.includes('border') || id.includes('boundar') || id.includes('country'))) {
          beforeId = id;
          break;
        }
      }
      if (!beforeId) {
        beforeId = layers.find(l => l.type === 'symbol')?.id;
      }
      (map as any)._cachedBeforeAdminId = beforeId || null;
    }
  }
  
  if (beforeId && !map.getLayer(beforeId)) {
    beforeId = undefined;
  }
  
  try {
    map.addLayer(layer, beforeId as any);
  } catch (e) {
    console.warn(`Failed to add layer safely with beforeId ${beforeId}:`, e);
    try {
      map.addLayer(layer);
    } catch (e2) {
      console.error(`Failed to add layer ${layer.id}:`, e2);
    }
  }
};

export const setupCemsLayers = (map: maplibregl.Map, sourceId: string) => {
  if (map.getSource(sourceId)) {
    console.log(`[CEMS Debug] Source ${sourceId} already exists, skipping setup.`);
    return;
  }

  console.log(`[CEMS Debug] Adding source ${sourceId}...`);
  map.addSource(sourceId, {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] }
    // Removed tolerance: 0 to allow Mapbox to simplify geometries. 
    // Without simplification, 6000+ complex MultiPolygons cause an Out of Memory WebWorker crash.
  });

  const layerPrefix = sourceId.replace('-source', '');
  const isEarthquake = sourceId === 'selected-cems-vt-source';
  const extentFillColor = isEarthquake ? '#ff9900' : (sourceId.includes('flood') ? '#00aaff' : '#ff9900');
  const extentLineColor = isEarthquake ? '#ffff00' : (sourceId.includes('flood') ? '#3366ff' : '#ff9900');
  const defaultPolyColor = isEarthquake ? '#888888' : (sourceId.includes('flood') ? '#0000ff' : '#ff0000');

  // Add Extent Layer
  addLayerSafely(map, {
    id: `${layerPrefix}-extent-fill`,
    type: 'fill',
    source: sourceId,
    filter: ['==', 'isExtent', true],
    layout: { 'visibility': 'visible' },
    paint: {
      'fill-color': extentFillColor,
      'fill-opacity': 0.05
    }
  });

  // Add Polygons
  addLayerSafely(map, {
    id: `${layerPrefix}-polygons`,
    type: 'fill',
    source: sourceId,
    filter: ['all', ['==', '_isPolygon', true], ['!=', 'isExtent', true]],
    layout: { 'visibility': 'visible' },
    paint: {
      'fill-color': [
        'match',
        ['coalesce', ['get', 'damage_gra'], ['get', 'grading'], ['get', 'notation'], 'none'],
        'Destroyed', '#ff0000',
        'Damaged', '#ff8c00', // Adjusted to generic orange instead of mixed
        'Possibly damaged', '#ffff00',
        'No visible damage', '#888888',
        defaultPolyColor
      ],
      'fill-opacity': [
        'case',
        ['==', ['coalesce', ['get', 'obj_type'], ''], 'Not Analysed'], 0,
        ['match',
          ['coalesce', ['get', 'damage_gra'], ['get', 'grading'], ['get', 'notation'], 'none'],
          'Destroyed', 0.6,
          'Damaged', 0.6,
          'Possibly damaged', 0.6,
          'No visible damage', 0.6,
          0.25
        ]
      ]
    }
  });

  // Add Lines
  addLayerSafely(map, {
    id: `${layerPrefix}-lines`,
    type: 'line',
    source: sourceId,
    filter: ['all', 
      ['!=', 'isExtent', true], 
      ['==', '$type', 'LineString'],
      ['any',
        ['==', 'damage_gra', 'Destroyed'],
        ['==', 'damage_gra', 'Damaged'],
        ['==', 'damage_gra', 'Possibly damaged'],
        ['==', 'grading', 'Destroyed'],
        ['==', 'grading', 'Damaged'],
        ['==', 'grading', 'Possibly damaged'],
        ['==', 'notation', 'Destroyed'],
        ['==', 'notation', 'Damaged'],
        ['==', 'notation', 'Possibly damaged']
      ]
    ],
    layout: { 'visibility': 'visible' },
    paint: {
      'line-color': [
        'match',
        ['coalesce', ['get', 'damage_gra'], ['get', 'grading'], ['get', 'notation'], 'none'],
        'Destroyed', '#ff0000',
        'Damaged', '#ff8c00',
        'Possibly damaged', '#ffff00',
        'No visible damage', '#888888',
        '#888888'
      ],
      'line-width': 3,
      'line-opacity': [
        'match',
        ['coalesce', ['get', 'damage_gra'], ['get', 'grading'], ['get', 'notation'], 'none'],
        'Destroyed', 1,
        'Damaged', 1,
        'Possibly damaged', 1,
        'No visible damage', 1,
        0.25
      ]
    }
  });

  // Add Points
  addLayerSafely(map, {
    id: `${layerPrefix}-points`,
    type: 'circle',
    source: sourceId,
    filter: ['all', 
      ['!=', 'isExtent', true],
      ['==', '_isPoint', true],
      ['any',
        ['==', 'damage_gra', 'Destroyed'],
        ['==', 'damage_gra', 'Damaged'],
        ['==', 'damage_gra', 'Possibly damaged'],
        ['==', 'grading', 'Destroyed'],
        ['==', 'grading', 'Damaged'],
        ['==', 'grading', 'Possibly damaged'],
        ['==', 'notation', 'Destroyed'],
        ['==', 'notation', 'Damaged'],
        ['==', 'notation', 'Possibly damaged']
      ]
    ],
    layout: { 'visibility': 'visible' },
    paint: {
      'circle-color': [
        'match',
        ['coalesce', ['get', 'damage_gra'], ['get', 'grading'], ['get', 'notation'], 'none'],
        'Destroyed', '#ff0000',
        'Damaged', '#ff8c00',
        'Possibly damaged', '#ffff00',
        'No visible damage', '#888888',
        '#888888'
      ],
      'circle-radius': 4,
      'circle-opacity': [
        'match',
        ['coalesce', ['get', 'damage_gra'], ['get', 'grading'], ['get', 'notation'], 'none'],
        'Destroyed', 1,
        'Damaged', 1,
        'Possibly damaged', 1,
        'No visible damage', 1,
        0.25
      ],
      'circle-stroke-width': 0
    }
  });

  addLayerSafely(map, {
    id: `${layerPrefix}-extent`,
    type: 'line',
    source: sourceId,
    filter: ['==', 'isExtent', true],
    layout: {
      'line-join': 'round',
      'line-cap': 'round',
      'visibility': 'visible'
    },
    paint: {
      'line-color': extentLineColor,
      'line-width': 2,
      'line-dasharray': [2, 2]
    }
  }, null);

  addLayerSafely(map, {
    id: `${layerPrefix}-extent-loading`,
    type: 'line',
    source: sourceId,
    filter: ['all', ['==', 'isExtent', true], ['in', 'activationCode', 'NONE']],
    layout: {
      'line-join': 'round',
      'line-cap': 'round',
      'visibility': 'visible'
    },
    paint: {
      'line-color': '#ffffff',
      'line-width': 3,
      'line-dasharray': [2, 2]
    }
  }, null);
};
