import maplibregl from 'maplibre-gl';

import type { AppSettings } from '../types';

export const setupCustomMapLayers = (map: maplibregl.Map, initFirstAdminId?: string, firstSymbolId?: string, mapRef?: React.MutableRefObject<maplibregl.Map | null>, setMapLoaded?: (b: boolean) => void, settings?: AppSettings) => {
// Add custom annotations source
      if (!map.getSource('custom-annotations')) {
        map.addSource('custom-annotations', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] }
        });
      }

      if (!map.getLayer('custom-polygons')) {
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
        }, initFirstAdminId || firstSymbolId);
      }

// Add clip layer for hiding mapbox symbols under highlights
      if (!map.getSource('highlight-clip-source')) {
        map.addSource('highlight-clip-source', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] }
        });
      }

      // Add Flight Track source and layer
      if (!map.getSource('selected-flight-track')) {
        map.addSource('selected-flight-track', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] }
        });
      }
      
      if (!map.getLayer('selected-flight-track-layer')) {
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
      }

      // Add Automated Flight Tracks shadow source and layer
      if (!map.getSource('automated-flight-tracks-shadow')) {
        map.addSource('automated-flight-tracks-shadow', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] }
        });
      }
      
      if (!map.getLayer('automated-flight-tracks-shadow-layer')) {
        map.addLayer({
          id: 'automated-flight-tracks-shadow-layer',
          type: 'line',
          source: 'automated-flight-tracks-shadow',
          layout: {
            'line-cap': 'round',
            'line-join': 'round'
          },
          paint: {
            'line-color': ['coalesce', ['get', 'color'], '#000000'],
            'line-width': 3,
            'line-opacity': 0.5
          }
        });
      }

      // Add Cyclone Geometry source and layers
      if (!map.getSource('selected-cyclone-geometry')) {
        map.addSource('selected-cyclone-geometry', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] }
        });
      }
      
      if (!map.getLayer('selected-cyclone-cone')) {
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
      }

      if (!map.getLayer('selected-cyclone-track')) {
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
      }

      if (!map.getLayer('selected-cyclone-point')) {
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
      }

      // Add Vessel Track source and layer
      if (!map.getSource('selected-vessel-track')) {
        map.addSource('selected-vessel-track', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] }
        });
      }
      
      if (!map.getLayer('selected-vessel-track-layer')) {
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
      }

      if (!map) return;
        if (!map.getSource('custom-lines-source')) {
          map.addSource('custom-lines-source', {
            type: 'geojson',
            data: { type: 'FeatureCollection', features: [] }
          });
        }

        // Add 3D models layer first so it's under labels
        if (!mapRef || !mapRef.current || mapRef.current !== map) return;

        // Add custom annotations source
        if (!map.getSource('custom-annotations')) {
          map.addSource('custom-annotations', {
            type: 'geojson',
            data: { type: 'FeatureCollection', features: [] }
          });
        }

        if (!map.getLayer('custom-polygons')) {
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
          }, initFirstAdminId || firstSymbolId);
        }

        // Lines (Paint & Measure & Outlines & Arrows)
        if (!map.getLayer('custom-lines-solid')) {
          map.addLayer({
            id: 'custom-lines-solid',
            type: 'line',
            source: 'custom-lines-source',
            filter: ['all', ['!=', ['get', 'strokeType'], 'dashed'], ['!=', ['get', 'strokeType'], 'dotted']],
            layout: {
              'line-cap': 'round',
              'line-join': 'round'
            },
            paint: {
              'line-width': 6,
              'line-color': ['coalesce', ['get', 'color'], '#ffffff'],
              'line-opacity': 1
            }
          });
        }

        if (!map.getLayer('custom-lines-dashed-new')) {
          map.addLayer({
            id: 'custom-lines-dashed-new',
            type: 'line',
            source: 'custom-lines-source',
            filter: ['==', ['get', 'strokeType'], 'dashed'],
            layout: {
              'line-cap': 'round',
              'line-join': 'round'
            },
            paint: {
              'line-width': 6,
              'line-color': ['coalesce', ['get', 'color'], '#ffffff'],
              'line-dasharray': [2, 2],
              'line-opacity': 1
            }
          });
        }

        if (!map.getLayer('custom-lines-dotted-new')) {
          map.addLayer({
            id: 'custom-lines-dotted-new',
            type: 'line',
            source: 'custom-lines-source',
            filter: ['==', ['get', 'strokeType'], 'dotted'],
            layout: {
              'line-cap': 'round',
              'line-join': 'round'
            },
            paint: {
              'line-width': 6,
              'line-color': ['coalesce', ['get', 'color'], '#ffffff'],
              'line-dasharray': [0.01, 2.5],
              'line-opacity': 1
            }
          });
        }

        // Arrow Heads
        if (!map.getLayer('custom-arrow-heads')) {
          map.addLayer({
            id: 'custom-arrow-heads',
            type: 'symbol',
            source: 'custom-annotations',
            filter: ['==', ['get', '_type'], 'ArrowHead'],
            layout: {
              'text-field': [
                'case',
                ['==', ['get', 'strokeType'], 'solid'],
                '▲',
                '△'
              ],
              'text-font': ['Open Sans Regular', 'Arial Unicode MS Regular'],
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
          });
        }

        // Invisible layer to force Mapbox's collision detection to hide underlying labels
        if (!map.getLayer('annotation-collision-layer')) {
          map.addLayer({
            id: 'annotation-collision-layer',
            type: 'symbol',
            source: 'custom-annotations',
            filter: ['==', ['get', 'type'], 'invisible-collision-box'],
            layout: {
              'text-field': ['get', 'text'],
              'text-font': settings?.replaceGothamFont !== false ? ['Gotham Condensed Bold', 'Arial Unicode MS Regular'] : ['Arial Unicode MS Regular'],
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
        }

        // Selected Annotation Glow
        if (!map.getLayer('custom-selected-glow')) {
          map.addLayer({
            id: 'custom-selected-glow',
            type: 'line',
            source: 'custom-lines-source',
            filter: ['==', ['get', 'id'], 'none'],
            paint: {
              'line-width': 12,
              'line-color': '#ffffff',
              'line-blur': 8,
              'line-opacity': 0.8
            }
          });
        }

        // Selected Annotation Highlight
        if (!map.getLayer('custom-selected-line')) {
          map.addLayer({
            id: 'custom-selected-line',
            type: 'line',
            source: 'custom-lines-source',
            filter: ['==', ['get', 'id'], 'none'],
            paint: {
              'line-width': 8,
              'line-color': '#ffffff',
              'line-dasharray': [2, 2]
            }
          });
        }

        // Active drawing source
        if (!map.getSource('active-drawing')) {
          map.addSource('active-drawing', {
            type: 'geojson',
            data: { type: 'FeatureCollection', features: [] }
          });
        }
        if (!map.getLayer('active-drawing-line')) {
          map.addLayer({
            id: 'active-drawing-line',
            type: 'line',
            source: 'active-drawing',
            paint: { 'line-width': 6, 'line-color': ['coalesce', ['get', 'color'], '#ffffff'], 'line-dasharray': [2, 2] }
          });
        }
        if (!map.getLayer('active-drawing-fill')) {
          map.addLayer({
            id: 'active-drawing-fill',
            type: 'fill',
            source: 'active-drawing',
            filter: ['==', '$type', 'Polygon'],
            paint: { 'fill-opacity': 0.3, 'fill-color': ['coalesce', ['get', 'color'], '#ffffff'] }
          });
        }

        // Selected GeoJSON feature highlighting
        if (!map.getSource('selected-geojson-feature')) {
          map.addSource('selected-geojson-feature', {
            type: 'geojson',
            data: { type: 'FeatureCollection', features: [] }
          });
        }
        if (!map.getLayer('geojson-selected-glow')) {
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
          });
        }
        if (!map.getLayer('geojson-selected-line')) {
          map.addLayer({
            id: 'geojson-selected-line',
            type: 'line',
            source: 'selected-geojson-feature',
            paint: {
              'line-width': 8,
              'line-color': '#ffffff',
              'line-dasharray': [2, 2]
            }
          });
        }

        if (setMapLoaded) setMapLoaded(true);
};
