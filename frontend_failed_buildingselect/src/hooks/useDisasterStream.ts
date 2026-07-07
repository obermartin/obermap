import { useEffect, useState, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import type { AppSettings } from '../types';
import along from '@turf/along';
import { parseWKT, safeFetchCemsJson } from '../utils/mapUtils';
import turfLength from '@turf/length';
import lineSlice from '@turf/line-slice';


export interface DisasterStreamProps {
  map: maplibregl.Map | null;
  mapLoaded: boolean;
  settings: AppSettings;
  selectedCycloneId: any;
  cycloneTimelinePercent: number;
  setCycloneTimelinePercent: (val: number) => void;
  selectedCemsEarthquake: any;
  selectedEarthquake: any;
  selectedVolcano: any;
  getEffectiveLayerDates: (layer: any) => { effectiveStartDate: string; effectiveEndDate: string; };
  selectedEarthquakeShakemap: any;
  selectedCemsEarthquakeFeatures: any;
  activeCemsWildfireFeatures: any;
  setActiveCemsWildfireFeatures: (val: any) => void;
  activeCemsFloodFeatures: any;
  setActiveCemsFloodFeatures: (val: any) => void;
  selectedVolcanoPolygon: any;
  activeDrawMarkersRef: React.MutableRefObject<{ [id: string]: maplibregl.Marker }>;
  selectionMarkersRef: React.MutableRefObject<{ [id: string]: maplibregl.Marker }>;

}

export const useDisasterStream = ({
  map,
  mapLoaded,
  settings,
  selectedCycloneId,
  cycloneTimelinePercent,
  setCycloneTimelinePercent,
  selectedCemsEarthquake,
  selectedEarthquake,
  selectedVolcano,
  getEffectiveLayerDates,
  selectedEarthquakeShakemap,
  selectedCemsEarthquakeFeatures,
  activeCemsWildfireFeatures,
  setActiveCemsWildfireFeatures,
  activeCemsFloodFeatures,
  setActiveCemsFloodFeatures,
  selectedVolcanoPolygon,
  activeDrawMarkersRef,
  selectionMarkersRef,

}: DisasterStreamProps) => {
  const [cycloneRawData, setCycloneRawData] = useState<any>(null);
  const allCemsActivationsRef = useRef<Promise<any> | null>(null);
  const cemsFeatureCacheRef = useRef<Record<string, any>>({});

  // Fetch geometry when selectedCycloneId changes
  useEffect(() => {
    
    if (!map || !mapLoaded) return;
    
    const source = map.getSource('selected-cyclone-geometry') as maplibregl.GeoJSONSource;
    if (!source) return;

    if (!selectedCycloneId) {
      source.setData({ type: 'FeatureCollection', features: [] });
      return;
    }

    const fetchGeometry = async () => {
      try {
        const cycloneLayer = settings.layers.find(l => l.type === 'gdacs_cyclones');
        if (!cycloneLayer || !cycloneLayer.visible) {
          source.setData({ type: 'FeatureCollection', features: [] });
          return;
        }

        const url = `https://www.gdacs.org/gdacsapi/api/polygons/getgeometry?eventtype=TC&eventid=${selectedCycloneId.id}&episodeid=${selectedCycloneId.ep}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error('Failed to fetch cyclone geometry');
        
        const data = await res.json();
        if (data && data.features) {
          setCycloneRawData(data);
          setCycloneTimelinePercent(100);
        } else {
          setCycloneRawData(null);
          source.setData({ type: 'FeatureCollection', features: [] });
        }
      } catch (err) {
        console.error('Error fetching cyclone geometry:', err);
        setCycloneRawData(null);
        source.setData({ type: 'FeatureCollection', features: [] });
      }
    };

    fetchGeometry();
  }, [selectedCycloneId, mapLoaded, settings.layers]);

  // Effect to process and render the cyclone track based on the timeline slider
  useEffect(() => {
    
    if (!map || !mapLoaded || !selectedCycloneId || !cycloneRawData) return;
    
    const source = map.getSource('selected-cyclone-geometry') as maplibregl.GeoJSONSource;
    if (!source) return;

    try {
      // 1. Extract and combine all LineString segments into one continuous track
      const lineFeatures = cycloneRawData.features.filter((f: any) => f.geometry.type === 'LineString');
      
      const segments = lineFeatures.map((f: any) => f.geometry.coordinates);
      const allCoordinates: number[][] = [];
      
      if (segments.length > 0) {
        const isSamePoint = (p1: number[], p2: number[]) => Math.abs(p1[0] - p2[0]) < 0.01 && Math.abs(p1[1] - p2[1]) < 0.01;
        const stitched = [...segments[0]];
        const used = new Set([0]);
        
        let added = true;
        while(added) {
          added = false;
          for (let i = 1; i < segments.length; i++) {
            if (used.has(i)) continue;
            const seg = segments[i];
            
            // Check if seg connects to the end of stitched
            if (isSamePoint(stitched[stitched.length - 1], seg[0])) {
              stitched.push(...seg.slice(1));
              used.add(i);
              added = true;
            } 
            // Check if seg connects to the beginning of stitched
            else if (isSamePoint(stitched[0], seg[seg.length - 1])) {
              stitched.unshift(...seg.slice(0, -1));
              used.add(i);
              added = true;
            }
          }
        }

        // Unwrap longitudes for Mapbox to avoid drawing across the entire map at the date line
        let prevLon: number | null = null;
        stitched.forEach(coord => {
          let lon = coord[0];
          const lat = coord[1];
          if (prevLon !== null) {
            while (lon - prevLon > 180) lon -= 360;
            while (lon - prevLon < -180) lon += 360;
          }
          prevLon = lon;
          
          if (allCoordinates.length === 0) {
            allCoordinates.push([lon, lat]);
          } else {
            const last = allCoordinates[allCoordinates.length - 1];
            if (last[0] !== lon || last[1] !== lat) {
              allCoordinates.push([lon, lat]);
            }
          }
        });
      }

      if (allCoordinates.length < 2) {
        // Not enough data for a track, just render whatever we have
        source.setData(cycloneRawData);
        return;
      }

      const masterTrack = {
        type: 'Feature' as const,
        geometry: {
          type: 'LineString' as const,
          coordinates: allCoordinates
        },
        properties: lineFeatures[0]?.properties || {}
      };

      const trackLength = turfLength(masterTrack, { units: 'kilometers' });
      const currentDistance = trackLength * (cycloneTimelinePercent / 100);

      // 2. Interpolate current point
      const currentPoint = along(masterTrack, currentDistance, { units: 'kilometers' });
      // Change its class to Point_Centroid so it matches the layer filter for rendering the circle
      currentPoint.properties = { ...masterTrack.properties, Class: 'Point_Centroid' };

      // 3. Slice the track from start to current point
      let currentTrack;
      if (cycloneTimelinePercent <= 0) {
        // At 0%, track is just a point or very short line, so don't render a track
        currentTrack = { ...masterTrack, geometry: { type: 'LineString', coordinates: [] } };
      } else if (cycloneTimelinePercent >= 100) {
        currentTrack = masterTrack;
      } else {
        const startPoint = { type: 'Feature', geometry: { type: 'Point', coordinates: allCoordinates[0] } };
        currentTrack = lineSlice(startPoint as any, currentPoint, masterTrack);
      }

      // Restore class for the track
      currentTrack.properties = { ...currentTrack.properties, Class: 'Line_Line_1' };

      // 4. Handle the Cone of Uncertainty
      const coneFeature = cycloneRawData.features.find((f: any) => f.properties?.Class === 'Poly_Cones');
      
      const featuresToRender: any[] = [currentPoint, currentTrack];
      if (coneFeature) {
        // We render the cone and adjust its opacity in paint properties dynamically,
        // but since we can't easily animate layer properties here without creating a new layer,
        // we'll inject a dynamic property into the GeoJSON feature!
        const coneOpacity = Math.max(0, (cycloneTimelinePercent - 80) / 20); // fade in from 80% to 100%
        coneFeature.properties = { ...coneFeature.properties, _dynamicOpacity: coneOpacity };
        featuresToRender.push(coneFeature);
      }

      source.setData({
        type: 'FeatureCollection',
        features: featuresToRender
      });
    } catch (e) {
      console.error('Error processing cyclone timeline:', e);
      source.setData(cycloneRawData);
    }
  }, [cycloneTimelinePercent, cycloneRawData, selectedCycloneId, mapLoaded]);

  // Fetch detailed CEMS activation when selectedCemsEarthquake changes

  // Fetch detailed CEMS activations for wildfires in the date range
  useEffect(() => {
    const wildfireLayer = settings.layers.find(l => l.type === 'wildfires');
    if (!wildfireLayer || !wildfireLayer.visible || !wildfireLayer.copernicusEnabled) {
      if (activeCemsWildfireFeatures) setActiveCemsWildfireFeatures(null);
      return;
    }

    let isSubscribed = true;
    const { effectiveStartDate, effectiveEndDate } = getEffectiveLayerDates(wildfireLayer);
    
    (async () => {
      try {
        if (!allCemsActivationsRef.current) {
          allCemsActivationsRef.current = fetch(`https://rapidmapping.emergency.copernicus.eu/backend/dashboard-api/public-activations-info/?limit=2000`)
            .then(res => {
              if (!res.ok) throw new Error('Failed to fetch CEMS activations');
              return res.json();
            })
            .then(data => data?.results || []);
        }
        
        let activations;
        try {
          // Await the promise (it might be already resolved, or currently fetching)
          activations = await allCemsActivationsRef.current;
          console.log('[CEMS Debug] Fetched global activations count:', activations?.length);
        } catch (err) {
          console.error('[CEMS Debug] Failed to fetch global activations:', err);
          allCemsActivationsRef.current = null; // reset on error
          return;
        }
        if (!activations) return;

        // Filter for Wildfires in date range
        const sDate = new Date(effectiveStartDate).getTime();
        const eDate = new Date(effectiveEndDate).getTime() + 24*60*60*1000 - 1; // End of day

        const matchingActivations = activations.filter((act: any) => {
          if (act.category !== 'Wildfire') return false;
          const actTime = new Date(act.eventTime || act.activationTime).getTime();
          // allow a small buffer, e.g., 7 days before and after
          const buffer = 7 * 24 * 60 * 60 * 1000;
          return actTime >= sDate - buffer && actTime <= eDate + buffer;
        });

        console.log(`[CEMS Debug] Matching wildfire activations in range (${new Date(sDate).toISOString()} to ${new Date(eDate).toISOString()}):`, matchingActivations.map((a: any) => a.code));

        if (matchingActivations.length === 0) {
          if (isSubscribed) setActiveCemsWildfireFeatures(null);
          return;
        }

        const fetchPromises = matchingActivations.map((act: any) => {
          if (!cemsFeatureCacheRef.current[act.code]) {
            cemsFeatureCacheRef.current[act.code] = (async () => {
              const res = await fetch(`https://rapidmapping.emergency.copernicus.eu/backend/dashboard-api/public-activations/?code=${act.code}`);
              if (!res.ok) throw new Error('Failed to fetch specific activation');
              const data = await res.json();
              
              const actFeatures: any[] = [];
              if (data && data.results && data.results.length > 0 && data.results[0].aois) {
                for (const aoi of data.results[0].aois) {
                  if (aoi.extent) {
                    const aoiGeom = parseWKT(aoi.extent);
                    if (aoiGeom) {
                      actFeatures.push({
                        type: 'Feature',
                        geometry: aoiGeom.geometry,
                        properties: { aoiName: aoi.aoiName, isExtent: true }
                      });
                    }
                  }
                  if (aoi.products) {
                    // Fetch VT layers concurrently as well
                    const vtPromises: Promise<any>[] = [];
                    const productsWithVt = aoi.products.filter((p: any) => p.layers && p.layers.some((l: any) => l.format === 'vt'));
                    const latestProduct = productsWithVt.length > 0 ? productsWithVt.sort((a: any, b: any) => (b.monitoringNumber || 0) - (a.monitoringNumber || 0))[0] : null;
                    const productsToProcess = latestProduct ? [latestProduct] : [];
                    for (const product of productsToProcess) {
                      if (product.layers) {
                        for (const layer of product.layers) {
                          if (layer.format === 'vt' && layer.json) {
                            vtPromises.push(safeFetchCemsJson(layer.json));
                          }
                        }
                      }
                    }
                    const vtResults = await Promise.all(vtPromises);
                    for (const vtFeatures of vtResults) {
                      actFeatures.push(...vtFeatures);
                    }
                  }
                }
              }
              return actFeatures;
            })();
          }

          return cemsFeatureCacheRef.current[act.code].catch((e: any) => {
            console.error('[CEMS Debug] Failed to fetch detailed CEMS activation', e);
            delete cemsFeatureCacheRef.current[act.code];
            return [];
          });
        });

        const allResults = await Promise.all(fetchPromises);
        const allFeatures = allResults.flat();
        console.log('[CEMS Debug] FLOOD FEATURES RESOLVED:', allFeatures.length);

        console.log(`[CEMS Debug] Total features to render:`, allFeatures.length);

        if (isSubscribed) {
          setActiveCemsWildfireFeatures({
            type: 'FeatureCollection',
            features: allFeatures
          });
        }
      } catch (err) {
        console.error('Error fetching CEMS wildfire data', err);
      }
    })();

    return () => { isSubscribed = false; };
  }, [settings.layers, settings.globalDateMode, settings.globalStartDate, settings.globalEndDate, getEffectiveLayerDates]);

  // Fetch detailed CEMS activations for floods in the date range
  useEffect(() => {
    const floodLayer = settings.layers.find(l => l.id === 'floods');
    if (!floodLayer || !floodLayer.visible || !floodLayer.copernicusEnabled) {
      if (activeCemsFloodFeatures) setActiveCemsFloodFeatures(null);
      // cemsFeatureCacheRef.current = {}; // Removed to prevent memory leaks from dangling promises
      return;
    }

    let isSubscribed = true;
    const { effectiveStartDate, effectiveEndDate } = getEffectiveLayerDates(floodLayer);
    
    (async () => {
      try {
        if (!allCemsActivationsRef.current) {
          allCemsActivationsRef.current = fetch(`https://rapidmapping.emergency.copernicus.eu/backend/dashboard-api/public-activations-info/?limit=2000`)
            .then(res => {
              if (!res.ok) throw new Error('Failed to fetch CEMS activations');
              return res.json();
            })
            .then(data => data?.results || []);
        }
        
        let activations;
        try {
          // Await the promise (it might be already resolved, or currently fetching)
          activations = await allCemsActivationsRef.current;
          console.log('[CEMS Debug] Fetched global activations count:', activations?.length);
        } catch (err) {
          console.error('[CEMS Debug] Failed to fetch global activations:', err);
          allCemsActivationsRef.current = null; // reset on error
          return;
        }
        if (!activations) return;

        // Filter for Floods in date range
        const sDate = new Date(effectiveStartDate).getTime();
        const eDate = new Date(effectiveEndDate).getTime() + 24*60*60*1000 - 1; // End of day

        const matchingActivations = activations.filter((act: any) => {
          if (act.category !== 'Flood') return false;
          const actTime = new Date(act.eventTime || act.activationTime).getTime();
          // allow a small buffer, e.g., 7 days before and after
          const buffer = 7 * 24 * 60 * 60 * 1000;
          return actTime >= sDate - buffer && actTime <= eDate + buffer;
        });

        console.log(`[CEMS Debug] Matching flood activations in range (${new Date(sDate).toISOString()} to ${new Date(eDate).toISOString()}):`, matchingActivations.map((a: any) => a.code));

        if (matchingActivations.length === 0) {
          if (isSubscribed) setActiveCemsFloodFeatures(null);
          return;
        }

        const fetchPromises = matchingActivations.map((act: any) => {
          if (!cemsFeatureCacheRef.current[act.code]) {
            cemsFeatureCacheRef.current[act.code] = (async () => {
              const res = await fetch(`https://rapidmapping.emergency.copernicus.eu/backend/dashboard-api/public-activations/?code=${act.code}`);
              if (!res.ok) throw new Error('Failed to fetch specific activation');
              const data = await res.json();
              
              const actFeatures: any[] = [];
              if (data && data.results && data.results.length > 0 && data.results[0].aois) {
                for (const aoi of data.results[0].aois) {
                  if (aoi.extent) {
                    const aoiGeom = parseWKT(aoi.extent);
                    if (aoiGeom) {
                      actFeatures.push({
                        type: 'Feature',
                        geometry: aoiGeom.geometry,
                        properties: { aoiName: aoi.aoiName, isExtent: true }
                      });
                    }
                  }
                  if (aoi.products) {
                    // Fetch VT layers concurrently as well
                    const vtPromises: Promise<any>[] = [];
                    const productsWithVt = aoi.products.filter((p: any) => p.layers && p.layers.some((l: any) => l.format === 'vt'));
                    const latestProduct = productsWithVt.length > 0 ? productsWithVt.sort((a: any, b: any) => (b.monitoringNumber || 0) - (a.monitoringNumber || 0))[0] : null;
                    const productsToProcess = latestProduct ? [latestProduct] : [];
                    for (const product of productsToProcess) {
                      if (product.layers) {
                        for (const layer of product.layers) {
                          if (layer.format === 'vt' && layer.json) {
                            vtPromises.push(safeFetchCemsJson(layer.json));
                          }
                        }
                      }
                    }
                    const vtResults = await Promise.all(vtPromises);
                    for (const vtFeatures of vtResults) {
                      actFeatures.push(...vtFeatures);
                    }
                  }
                }
              }
              return actFeatures;
            })();
          }

          return cemsFeatureCacheRef.current[act.code].catch((e: any) => {
            console.error('[CEMS Debug] Failed to fetch detailed CEMS activation', e);
            delete cemsFeatureCacheRef.current[act.code];
            return [];
          });
        });

        const allResults = await Promise.all(fetchPromises);
        const allFeatures = allResults.flat();
        console.log('[CEMS Debug] FLOOD FEATURES RESOLVED:', allFeatures.length);

        if (isSubscribed) {
          setActiveCemsFloodFeatures({
            type: 'FeatureCollection',
            features: allFeatures
          });
        }
      } catch (err) {
        console.error('Error fetching CEMS flood data', err);
      }
    })();

    return () => { isSubscribed = false; };
  }, [settings.layers, settings.globalDateMode, settings.globalStartDate, settings.globalEndDate, getEffectiveLayerDates]);

  // Fetch shakemap when selectedEarthquake changes

  // Update earthquake labels filter
  useEffect(() => {
    
    if (!map || !mapLoaded) return;
    
    settings.layers.forEach(layer => {
      if (layer.type === 'gdacs_earthquakes' || layer.type === 'cems_rapid_mapping') {
        const baseLayerId = `dynamic-layer-${layer.id}`;
        const labelLayerId = `${baseLayerId}-label`;
        
        if (map.getLayer(baseLayerId)) {
          if (selectedEarthquake && layer.type === 'gdacs_earthquakes') {
             map.setFilter(baseLayerId, ['!=', ['to-string', ['get', 'eventid']], selectedEarthquake.id]);
             if (map.getLayer(labelLayerId)) {
               map.setFilter(labelLayerId, ['!=', ['to-string', ['get', 'eventid']], selectedEarthquake.id]);
             }
          } else if (selectedCemsEarthquake && layer.type === 'cems_rapid_mapping') {
             map.setFilter(baseLayerId, ['!=', ['to-string', ['get', 'code']], selectedCemsEarthquake.code]);
             if (map.getLayer(labelLayerId)) {
               map.setFilter(labelLayerId, ['!=', ['to-string', ['get', 'code']], selectedCemsEarthquake.code]);
             }
          } else {
             map.setFilter(baseLayerId, null);
             if (map.getLayer(labelLayerId)) map.setFilter(labelLayerId, null);
          }
        }
      }
    });
  }, [selectedEarthquake, selectedCemsEarthquake, mapLoaded, settings.layers]);

  // Update cyclone point filter to hide selected cyclone point
  useEffect(() => {
    
    if (!map || !mapLoaded) return;
    
    settings.layers.forEach(layer => {
      if (layer.type === 'gdacs_cyclones') {
        const layerId = `dynamic-layer-${layer.id}`;
        if (map.getLayer(layerId)) {
          if (selectedCycloneId) {
            map.setFilter(layerId, ['!=', ['to-string', ['get', 'eventid']], selectedCycloneId.id]);
          } else {
            map.setFilter(layerId, null);
          }
        }
      }
    });
  }, [selectedCycloneId, mapLoaded, settings.layers]);

  // Render selected earthquake DOM label
  useEffect(() => {
    
    if (activeDrawMarkersRef.current['selected-eq-label']) {
      activeDrawMarkersRef.current['selected-eq-label'].remove();
      delete activeDrawMarkersRef.current['selected-eq-label'];
    }
    if (selectionMarkersRef.current['selected-eq-label']) {
      selectionMarkersRef.current['selected-eq-label'].remove();
      delete selectionMarkersRef.current['selected-eq-label'];
    }
    
    if (!map || !mapLoaded || !selectedEarthquake) {
      return;
    }

    const { coordinates, properties } = selectedEarthquake;
    const alertLevel = properties.alertlevel;
    const bgColor = alertLevel === 'Red' ? '#ef4444' : alertLevel === 'Orange' ? '#f97316' : alertLevel === 'Green' ? '#22c55e' : '#6b7280';
    
    const fromDate = properties.fromdate || '';
    let dateStr = '';
    if (fromDate.length >= 10) {
       dateStr = `${fromDate.substring(8, 10)}.${fromDate.substring(5, 7)}.${fromDate.substring(0, 4)}`;
    }

    const el = document.createElement('div');
    el.className = 'flex flex-col items-center justify-center pointer-events-none shakemap-marker-dot';
    el.style.backgroundColor = bgColor;
    el.style.color = '#ffffff';
    el.style.padding = '4px 8px';
    el.style.fontFamily = 'Gotham Bold, Arial Unicode MS Regular, sans-serif';
    el.style.fontSize = '12px';
    el.style.fontWeight = 'bold';
    el.style.lineHeight = '1.2';
    el.style.textAlign = 'center';
    el.style.whiteSpace = 'nowrap';
    el.style.zIndex = '50';
    
    el.innerHTML = `<div>${dateStr}</div>`;

    const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
      .setLngLat(coordinates)
      .addTo(map);

    selectionMarkersRef.current['selected-eq-label'] = marker;

    return () => {
      if (selectionMarkersRef.current['selected-eq-label']) {
        selectionMarkersRef.current['selected-eq-label'].remove();
        delete selectionMarkersRef.current['selected-eq-label'];
      }
    };
  }, [selectedEarthquake, mapLoaded]);



  // Render selected earthquake shakemap
  useEffect(() => {
    
    if (!map || !mapLoaded) return;

    if (!map.getSource('selected-earthquake-shakemap-source')) {
      map.addSource('selected-earthquake-shakemap-source', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
      });
      
      const eqLayer = settings.layers.find(l => l.type === 'gdacs_earthquakes');
      let beforeId = 'custom-polygons';
      const firstSymbolId = map.getStyle().layers?.find(l => l.type === 'symbol')?.id;
      if (firstSymbolId) {
        beforeId = firstSymbolId;
      } else if (eqLayer && map.getLayer(`dynamic-layer-${eqLayer.id}`)) {
        beforeId = `dynamic-layer-${eqLayer.id}`;
      }

      map.addLayer({
        id: 'selected-earthquake-shakemap-fill',
        type: 'fill',
        source: 'selected-earthquake-shakemap-source',
        paint: {
          'fill-color': ['coalesce', ['get', 'fill'], '#ff9900'],
          'fill-opacity': 0.3
        }
      }, beforeId);

      map.addLayer({
        id: 'selected-earthquake-shakemap-line',
        type: 'line',
        source: 'selected-earthquake-shakemap-source',
        paint: {
          'line-color': ['coalesce', ['get', 'stroke'], '#ff0000'],
          'line-width': 1,
          'line-opacity': 0.8
        }
      }, beforeId);
    }

    const source = map.getSource('selected-earthquake-shakemap-source') as maplibregl.GeoJSONSource;
    if (source) {
      source.setData(selectedEarthquakeShakemap || { type: 'FeatureCollection', features: [] });
    }

    const eqLayer = settings.layers.find(l => l.type === 'gdacs_earthquakes');
    if (eqLayer) {
      const useColor = eqLayer.colorCodeShakemap !== false;
      const colorExpr = useColor 
        ? [
            'step',
            ['to-number', ['get', 'intensity'], 0],
            '#ffffff',
            2, '#bfccff',
            4, '#a0e6ff',
            5, '#80ffff',
            6, '#7aff93',
            7, '#ffff00',
            8, '#ffc800',
            9, '#ff9100',
            10, '#ff0000'
          ]
        : null; // null means we'll handle fallback separately
        
      const shakemapVisibility = eqLayer.shakemapEnabled !== false ? 'visible' : 'none';
      if (map.getLayer('selected-earthquake-shakemap-fill')) {
        map.setLayoutProperty('selected-earthquake-shakemap-fill', 'visibility', shakemapVisibility);
        map.setPaintProperty('selected-earthquake-shakemap-fill', 'fill-color', colorExpr || ['coalesce', ['get', 'fill'], '#ff9900']);
        map.setPaintProperty('selected-earthquake-shakemap-fill', 'fill-opacity', (eqLayer.shakemapOpacity ?? 1.0) * 0.3); // base is 0.3
      }
      
      if (map.getLayer('selected-earthquake-shakemap-line')) {
        map.setLayoutProperty('selected-earthquake-shakemap-line', 'visibility', shakemapVisibility);
        map.setPaintProperty('selected-earthquake-shakemap-line', 'line-color', colorExpr || ['coalesce', ['get', 'stroke'], '#ff0000']);
        map.setPaintProperty('selected-earthquake-shakemap-line', 'line-opacity', (eqLayer.shakemapOpacity ?? 1.0) * 0.8); // base is 0.8
      }
    }
  }, [selectedEarthquakeShakemap, mapLoaded, settings.layers]);

  // Render selected CEMS earthquake VT layers
  useEffect(() => {
    
    if (!map || !mapLoaded) return;

    if (!map.getSource('selected-cems-vt-source')) {
      map.addSource('selected-cems-vt-source', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
      });

      const cemsLayer = settings.layers.find(l => l.type === 'cems_rapid_mapping');
      const beforeId = (cemsLayer && map.getLayer(`dynamic-layer-${cemsLayer.id}`)) ? `dynamic-layer-${cemsLayer.id}` : 'custom-polygons';

      map.addLayer({
        id: 'selected-cems-vt-extent',
        type: 'line',
        source: 'selected-cems-vt-source',
        filter: ['==', 'isExtent', true],
        paint: {
          'line-color': '#ffff00',
          'line-width': 2,
          'line-dasharray': [2, 2]
        }
      }, beforeId);

      map.addLayer({
        id: 'selected-cems-vt-polygons',
        type: 'fill',
        source: 'selected-cems-vt-source',
        filter: ['all', 
          ['!=', 'isExtent', true], 
          ['==', '$type', 'Polygon'],
          ['any',
            ['==', 'damage_gra', 'Destroyed'],
            ['==', 'damage_gra', 'Damaged'],
            ['==', 'damage_gra', 'Possibly damaged']
          ]
        ],
        paint: {
          'fill-color': [
            'match',
            ['get', 'damage_gra'],
            'Destroyed', '#ff0000',
            'Damaged', '#ff9900',
            'Possibly damaged', '#ffff00',
            'No visible damage', '#888888',
            '#888888'
          ],
          'fill-opacity': [
            'match',
            ['get', 'damage_gra'],
            'Destroyed', 0.6,
            'Damaged', 0.6,
            'Possibly damaged', 0.6,
            'No visible damage', 0.6,
            0.25
          ]
        }
      }, beforeId);

      map.addLayer({
        id: 'selected-cems-vt-lines',
        type: 'line',
        source: 'selected-cems-vt-source',
        filter: ['all', 
          ['!=', 'isExtent', true], 
          ['==', '$type', 'LineString'],
          ['any',
            ['==', 'damage_gra', 'Destroyed'],
            ['==', 'damage_gra', 'Damaged'],
            ['==', 'damage_gra', 'Possibly damaged']
          ]
        ],
        paint: {
          'line-color': [
            'match',
            ['get', 'damage_gra'],
            'Destroyed', '#ff0000',
            'Damaged', '#ff9900',
            'Possibly damaged', '#ffff00',
            'No visible damage', '#888888',
            '#888888'
          ],
          'line-width': 3,
          'line-opacity': [
            'match',
            ['get', 'damage_gra'],
            'Destroyed', 1,
            'Damaged', 1,
            'Possibly damaged', 1,
            'No visible damage', 1,
            0.25
          ]
        }
      }, beforeId);

      map.addLayer({
        id: 'selected-cems-vt-points',
        type: 'circle',
        source: 'selected-cems-vt-source',
        filter: ['all', 
          ['!=', 'isExtent', true], 
          ['==', '$type', 'Point'],
          ['any',
            ['==', 'damage_gra', 'Destroyed'],
            ['==', 'damage_gra', 'Damaged'],
            ['==', 'damage_gra', 'Possibly damaged']
          ]
        ],
        paint: {
          'circle-radius': 4,
          'circle-color': [
            'match',
            ['get', 'damage_gra'],
            'Destroyed', '#ff0000',
            'Damaged', '#ff9900',
            'Possibly damaged', '#ffff00',
            'No visible damage', '#888888',
            '#888888'
          ],
          'circle-opacity': [
            'match',
            ['get', 'damage_gra'],
            'Destroyed', 1,
            'Damaged', 1,
            'Possibly damaged', 1,
            'No visible damage', 1,
            0.25
          ],
          'circle-stroke-width': 0
        }
      }, beforeId);
    }

    const source = map.getSource('selected-cems-vt-source') as maplibregl.GeoJSONSource;
    if (source) {
      source.setData(selectedCemsEarthquakeFeatures || { type: 'FeatureCollection', features: [] });
    }

    const eqLayer = settings.layers.find(l => l.type === 'gdacs_earthquakes');
    const isEqCemsEnabled = !!eqLayer?.copernicusEnabled;
    const isCemsEnabled = selectedEarthquake ? isEqCemsEnabled : isEqCemsEnabled;
    const cemsVisibility = isCemsEnabled ? 'visible' : 'none';
    const cemsOpacity = selectedEarthquake ? (eqLayer?.copernicusOpacity ?? 1.0) : 1.0;
    
    if (map.getLayer('selected-cems-vt-extent')) {
      map.setLayoutProperty('selected-cems-vt-extent', 'visibility', cemsVisibility);
      map.setPaintProperty('selected-cems-vt-extent', 'line-opacity', cemsOpacity);
    }
    if (map.getLayer('selected-cems-vt-polygons')) {
      map.setLayoutProperty('selected-cems-vt-polygons', 'visibility', cemsVisibility);
      map.setPaintProperty('selected-cems-vt-polygons', 'fill-opacity', [
        'match',
        ['get', 'damage_gra'],
        'Destroyed', 0.6 * cemsOpacity,
        'Damaged', 0.6 * cemsOpacity,
        'Possibly damaged', 0.6 * cemsOpacity,
        'No visible damage', 0.6 * cemsOpacity,
        0.25 * cemsOpacity
      ]);
    }
    if (map.getLayer('selected-cems-vt-lines')) {
      map.setLayoutProperty('selected-cems-vt-lines', 'visibility', cemsVisibility);
      map.setPaintProperty('selected-cems-vt-lines', 'line-opacity', [
        'match',
        ['get', 'damage_gra'],
        'Destroyed', 1 * cemsOpacity,
        'Damaged', 1 * cemsOpacity,
        'Possibly damaged', 1 * cemsOpacity,
        'No visible damage', 1 * cemsOpacity,
        0.25 * cemsOpacity
      ]);
    }
    if (map.getLayer('selected-cems-vt-points')) {
      map.setLayoutProperty('selected-cems-vt-points', 'visibility', cemsVisibility);
      map.setPaintProperty('selected-cems-vt-points', 'circle-opacity', cemsOpacity);
      map.setPaintProperty('selected-cems-vt-points', 'circle-stroke-opacity', cemsOpacity);
    }

  }, [selectedCemsEarthquakeFeatures, mapLoaded, settings.layers]);

  // Render CEMS Wildfire Features
  useEffect(() => {
    
    if (!map || !mapLoaded) return;

    let beforeId = 'custom-polygons';
    const style = map.getStyle();
    if (style && style.layers) {
      for (const l of style.layers) {
        if (l.id.includes('admin') || l.id.includes('border') || l.type === 'symbol') {
          beforeId = l.id;
          break;
        }
      }
    }

    if (!map.getSource('active-wildfire-cems-vt-source')) {
      map.addSource('active-wildfire-cems-vt-source', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
      });

      // Add Extent Layer
      map.addLayer({
        id: 'active-wildfire-cems-vt-extent',
        type: 'line',
        source: 'active-wildfire-cems-vt-source',
        filter: ['==', 'isExtent', true],
        layout: {
          'line-join': 'round',
          'line-cap': 'round'
        },
        paint: {
          'line-color': '#ff9900',
          'line-width': 2,
          'line-dasharray': [2, 2]
        }
      }, beforeId);

      // Add Polygons
      map.addLayer({
        id: 'active-wildfire-cems-vt-polygons',
        type: 'fill',
        source: 'active-wildfire-cems-vt-source',
        filter: ['all', ['==', '$type', 'Polygon'], ['!=', 'isExtent', true]],
        paint: {
          'fill-color': [
            'match',
            ['coalesce', ['get', 'damage_gra'], 'none'],
            'Destroyed', '#ff0000',
            'Damaged', '#ff9900',
            'Possibly damaged', '#ffff00',
            'No visible damage', '#888888',
            '#ff0000'
          ]
        }
      }, beforeId);

      // Add Lines
      map.addLayer({
        id: 'active-wildfire-cems-vt-lines',
        type: 'line',
        source: 'active-wildfire-cems-vt-source',
        filter: ['all', 
          ['!=', 'isExtent', true], 
          ['==', '$type', 'LineString'],
          ['any',
            ['==', 'damage_gra', 'Destroyed'],
            ['==', 'damage_gra', 'Damaged'],
            ['==', 'damage_gra', 'Possibly damaged']
          ]
        ],
        paint: {
          'line-color': [
            'match',
            ['get', 'damage_gra'],
            'Destroyed', '#ff0000',
            'Damaged', '#ff9900',
            'Possibly damaged', '#ffff00',
            'No visible damage', '#888888',
            '#888888'
          ],
          'line-width': 3
        }
      }, beforeId);

      // Add Points
      map.addLayer({
        id: 'active-wildfire-cems-vt-points',
        type: 'circle',
        source: 'active-wildfire-cems-vt-source',
        filter: ['all', 
          ['!=', 'isExtent', true], 
          ['==', '$type', 'Point'],
          ['any',
            ['==', 'damage_gra', 'Destroyed'],
            ['==', 'damage_gra', 'Damaged'],
            ['==', 'damage_gra', 'Possibly damaged']
          ]
        ],
        paint: {
          'circle-color': [
            'match',
            ['get', 'damage_gra'],
            'Destroyed', '#ff0000',
            'Damaged', '#ff9900',
            'Possibly damaged', '#ffff00',
            'No visible damage', '#888888',
            '#888888'
          ],
          'circle-radius': 4
        }
      }, beforeId);
    }

    const wfLayer = settings.layers.find(l => l.type === 'wildfires');
    const isCemsEnabled = !!wfLayer?.copernicusEnabled && !!activeCemsWildfireFeatures;
    const cemsVisibility = isCemsEnabled ? 'visible' : 'none';
    const cemsOpacity = wfLayer?.copernicusOpacity ?? 1.0;
    
    if (map.getLayer('active-wildfire-cems-vt-extent')) {
      map.setLayoutProperty('active-wildfire-cems-vt-extent', 'visibility', cemsVisibility);
      map.setPaintProperty('active-wildfire-cems-vt-extent', 'line-opacity', cemsOpacity);
    }
    if (map.getLayer('active-wildfire-cems-vt-polygons')) {
      map.setLayoutProperty('active-wildfire-cems-vt-polygons', 'visibility', cemsVisibility);
      map.setPaintProperty('active-wildfire-cems-vt-polygons', 'fill-opacity', [
        'case',
        ['==', ['coalesce', ['get', 'obj_type'], ''], 'Not Analysed'], 0,
        ['match',
          ['coalesce', ['get', 'damage_gra'], 'none'],
          'Destroyed', 0.6 * cemsOpacity,
          'Damaged', 0.6 * cemsOpacity,
          'Possibly damaged', 0.6 * cemsOpacity,
          'No visible damage', 0.6 * cemsOpacity,
          0.6 * cemsOpacity
        ]
      ]);
    }
    if (map.getLayer('active-wildfire-cems-vt-lines')) {
      map.setLayoutProperty('active-wildfire-cems-vt-lines', 'visibility', cemsVisibility);
      map.setPaintProperty('active-wildfire-cems-vt-lines', 'line-opacity', [
        'match',
        ['get', 'damage_gra'],
        'Destroyed', cemsOpacity,
        'Damaged', cemsOpacity,
        'Possibly damaged', cemsOpacity,
        'No visible damage', cemsOpacity,
        0.25 * cemsOpacity
      ]);
    }
    if (map.getLayer('active-wildfire-cems-vt-points')) {
      map.setLayoutProperty('active-wildfire-cems-vt-points', 'visibility', cemsVisibility);
      map.setPaintProperty('active-wildfire-cems-vt-points', 'circle-opacity', [
        'match',
        ['get', 'damage_gra'],
        'Destroyed', cemsOpacity,
        'Damaged', cemsOpacity,
        'Possibly damaged', cemsOpacity,
        'No visible damage', cemsOpacity,
        0.25 * cemsOpacity
      ]);
    }

  }, [activeCemsWildfireFeatures, mapLoaded, settings.layers]);


  // Heavy setData operation isolated to prevent memory leaks on settings save
  useEffect(() => {
    if (!mapLoaded || !map) return;
    const source = map.getSource('active-wildfire-cems-vt-source') as maplibregl.GeoJSONSource;
    if (source) {
      source.setData(activeCemsWildfireFeatures || { type: 'FeatureCollection', features: [] });
    }
  }, [activeCemsWildfireFeatures, mapLoaded]);

  // Heavy setData operation isolated to prevent memory leaks on settings save
  useEffect(() => {
    if (!mapLoaded || !map) return;
    const source = map.getSource('active-flood-cems-vt-source') as maplibregl.GeoJSONSource;
    if (source) {
      source.setData(activeCemsFloodFeatures || { type: 'FeatureCollection', features: [] });
    }
  }, [activeCemsFloodFeatures, mapLoaded]);

  // Flood CEMS VT rendering
  useEffect(() => {
    
    if (!map || !mapLoaded) return;

    let beforeId: string | undefined;
    const style = map.getStyle();
    if (style && style.layers) {
      for (const l of style.layers) {
        if (l.id.includes('admin') || l.id.includes('border') || l.type === 'symbol') {
          beforeId = l.id;
          break;
        }
      }
    }

    if (!map.getSource('active-flood-cems-vt-source')) {
      map.addSource('active-flood-cems-vt-source', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
        tolerance: 0.5 // Reduce geometry complexity to save Web Worker RAM
      });

      // Add Extent Layer
      map.addLayer({
        id: 'active-flood-cems-vt-extent',
        type: 'line',
        source: 'active-flood-cems-vt-source',
        filter: ['==', 'isExtent', true],
        layout: {
          'line-join': 'round',
          'line-cap': 'round'
        },
        paint: {
          'line-color': '#3366ff',
          'line-width': 2,
          'line-dasharray': [2, 2]
        }
      }, beforeId);

      // Add Polygons
      map.addLayer({
        id: 'active-flood-cems-vt-polygons',
        type: 'fill',
        source: 'active-flood-cems-vt-source',
        filter: ['all', ['==', '$type', 'Polygon'], ['!=', 'isExtent', true]],
        paint: {
          'fill-color': [
            'match',
            ['coalesce', ['get', 'damage_gra'], 'none'],
            'Destroyed', '#ff0000',
            'Damaged', '#ff8c00',
            'Possibly damaged', '#ffff00',
            'No visible damage', '#888888',
            '#0000ff'
          ]
        }
      }, beforeId);

      // Add Lines
      map.addLayer({
        id: 'active-flood-cems-vt-lines',
        type: 'line',
        source: 'active-flood-cems-vt-source',
        filter: ['all', 
          ['!=', 'isExtent', true], 
          ['==', '$type', 'LineString'],
          ['any',
            ['==', 'damage_gra', 'Destroyed'],
            ['==', 'damage_gra', 'Damaged'],
            ['==', 'damage_gra', 'Possibly damaged']
          ]
        ],
        paint: {
          'line-color': [
            'match',
            ['get', 'damage_gra'],
            'Destroyed', '#ff0000',
            'Damaged', '#ff8c00',
            'Possibly damaged', '#ffff00',
            'No visible damage', '#888888',
            '#888888'
          ],
          'line-width': 3
        }
      }, beforeId);

      // Add Points
      map.addLayer({
        id: 'active-flood-cems-vt-points',
        type: 'circle',
        source: 'active-flood-cems-vt-source',
        filter: ['all', 
          ['!=', 'isExtent', true], 
          ['==', '$type', 'Point'],
          ['any',
            ['==', 'damage_gra', 'Destroyed'],
            ['==', 'damage_gra', 'Damaged'],
            ['==', 'damage_gra', 'Possibly damaged']
          ]
        ],
        paint: {
          'circle-color': [
            'match',
            ['get', 'damage_gra'],
            'Destroyed', '#ff0000',
            'Damaged', '#ff8c00',
            'Possibly damaged', '#ffff00',
            'No visible damage', '#888888',
            '#888888'
          ],
          'circle-radius': 4
        }
      }, beforeId);
    }

    const floodLayer = settings.layers.find(l => l.id === 'floods');
    const isCemsEnabled = !!floodLayer?.copernicusEnabled && !!activeCemsFloodFeatures;
    const cemsVisibility = isCemsEnabled ? 'visible' : 'none';
    const cemsOpacity = floodLayer?.copernicusOpacity ?? 1.0;
    
    if (map.getLayer('active-flood-cems-vt-extent')) {
      map.setLayoutProperty('active-flood-cems-vt-extent', 'visibility', cemsVisibility);
      map.setPaintProperty('active-flood-cems-vt-extent', 'line-opacity', cemsOpacity);
    }
    if (map.getLayer('active-flood-cems-vt-polygons')) {
      map.setLayoutProperty('active-flood-cems-vt-polygons', 'visibility', cemsVisibility);
      map.setPaintProperty('active-flood-cems-vt-polygons', 'fill-opacity', [
        'case',
        ['==', ['coalesce', ['get', 'obj_type'], ''], 'Not Analysed'], 0,
        ['match',
          ['coalesce', ['get', 'damage_gra'], 'none'],
          'Destroyed', 0.6 * cemsOpacity,
          'Damaged', 0.6 * cemsOpacity,
          'Possibly damaged', 0.6 * cemsOpacity,
          'No visible damage', 0.6 * cemsOpacity,
          0.6 * cemsOpacity
        ]
      ]);
    }
    if (map.getLayer('active-flood-cems-vt-lines')) {
      map.setLayoutProperty('active-flood-cems-vt-lines', 'visibility', cemsVisibility);
      map.setPaintProperty('active-flood-cems-vt-lines', 'line-opacity', [
        'match',
        ['get', 'damage_gra'],
        'Destroyed', cemsOpacity,
        'Damaged', cemsOpacity,
        'Possibly damaged', cemsOpacity,
        'No visible damage', cemsOpacity,
        0.25 * cemsOpacity
      ]);
    }
    if (map.getLayer('active-flood-cems-vt-points')) {
      map.setLayoutProperty('active-flood-cems-vt-points', 'visibility', cemsVisibility);
      map.setPaintProperty('active-flood-cems-vt-points', 'circle-opacity', [
        'match',
        ['get', 'damage_gra'],
        'Destroyed', cemsOpacity,
        'Damaged', cemsOpacity,
        'Possibly damaged', cemsOpacity,
        'No visible damage', cemsOpacity,
        0.25 * cemsOpacity
      ]);
    }

  }, [activeCemsFloodFeatures, mapLoaded, settings.layers]);

  // Render selected volcano DOM label
  useEffect(() => {
    
    if (selectionMarkersRef.current['selected-volcano-label']) {
      selectionMarkersRef.current['selected-volcano-label'].remove();
      delete selectionMarkersRef.current['selected-volcano-label'];
    }

    if (!map || !mapLoaded || !selectedVolcano) {
      return;
    }

    const { coordinates, properties } = selectedVolcano;
    const alertLevel = properties.alertlevel;
    const bgColor = alertLevel === 'Red' ? '#ff0000' : alertLevel === 'Orange' ? '#ff9900' : alertLevel === 'Green' ? '#00ff00' : '#6b7280';
    
    const eventName = properties.eventname || properties.name || 'Volcano';
    const fromDate = properties.fromdate || '';
    let dateStr = '';
    if (fromDate.length >= 10) {
       dateStr = `${fromDate.substring(8, 10)}.${fromDate.substring(5, 7)}.${fromDate.substring(0, 4)}`;
    }

    const el = document.createElement('div');
    el.className = 'flex flex-col items-center justify-center pointer-events-none';
    el.style.backgroundColor = bgColor;
    el.style.color = '#ffffff';
    el.style.padding = '4px 8px';
    el.style.fontFamily = 'Gotham Bold, Arial Unicode MS Regular, sans-serif';
    el.style.fontSize = '12px';
    el.style.fontWeight = 'bold';
    el.style.lineHeight = '1.2';
    el.style.textAlign = 'center';
    el.style.whiteSpace = 'nowrap';
    el.style.zIndex = '50';
    
    el.innerHTML = `
      <div>${eventName}</div>
      ${dateStr ? `<div>${dateStr}</div>` : ''}
    `;

    if (selectionMarkersRef.current['selected-volcano-label']) {
      selectionMarkersRef.current['selected-volcano-label'].remove();
    }
    
    const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
      .setLngLat(coordinates)
      .addTo(map);

    selectionMarkersRef.current['selected-volcano-label'] = marker;

    return () => {
      if (selectionMarkersRef.current['selected-volcano-label']) {
        selectionMarkersRef.current['selected-volcano-label'].remove();
        delete selectionMarkersRef.current['selected-volcano-label'];
      }
    };
  }, [selectedVolcano, mapLoaded]);

  // Render selected volcano danger zone polygon
  useEffect(() => {
    
    if (!map || !mapLoaded) return;

    if (!map.getSource('selected-volcano-polygon-source')) {
      map.addSource('selected-volcano-polygon-source', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
      });
      
      const volLayer = settings.layers.find(l => l.type === 'gdacs_volcanoes');
      const beforeId = (volLayer && map.getLayer(`dynamic-layer-${volLayer.id}`)) ? `dynamic-layer-${volLayer.id}` : 'custom-polygons';

      map.addLayer({
        id: 'selected-volcano-polygon-fill',
        type: 'fill',
        source: 'selected-volcano-polygon-source',
        paint: {
          'fill-color': ['coalesce', ['get', 'fillColor'], '#ff0000'],
          'fill-opacity': 0.3
        }
      }, beforeId);

      map.addLayer({
        id: 'selected-volcano-polygon-line',
        type: 'line',
        source: 'selected-volcano-polygon-source',
        paint: {
          'line-color': ['coalesce', ['get', 'color'], '#ff0000'],
          'line-width': 1,
          'line-opacity': 0.8
        }
      }, beforeId);
    }

    const source = map.getSource('selected-volcano-polygon-source') as maplibregl.GeoJSONSource;
    if (source) {
      source.setData(selectedVolcanoPolygon || { type: 'FeatureCollection', features: [] });
    }
  }, [selectedVolcanoPolygon, mapLoaded, settings.layers]);


};
