import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import type { AppSettings } from '../types';
import { upgradeLegacyFilter, executeWhenStyleLoaded } from '../utils/mapUtils';

export interface MapStylingProps {
  mapContainer: React.RefObject<HTMLDivElement | null>;
  map: maplibregl.Map | null;
  mapLoaded: boolean;
  settings: AppSettings;

  originalFiltersRef: React.MutableRefObject<{ [layerId: string]: any }>;
}

export const useMapStyling = ({
  mapContainer,
  map: mapProp,
  mapLoaded,
  settings,

  originalFiltersRef
}: MapStylingProps) => {
  const initialTerrainLoaded = useRef(false);

  // Use a local ref wrapper since the original blocks use `mapRef.current`
  const mapRef = useRef<maplibregl.Map | null>(mapProp);
  useEffect(() => {
    mapRef.current = mapProp;
  }, [mapProp]);

  // Handle dynamic mapbox transitions based on settings
  useEffect(() => {
    if (!mapRef.current || !mapLoaded) return;
    const duration = settings.animationDuration ?? 2000;
    const map = mapRef.current;
    
    try {
      if (map.getLayer('custom-polygons')) map.setPaintProperty('custom-polygons', 'fill-opacity-transition', { duration });
      if (map.getLayer('custom-lines')) map.setPaintProperty('custom-lines', 'line-opacity-transition', { duration });
      if (map.getLayer('custom-lines-dashed')) map.setPaintProperty('custom-lines-dashed', 'line-opacity-transition', { duration });
      if (map.getLayer('custom-lines-dotted')) map.setPaintProperty('custom-lines-dotted', 'line-opacity-transition', { duration });
      if (map.getLayer('custom-arrow-heads')) map.setPaintProperty('custom-arrow-heads', 'text-opacity-transition', { duration });
    } catch (e) {
      // Ignore if style isn't ready
    }
  }, [settings.animationDuration, mapLoaded]);

  // Handle Map Label Density
  const lastAppliedDensityRef = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (!mapRef.current || !mapLoaded || settings.labelDensity === undefined) return;
    if (lastAppliedDensityRef.current === settings.labelDensity) return;

    if (settings.labelDensity === 100 && lastAppliedDensityRef.current === undefined) {
      lastAppliedDensityRef.current = 100;
      return;
    }

    lastAppliedDensityRef.current = settings.labelDensity;
    
    const density = settings.labelDensity;
    let style;
    try {
      style = mapRef.current.getStyle();
    } catch(e) {
      return; // Style not loaded yet, ignore
    }

    if (style && style.layers) {
      style.layers.forEach(layer => {
        if (layer.type === 'symbol' && !layer.id.startsWith('custom-')) {
          const origFilter = originalFiltersRef.current[layer.id];
          let extraCondition: any = null;

          const id = layer.id.toLowerCase();
          const sourceLayer = layer['source-layer'] ? layer['source-layer'].toLowerCase() : '';

          if (id.includes('ukraine')) {
            if (density < 100) {
              // Smooth population curve: density 0 = 2,000,000 (shows only Kyiv); density 50 = ~125,000; density 80 = ~3,200; density 100 = 0
              const minPopulation = Math.floor(2000000 * Math.pow((100 - density) / 100, 4));
              
              const popCondition = ['>=', ['coalesce', ['to-number', ['get', 'population']], 0], minPopulation];
              
              // Fallback for capitals if they exist in this dataset
              let capCondition: any[] = ['==', '1', '2'];
              if (density === 0) {
                 capCondition = ['all', ['has', 'capital'], ['==', ['get', 'capital'], 2]];
              } else if (density < 10) {
                 capCondition = ['all', ['has', 'capital'], ['<=', ['get', 'capital'], 3]]; 
              } else {
                 capCondition = ['all', ['has', 'capital'], ['>', ['get', 'capital'], 0]];
              }
              
              extraCondition = ['any', popCondition, capCondition];
            }
          } else if (id.includes('place') || sourceLayer.includes('place') || id.includes('settlement') || sourceLayer.includes('settlement') || id.includes('village') || id.includes('town') || id.includes('cit') || id.includes('capital')) {
            if (density < 100) {
              let maxRank = 1;
              if (density > 0) {
                // Use an exponential curve so that the slider is immediately sensitive.
                // At density 100: maxRank = 15
                // At density 50: maxRank = 4
                // At density 0: maxRank = 1
                maxRank = 1 + Math.floor(Math.pow(density / 100, 2) * 14);
              }

              // If a place has no rank, assign it a virtual rank based on its class
              const classBasedRank = ['case',
                ['==', ['get', 'class'], 'city'], 5,
                ['==', ['get', 'class'], 'town'], 10,
                ['==', ['get', 'class'], 'village'], 15,
                ['any',
                  ['==', ['get', 'class'], 'hamlet'],
                  ['==', ['get', 'class'], 'suburb'],
                  ['==', ['get', 'class'], 'neighbourhood'],
                  ['==', ['get', 'class'], 'isolated_dwelling']
                ], 20,
                30
              ];

              const rankCondition = ['<=', ['to-number', ['coalesce', ['get', 'symbolrank'], ['get', 'scalerank'], ['get', 'rank'], classBasedRank]], maxRank];
              
              let capCondition: any[] = ['==', '1', '2'];
              if (density === 0) {
                 capCondition = ['all', ['has', 'capital'], ['==', ['get', 'capital'], 2]]; // National capitals only
              } else if (density < 10) {
                 capCondition = ['all', ['has', 'capital'], ['<=', ['get', 'capital'], 3]]; // National + State capitals
              } else {
                 capCondition = ['all', ['has', 'capital'], ['>', ['get', 'capital'], 0]];   // All capitals
              }
              
              const isCountry = ['any', ['==', ['get', 'class'], 'country'], ['==', ['get', 'type'], 'country']];

              extraCondition = ['any', rankCondition, capCondition, isCountry];
            }
          } else if (id.includes('poi') || id.includes('transit') || sourceLayer.includes('poi') || id.includes('amenity') || id.includes('shop') || id.includes('tourism') || id.includes('leisure') || id.includes('sport') || id.includes('attraction') || id.includes('airport') || id.includes('station') || id.includes('historic') || sourceLayer.includes('amenity') || sourceLayer.includes('shop') || sourceLayer.includes('tourism') || sourceLayer.includes('leisure')) {
            if (density < 15) {
              extraCondition = ['==', 1, 2]; // Hide
            } else if (density < 100) {
              const maxScaleRank = 1 + Math.floor(((density - 15) / 85) * 9);
              extraCondition = ['<=', ['coalesce', ['get', 'scalerank'], ['get', 'rank'], 10], maxScaleRank];
            }
          } else if (id.includes('road') || id.includes('water') || id.includes('natural') || id.includes('highway') || id.includes('path') || id.includes('trail')) {
            if (density < 5) {
              extraCondition = ['==', 1, 2]; // Hide
            }
          }

          let finalFilter = origFilter;
          if (extraCondition) {
            finalFilter = origFilter ? ['all', upgradeLegacyFilter(origFilter), extraCondition] : extraCondition;
          }
          
          try {
            mapRef.current!.setFilter(layer.id, finalFilter);
          } catch(e) {
            console.error('Label density filter error:', e, layer.id, finalFilter);
          }
        }
      });
    }
  }, [settings.labelDensity, mapLoaded]);

  // 3D Terrain & Environment
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    try {
      if (settings.enable3dTerrain) {
        if (!map.getSource('aws-terrarium')) {
          map.addSource('aws-terrarium', {
            type: 'raster-dem',
            tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
            encoding: 'terrarium',
            tileSize: 256,
            maxzoom: 15
          });
        }
        map.setTerrain({ source: 'aws-terrarium', exaggeration: settings.terrainExaggeration ?? 1 });

        if (!initialTerrainLoaded.current) {
          initialTerrainLoaded.current = true;
          let userMoved = false;
          const onMove = (e: any) => { if (e.originalEvent) userMoved = true; };
          map.once('movestart', onMove);
          map.once('idle', () => {
            const currentCenter = map.getCenter();
            const dist = Math.sqrt(
              Math.pow(currentCenter.lng - settings.defaultView.center[0], 2) + 
              Math.pow(currentCenter.lat - settings.defaultView.center[1], 2)
            );
            if (!userMoved && dist < 0.1) {
              map.jumpTo({
                center: settings.defaultView.center,
                zoom: settings.defaultView.zoom,
                pitch: settings.defaultView.pitch,
                bearing: settings.defaultView.bearing,
                ...(settings.defaultView.elevation !== undefined ? { elevation: settings.defaultView.elevation } : {})
              });
            }
            map.off('movestart', onMove);
          });
        }

        if (settings.enableHillshade) {
          const shadowOp = settings.hillshadeShadowOpacity ?? 0.5;
          const highlightOp = settings.hillshadeHighlightOpacity ?? 0.5;
          const shadowColor = `rgba(0,0,0,${shadowOp})`;
          const highlightColor = `rgba(255,255,255,${highlightOp})`;
          const accentColor = `rgba(0,0,0,${shadowOp})`;

          if (!map.getLayer('aws-terrarium-hillshade')) {
            let insertBeforeId;
            const layers = map.getStyle().layers;
            // Find the first water layer so we can insert the hillshade underneath it.
            // This allows the water layer's opacity to mask out underwater terrain.
            for (let i = 0; i < layers.length; i++) {
              if (layers[i].id.includes('water')) {
                insertBeforeId = layers[i].id;
                break;
              }
            }
            if (!insertBeforeId) {
              for (let i = 0; i < layers.length; i++) {
                if (layers[i].type === 'symbol') {
                  insertBeforeId = layers[i].id;
                  break;
                }
              }
            }

            map.addLayer({
              id: 'aws-terrarium-hillshade',
              type: 'hillshade',
              source: 'aws-terrarium',
              paint: {
                'hillshade-exaggeration': 0.5,
                'hillshade-shadow-color': shadowColor,
                'hillshade-highlight-color': highlightColor,
                'hillshade-accent-color': accentColor
              }
            }, insertBeforeId);
          } else {
            map.setPaintProperty('aws-terrarium-hillshade', 'hillshade-shadow-color', shadowColor);
            map.setPaintProperty('aws-terrarium-hillshade', 'hillshade-highlight-color', highlightColor);
            map.setPaintProperty('aws-terrarium-hillshade', 'hillshade-accent-color', accentColor);
          }
        } else {
          if (map.getLayer('aws-terrarium-hillshade')) {
            map.removeLayer('aws-terrarium-hillshade');
          }
        }

        if (map.getSky && map.getSky()) {
           map.setSky(undefined as any);
        }
        if (mapContainer.current) {
          mapContainer.current.style.backgroundColor = settings.enableSky ? (settings.skyColor || '#88C6FC') : '';
        }

      } else {
        map.setTerrain(null);
        if (map.getLayer('aws-terrarium-hillshade')) {
          map.removeLayer('aws-terrarium-hillshade');
        }
        if (map.getSky && map.getSky()) {
           map.setSky(undefined as any);
        }
      }
    } catch (e) {
      console.warn("Could not apply 3D terrain styling (style might not be loaded yet)");
    }
  }, [mapLoaded, settings.enable3dTerrain, settings.terrainExaggeration, settings.enableHillshade, settings.hillshadeShadowOpacity, settings.hillshadeHighlightOpacity, settings.enableSky, settings.skyColor]);

  // Water Layer Styling
  const lastWaterColorRef = useRef<string | undefined>(undefined);
  const lastWaterOpacityRef = useRef<number | undefined>(undefined);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    
    try {
      // Only apply to styles that use the standard 'water' fill layer when style is loaded
      if (map.getStyle() && map.getLayer('water')) {
        if (settings.waterColor !== undefined && lastWaterColorRef.current !== settings.waterColor) {
          lastWaterColorRef.current = settings.waterColor;
          map.setPaintProperty('water', 'fill-color', settings.waterColor);
        }
        if (settings.waterOpacity !== undefined && lastWaterOpacityRef.current !== settings.waterOpacity) {
          lastWaterOpacityRef.current = settings.waterOpacity;
          map.setPaintProperty('water', 'fill-opacity', settings.waterOpacity);
        }
      }
    } catch (e) {
      console.warn("Could not apply water layer styling (style might not be loaded yet)");
    }
  }, [mapLoaded, settings.waterColor, settings.waterOpacity, settings.mapStyle]);

  // Dynamic Map Style & Solid Background Color Handler
  const defaultStyleStr = 'https://tiles.openfreemap.org/styles/liberty';
  const currentMapStyleRef = useRef<string | null>(defaultStyleStr);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    const effectiveStyle = settings.mapStyle || defaultStyleStr;
    const newStyleStr = typeof effectiveStyle === 'string' ? effectiveStyle : JSON.stringify(effectiveStyle);

    if (currentMapStyleRef.current === newStyleStr) return;

    try {
      if (typeof settings.mapStyle === 'string' && settings.mapStyle.startsWith('solid:')) {
        const color = settings.mapStyle.replace('solid:', '');
        
        // If the map is already in solid color mode (has solid-bg-layer), update color directly
        if (map.getStyle() && map.getLayer('solid-bg-layer')) {
          map.setPaintProperty('solid-bg-layer', 'background-color', color);
          currentMapStyleRef.current = newStyleStr;
          return;
        }
        
        // Otherwise replace tile basemap with solid background style
        currentMapStyleRef.current = newStyleStr;
        map.setStyle({
          version: 8,
          sources: {},
          layers: [
            {
              id: 'solid-bg-layer',
              type: 'background',
              paint: {
                'background-color': color
              }
            }
          ]
        }, { diff: false });
        return;
      }

      // Normal style URL or JSON
      currentMapStyleRef.current = newStyleStr;
      let finalStyle: any = settings.mapStyle || defaultStyleStr;
      map.setStyle(finalStyle, { diff: false });
    } catch (e) {
      console.warn("Could not update map style dynamically", e);
    }
  }, [mapLoaded, settings.mapStyle]);

  // Map Projection (Globe vs Mercator)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    try {
      if (typeof (map as any).setProjection === 'function') {
        executeWhenStyleLoaded(map, () => {
          (map as any).setProjection({ type: settings.projection === 'globe' ? 'globe' : 'mercator' });
        });
      }
    } catch (e) {
      console.warn("Failed to set map projection", e);
    }
  }, [mapLoaded, settings.projection]);
};
