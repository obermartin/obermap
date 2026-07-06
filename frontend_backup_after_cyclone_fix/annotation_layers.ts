        }
      }

      // Add custom annotations source
      map.addSource('custom-annotations', {
        type: 'geojson',
        promoteId: 'featureId',
        data: { type: 'FeatureCollection', features: [] }
      });

      map.addLayer({
        id: 'custom-polygons',
        type: 'fill',
        source: 'custom-annotations',
        filter: ['==', '$type', 'Polygon'],
        paint: {
          'fill-opacity': ['coalesce', ['get', 'currentOpacity'], ['get', 'fillOpacity'], 0.5],
          'fill-opacity-transition': { duration: 0 },
          'fill-color': ['coalesce', ['get', 'color'], '#ffffff']
        }
      }, firstSymbolId);



      // Add Icons for Flights Layer
      const loadIcon = (name: string, svg: string) => {
        const img = new Image();
        img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
        img.onload = () => {
          if (!map.hasImage(name)) map.addImage(name, img, { sdf: true });
        };
      };

      loadIcon('airplane', `
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="#ffffff" stroke="none">
          <path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"/>
        </svg>
      `);

      loadIcon('helicopter', `
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
          <ellipse cx="12" cy="14" rx="2.5" ry="5" fill="#ffffff" />
          <rect x="11.5" y="18" width="1" height="5" fill="#ffffff" />
          <rect x="9" y="21" width="6" height="1.5" fill="#ffffff" />
          <circle cx="12" cy="14" r="8" fill="none" stroke="#ffffff" stroke-width="0.5" />
          <path d="M4 14 L20 14 M12 6 L12 22" stroke="#ffffff" stroke-width="1.2" />
        </svg>
      `);

      loadIcon('small_aircraft', `
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
          <ellipse cx="12" cy="12" rx="2" ry="8" fill="#ffffff" />
          <rect x="3" y="8" width="18" height="2.5" fill="#ffffff" rx="1" />
          <rect x="8" y="18" width="8" height="2" fill="#ffffff" rx="0.5" />
        </svg>
      `);

      loadIcon('military', `
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
          <path d="M12 2 L14 12 L22 16 L22 18 L13 16 L12 21 L11 16 L2 18 L2 16 L10 12 Z" fill="#ffffff" />
        </svg>
      `);

      // Add Icons for Vessels Layer
      loadIcon('ship-fast', `
        <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28">
          <path d="M14 1 L25 25 L14 19 L3 25 Z" fill="#ffffff" />
        </svg>
      `);
      loadIcon('ship-slow', `
        <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28">
          <path d="M14 1 L25 25 L14 19 L3 25 Z" fill="#ffffff" />
        </svg>
      `);
      loadIcon('ship-still', `
        <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28">
          <path d="M14 1 L25 25 L14 19 L3 25 Z" fill="none" stroke="#ffffff" stroke-width="1.5" />
        </svg>
      `);
      loadIcon('wind-arrow', `
        <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28">
          <path d="M14 2 L24 24 L14 18 L4 24 Z" fill="#ffffff" />
        </svg>
      `);

      // Add clip layer for hiding mapbox symbols under highlights
      map.addSource('highlight-clip-source', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
      });

          /* MapLibre does not support the clip layer type yet.
          map.addLayer({
            id: 'highlight-clip-layer',
            type: 'clip',
            source: 'highlight-clip-source',
            layout: {
              'clip-layer-types': ['symbol']
            }
          } as any);
          */

      // Add Flight Track source and layer
      map.addSource('selected-flight-track', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
      });
      
      map.addLayer({
        id: 'selected-flight-track-layer',
        type: 'line',
        source: 'selected-flight-track',
        layout: {
          'line-cap': 'round',
          'line-join': 'round'
        },
        paint: {
          'line-color': '#ffffff',
          'line-width': 4,
          'line-opacity': 0.5
        }
      });

      // Add Cyclone Geometry source and layers
      map.addSource('selected-cyclone-geometry', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
      });
      
      map.addLayer({
        id: 'selected-cyclone-cone',
        type: 'fill',
        source: 'selected-cyclone-geometry',
        filter: ['==', '$type', 'Polygon'],
        paint: {
          'fill-color': '#ffffff',
          'fill-opacity': ['*', 0.15, ['coalesce', ['get', '_dynamicOpacity'], 1.0]]
        }
      });

      map.addLayer({
        id: 'selected-cyclone-track',
        type: 'line',
        source: 'selected-cyclone-geometry',
        filter: ['==', '$type', 'LineString'],
        layout: {
          'line-cap': 'round',
          'line-join': 'round'
        },
        paint: {
          'line-color': '#ffffff',
          'line-width': 2,
          'line-opacity': 0.8,
          'line-dasharray': [2, 2]
        }
      });

      map.addLayer({
        id: 'selected-cyclone-point',
        type: 'circle',
        source: 'selected-cyclone-geometry',
        filter: ['==', '$type', 'Point'],
        paint: {
          'circle-radius': [
            'interpolate', ['linear'], ['coalesce', ['get', 'severity'], 5],
            4, 4,
            9, 16
          ],
          'circle-color': [
            'match',
            ['get', 'alertlevel'],
            'Red', '#ff0000',
            'Orange', '#ff9900',
            'Green', '#00ff00',
            '#ffffff'
          ],
          'circle-opacity': 1.0,
          'circle-stroke-width': 2,
          'circle-stroke-color': '#ffffff'
        }
      });

      // Add Vessel Track source and layer
      map.addSource('selected-vessel-track', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
      });
      
      map.addLayer({
        id: 'selected-vessel-track-layer',
        type: 'line',
        source: 'selected-vessel-track',
        layout: {
          'line-cap': 'round',
          'line-join': 'round'
        },
        paint: {
          'line-color': '#ffffff',
          'line-width': 3,
          'line-opacity': 0.8
        }
      });

      // Lines (Paint & Measure & Outlines & Arrows)
      map.addLayer({
        id: 'custom-lines',
        type: 'line',
        source: 'custom-annotations',
        filter: ['any', ['!', ['has', 'strokeType']], ['==', ['get', 'strokeType'], 'solid']],
        layout: {
          'line-cap': 'round',
          'line-join': 'round'
        },
        paint: {
          'line-width': 6,
          'line-color': ['coalesce', ['get', 'color'], '#ffffff'],
          'line-opacity': ['coalesce', ['get', 'currentLineOpacity'], 1],
          'line-opacity-transition': { duration: 0 }
        }
      }, firstSymbolId);

      map.addLayer({
        id: 'custom-lines-dashed',
        type: 'line',
        source: 'custom-annotations',
        filter: ['==', ['get', 'strokeType'], 'dashed'],
        layout: {
          'line-cap': 'round',
          'line-join': 'round'
        },
        paint: {
          'line-width': 6,
          'line-color': ['coalesce', ['get', 'color'], '#ffffff'],
          'line-dasharray': [2, 2],
          'line-opacity': ['coalesce', ['get', 'currentLineOpacity'], 1],
          'line-opacity-transition': { duration: 0 }
        }
      }, firstSymbolId);

      map.addLayer({
        id: 'custom-lines-dotted',
        type: 'line',
        source: 'custom-annotations',
        filter: ['==', ['get', 'strokeType'], 'dotted'],
        layout: {
          'line-cap': 'round',
          'line-join': 'round'
        },
        paint: {
          'line-width': 6,
          'line-color': ['coalesce', ['get', 'color'], '#ffffff'],
          'line-dasharray': [0.01, 2.5],
          'line-opacity': ['coalesce', ['get', 'currentLineOpacity'], 1],
          'line-opacity-transition': { duration: 0 }
        }
      }, firstSymbolId);

      // Arrow Heads
      map.addLayer({
        id: 'custom-arrow-heads',
        type: 'symbol',
        source: 'custom-annotations',
        filter: ['==', ['get', '$type'], 'ArrowHead'],
        layout: {
          'text-field': [
            'case',
            ['==', ['get', 'strokeType'], 'solid'],
            '▲',
            '△'
          ],
          'text-size': 80,
          'text-rotate': ['get', 'bearing'],
          'text-rotation-alignment': 'map',
          'text-pitch-alignment': 'map',
          'text-allow-overlap': true,
          'text-ignore-placement': true,
          'text-anchor': 'center'
        },
        paint: {
          'text-color': ['coalesce', ['get', 'color'], '#ffffff'],
          'text-opacity': ['coalesce', ['get', 'currentLineOpacity'], 1],
          'text-opacity-transition': { duration: 0 }
        }
      }, firstSymbolId);

      // Invisible layer to force Mapbox's collision detection to hide underlying labels
      map.addLayer({
        id: 'annotation-collision-layer',
        type: 'symbol',
        source: 'custom-annotations',
        filter: ['==', ['get', 'type'], 'invisible-collision-box'],
        layout: {
          'text-field': ['get', 'text'],
          'text-font': settings.replaceGothamFont !== false ? ['Gotham Bold', 'Arial Unicode MS Regular'] : ['Arial Unicode MS Regular'],
          'text-size': 14,
          'text-transform': 'uppercase',
          'text-allow-overlap': true,
          'text-ignore-placement': false,
          'text-anchor': 'left',
          'text-offset': [1.5, 0]
        },
        paint: {
          'text-color': 'rgba(0,0,0,0)',
          'text-halo-color': 'rgba(0,0,0,0)',
          'text-halo-width': 2
        }
      });

      // WebGL Annotations fallback removed in favor of 2D Canvas Compositor

      // Setup complete
      setMapLoaded(true);
      
      // Selected Annotation Glow
      map.addLayer({
        id: 'custom-selected-glow',
        type: 'line',
        source: 'custom-annotations',
        filter: ['==', 'id', 'none'],
        paint: {
          'line-width': 12,
          'line-color': '#ffffff',
          'line-blur': 8,
          'line-opacity': 0.8
        }
      }, firstSymbolId);

      // Selected Annotation Highlight
      map.addLayer({
        id: 'custom-selected-line',
        type: 'line',
        source: 'custom-annotations',
        filter: ['==', 'id', 'none'],
        paint: {
          'line-width': 8,
          'line-color': '#ffffff',
          'line-dasharray': [2, 2]
        }
      }, firstSymbolId);

      // Active drawing source
      map.addSource('active-drawing', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
      });
      map.addLayer({
        id: 'active-drawing-line',
        type: 'line',
        source: 'active-drawing',
        paint: { 'line-width': 6, 'line-color': ['coalesce', ['get', 'color'], '#ffffff'], 'line-dasharray': [2, 2] }
      });
      map.addLayer({
        id: 'active-drawing-fill',
        type: 'fill',
        source: 'active-drawing',
        filter: ['==', '$type', 'Polygon'],
        paint: { 'fill-opacity': 0.3, 'fill-color': ['coalesce', ['get', 'color'], '#ffffff'] }
      });

      // Selected GeoJSON feature highlighting
      map.addSource('selected-geojson-feature', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
      });
      map.addLayer({
        id: 'geojson-selected-glow',
        type: 'line',
        source: 'selected-geojson-feature',
        paint: {
          'line-width': 12,
          'line-color': '#ffffff',
          'line-blur': 8,
          'line-opacity': 0.8
        }
      }, firstSymbolId);
      map.addLayer({
        id: 'geojson-selected-line',
        type: 'line',
        source: 'selected-geojson-feature',
        paint: {
          'line-width': 8,
          'line-color': '#ffffff',
          'line-dasharray': [2, 2]
        }
      }, firstSymbolId);
    });

    // Add flyTo listener
    const handleFlyTo = ((e: CustomEvent<{ viewId: string, view: Annotation['view'] }>) => {
      const { viewId, view } = e.detail;
      if (view && mapRef.current) {
        if (viewId === 'overview') {
          triggerProgressRef.current = {};
          triggerTimestampsRef.current = {};
          setRevealedTriggers(new Set());
          setHiddenTriggers(new Set());
        } else {
          triggerProgressRef.current[viewId] = 0;
          triggerTimestampsRef.current[viewId] = Date.now();
          setRevealedTriggers(prev => {
            const next = new Set(prev);
