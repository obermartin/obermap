import { useEffect, useState, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import type { AppSettings } from '../types';
import along from '@turf/along';
import { executeWhenStyleLoaded,  parseWKT, safeFetchCemsJson  } from '../utils/mapUtils';
import turfLength from '@turf/length';
import lineSlice from '@turf/line-slice';
import { safeSetLayoutProperty, safeSetPaintProperty, safeSetFilter } from '../utils/mapUtils';


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
  setSelectedCemsEarthquakeFeatures: (val: any) => void;
  activeCemsWildfireFeatures: any;
  setActiveCemsWildfireFeatures: (val: any) => void;
  activeCemsFloodFeatures: any;
  setActiveCemsFloodFeatures: (val: any) => void;
  selectedVolcanoPolygon: any;
  activeDrawMarkersRef: React.MutableRefObject<{ [id: string]: maplibregl.Marker }>;
  selectionMarkersRef: React.MutableRefObject<{ [id: string]: maplibregl.Marker }>;
}

const addLayerSafely = (map: maplibregl.Map, layer: any) => {
  if (map.getLayer(layer.id)) return;
  
  let beforeId = map.getLayer('custom-polygons') ? 'custom-polygons' : undefined;
  
  if (!beforeId) {
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
  setSelectedCemsEarthquakeFeatures,
  activeCemsWildfireFeatures,
  setActiveCemsWildfireFeatures,
  activeCemsFloodFeatures,
  setActiveCemsFloodFeatures,
  selectedVolcanoPolygon,
  activeDrawMarkersRef,
  selectionMarkersRef
}: DisasterStreamProps) => {
  const [cycloneRawData, setCycloneRawData] = useState<any>(null);
  const [loadingCemsAois, setLoadingCemsAois] = useState<string[]>([]);

  const allCemsActivationsRef = useRef<Promise<any> | null>(null);
  const cemsFeatureCacheRef = useRef<Record<string, any>>({});
  const cycloneGeometryRef = useRef<any>(null);



  useEffect(() => {
    window.dispatchEvent(new CustomEvent('exportDataReady', {
      detail: { type: 'gdacs_cyclones', id: selectedCycloneId?.id, ready: !!cycloneGeometryRef.current && cycloneGeometryRef.current.features?.length > 0 }
    }));
  }, [selectedCycloneId, cycloneGeometryRef.current]);

  // Export GeoJSON Listener
  useEffect(() => {
    const handleExport = (e: CustomEvent) => {
      if (!e.detail?.type || !e.detail?.id) return;
      import('../utils/exportUtils').then(({ downloadGeoJSON, processCycloneGeometry, processVolcanoGeometry, processEarthquakeGeometry, processCemsGeometry }) => {
        if (e.detail.type === 'gdacs_earthquakes' && selectedEarthquake?.id === e.detail.id && selectedEarthquakeShakemap) {
          const processedEarthquake = processEarthquakeGeometry(selectedEarthquakeShakemap);
          downloadGeoJSON(processedEarthquake, `earthquake_shakemap_${e.detail.id}.geojson`);
        } else if (e.detail.type === 'gdacs_volcanoes' && selectedVolcano?.id === e.detail.id && selectedVolcanoPolygon) {
          const processedVolcano = processVolcanoGeometry(selectedVolcanoPolygon);
          downloadGeoJSON(processedVolcano, `volcano_danger_zone_${e.detail.id}.geojson`);
        } else if (e.detail.type === 'gdacs_cyclones' && selectedCycloneId?.id === e.detail.id && cycloneGeometryRef.current) {
          const processedGeometry = processCycloneGeometry(cycloneGeometryRef.current);
          downloadGeoJSON(processedGeometry, `hurricane_path_${e.detail.id}.geojson`);
        } else if (e.detail.type === 'cems_earthquake' && e.detail.id === selectedCemsEarthquake?.code && selectedCemsEarthquakeFeatures) {
          const processedCems = processCemsGeometry(selectedCemsEarthquakeFeatures);
          downloadGeoJSON(processedCems, `cems_earthquake_damage_${e.detail.id}.geojson`);
        } else if (e.detail.type === 'cems_wildfire' && activeCemsWildfireFeatures) {
          const processedCems = processCemsGeometry(activeCemsWildfireFeatures);
          downloadGeoJSON(processedCems, `cems_wildfire_damage.geojson`);
        } else if (e.detail.type === 'cems_flood' && activeCemsFloodFeatures) {
          const processedCems = processCemsGeometry(activeCemsFloodFeatures);
          downloadGeoJSON(processedCems, `cems_flood_damage.geojson`);
        }
      });
    };
    window.addEventListener('requestGeoJsonExport', handleExport as EventListener);
    return () => window.removeEventListener('requestGeoJsonExport', handleExport as EventListener);
  }, [selectedEarthquake, selectedEarthquakeShakemap, selectedVolcano, selectedVolcanoPolygon, selectedCycloneId, selectedCemsEarthquake, selectedCemsEarthquakeFeatures, activeCemsWildfireFeatures, activeCemsFloodFeatures]);

  // Fetch geometry when selectedCycloneId changes
  useEffect(() => {
    
    if (!map || !mapLoaded) return;
    
    const source = map.getSource('selected-cyclone-geometry') as maplibregl.GeoJSONSource;
    if (!source) return;

    if (!selectedCycloneId) {
      cycloneGeometryRef.current = null;
      window.dispatchEvent(new CustomEvent('exportDataReady', {
        detail: { type: 'gdacs_cyclones', id: undefined, ready: false }
      }));
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

        const rawUrl = `https://www.gdacs.org/gdacsapi/api/polygons/getgeometry?eventtype=TC&eventid=${selectedCycloneId.id}&episodeid=${selectedCycloneId.ep}`;
        const url = `./api.php?action=proxy_gdacs&url=${encodeURIComponent(rawUrl)}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error('Failed to fetch cyclone geometry');
        
        const data = await res.json();
        if (data && Array.isArray(data.features)) {
          cycloneGeometryRef.current = data;
          setCycloneRawData(data);
          setCycloneTimelinePercent(100);
          window.dispatchEvent(new CustomEvent('exportDataReady', {
            detail: { type: 'gdacs_cyclones', id: selectedCycloneId?.id, ready: true }
          }));
          source.setData(data);
        } else {
          cycloneGeometryRef.current = null;
          setCycloneRawData(null);
          window.dispatchEvent(new CustomEvent('exportDataReady', {
            detail: { type: 'gdacs_cyclones', id: selectedCycloneId?.id, ready: 'empty' }
          }));
          source.setData({ type: 'FeatureCollection', features: [] });
        }
      } catch (err) {
        console.error('Error fetching cyclone geometry:', err);
        cycloneGeometryRef.current = null;
        setCycloneRawData(null);
        window.dispatchEvent(new CustomEvent('exportDataReady', {
          detail: { type: 'gdacs_cyclones', id: selectedCycloneId?.id, ready: 'empty' }
        }));
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
          let lat = coord[1];
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
    if (!wildfireLayer || !wildfireLayer.visible || wildfireLayer.copernicusEnabled === false) {
      if (activeCemsWildfireFeatures) setActiveCemsWildfireFeatures(null);
      window.dispatchEvent(new CustomEvent('exportDataReady', {
        detail: { type: 'cems_wildfire', id: undefined, ready: false }
      }));
      return;
    }

    let isSubscribed = true;
    window.dispatchEvent(new CustomEvent('exportDataReady', {
      detail: { type: 'cems_wildfire', id: 'wildfire', ready: false }
    }));
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
          const buffer = 7 * 24 * 60 * 60 * 1000;
          if (actTime < sDate - buffer || actTime > eDate + buffer) return false;
          return true;
        });

        console.log(`[CEMS Debug] Matching wildfire activations in range (${new Date(sDate).toISOString()} to ${new Date(eDate).toISOString()}):`, matchingActivations.map((a: any) => a.code));

        if (matchingActivations.length === 0) {
          if (isSubscribed) {
            setActiveCemsWildfireFeatures(null);
            window.dispatchEvent(new CustomEvent('exportDataReady', {
              detail: { type: 'cems_wildfire', id: 'wildfire', ready: 'empty' }
            }));
          }
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
                        properties: { 
                          aoiName: aoi.aoiName, 
                          isExtent: true,
                          isClickableAoi: true,
                          activationCode: act.code,
                          cemsType: 'wildfire',
                          _products: JSON.stringify(aoi.products)
                        }
                      });
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
        console.log('[CEMS Debug] WILDFIRE AOIS RESOLVED:', allFeatures.length);

        if (allFeatures.length > 0) {
          console.log('CEMS WILDFIRE POINTS LOADED:', allFeatures.filter((f:any) => f.geometry?.type === 'Point').length);
          setActiveCemsWildfireFeatures({
            type: 'FeatureCollection',
            features: allFeatures
          });
        }
        window.dispatchEvent(new CustomEvent('exportDataReady', {
          detail: { type: 'cems_wildfire', id: 'wildfire', ready: allFeatures.length > 0 ? true : 'empty' }
        }));
      } catch (err) {
        console.error('Error fetching CEMS wildfire data', err);
        if (isSubscribed) {
          window.dispatchEvent(new CustomEvent('exportDataReady', {
            detail: { type: 'cems_wildfire', id: 'wildfire', ready: 'empty' }
          }));
        }
      }
    })();

    return () => { isSubscribed = false; };
  }, [settings.layers, settings.globalDateMode, settings.globalStartDate, settings.globalEndDate, getEffectiveLayerDates, map]);

  // Fetch detailed CEMS activations for floods in the date range
  useEffect(() => {
    const floodLayer = settings.layers.find(l => l.id === 'floods');
    if (!floodLayer || !floodLayer.visible || floodLayer.copernicusEnabled === false) {
      if (activeCemsFloodFeatures) setActiveCemsFloodFeatures(null);
      window.dispatchEvent(new CustomEvent('exportDataReady', {
        detail: { type: 'cems_flood', id: undefined, ready: false }
      }));
      return;
    }

    let isSubscribed = true;
    window.dispatchEvent(new CustomEvent('exportDataReady', {
      detail: { type: 'cems_flood', id: 'flood', ready: false }
    }));
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
          const buffer = 7 * 24 * 60 * 60 * 1000;
          if (actTime < sDate - buffer || actTime > eDate + buffer) return false;
          return true;
        });

        console.log(`[CEMS Debug] Matching flood activations in range (${new Date(sDate).toISOString()} to ${new Date(eDate).toISOString()}):`, matchingActivations.map((a: any) => a.code));

        if (matchingActivations.length === 0) {
          if (isSubscribed) {
            setActiveCemsFloodFeatures(null);
            window.dispatchEvent(new CustomEvent('exportDataReady', {
              detail: { type: 'cems_flood', id: 'flood', ready: 'empty' }
            }));
          }
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
                        properties: { 
                          aoiName: aoi.aoiName, 
                          isExtent: true,
                          isClickableAoi: true,
                          activationCode: act.code,
                          cemsType: 'flood',
                          _products: JSON.stringify(aoi.products)
                        }
                      });
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
        
        console.log(`[CEMS Debug] Total features to render:`, allFeatures.length);

        if (allFeatures.length > 0) {
          console.log('CEMS FLOOD POINTS LOADED:', allFeatures.filter((f:any) => f.geometry?.type === 'Point').length);
        }

        if (isSubscribed) {
          setActiveCemsFloodFeatures({
            type: 'FeatureCollection',
            features: allFeatures
          });
          window.dispatchEvent(new CustomEvent('exportDataReady', {
            detail: { type: 'cems_flood', id: 'flood', ready: allFeatures.length > 0 ? true : 'empty' }
          }));
        }
      } catch (err) {
        console.error('Error fetching CEMS flood data', err);
        if (isSubscribed) {
          window.dispatchEvent(new CustomEvent('exportDataReady', {
            detail: { type: 'cems_flood', id: 'flood', ready: 'empty' }
          }));
        }
      }
    })();

    return () => { isSubscribed = false; };
  }, [settings.layers, settings.globalDateMode, settings.globalStartDate, settings.globalEndDate, getEffectiveLayerDates]);

  // Fetch shakemap when selectedEarthquake changes

  // Update earthquake labels filter
  useEffect(() => {
    
    if (!map || !mapLoaded) return;
    
    settings.layers.forEach(layer => {
      if (layer.type === 'gdacs_earthquakes') {
        const baseLayerId = `dynamic-layer-${layer.id}`;
        const labelLayerId = `${baseLayerId}-label`;
        
        if (map.getLayer(baseLayerId)) {
          if (selectedEarthquake && layer.type === 'gdacs_earthquakes') {
             safeSetFilter(map, baseLayerId, ['!=', ['to-string', ['get', 'eventid']], selectedEarthquake.id]);
             if (map.getLayer(labelLayerId)) {
               safeSetFilter(map, labelLayerId, ['!=', ['to-string', ['get', 'eventid']], selectedEarthquake.id]);
             }

          } else {
             safeSetFilter(map, baseLayerId, null);
             if (map.getLayer(labelLayerId)) safeSetFilter(map, labelLayerId, null);
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
            safeSetFilter(map, layerId, ['!=', ['to-string', ['get', 'eventid']], selectedCycloneId.id]);
          } else {
            safeSetFilter(map, layerId, null);
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

    executeWhenStyleLoaded(map, () => {
      if (!map.getSource('selected-earthquake-shakemap-source')) {
      map.addSource('selected-earthquake-shakemap-source', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
      });
      

      

      addLayerSafely(map, {
        id: 'selected-earthquake-shakemap-fill',
        type: 'fill',
        source: 'selected-earthquake-shakemap-source',
        layout: { visibility: 'visible' },
        paint: {
          'fill-color': ['coalesce', ['get', 'fill'], '#ff9900'],
          'fill-opacity': 0.3
        }
      });

      addLayerSafely(map, {
        id: 'selected-earthquake-shakemap-line',
        type: 'line',
        source: 'selected-earthquake-shakemap-source',
        layout: { visibility: 'visible' },
        paint: {
          'line-color': ['coalesce', ['get', 'stroke'], '#ff0000'],
          'line-width': 1,
          'line-opacity': 0.8
        }
      });
    }

    const source = map.getSource('selected-earthquake-shakemap-source') as maplibregl.GeoJSONSource;
    if (source) {
      source.setData(selectedEarthquakeShakemap || { type: 'FeatureCollection', features: [] });
    }

    const eqLayer = settings.layers.find(l => l.type === 'gdacs_earthquakes');
    
    const useColor = eqLayer && eqLayer.colorCodeShakemap !== false;
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
      : null;
      
    const shakemapVisibility = (eqLayer && eqLayer.shakemapEnabled !== false) ? 'visible' : 'none';
    const isVisible = eqLayer ? (eqLayer._effectiveOpacityVisible ?? true) : false;
    const baseFillOpacity = isVisible ? (eqLayer?.shakemapOpacity ?? 1.0) * 0.3 : 0;
    const baseLineOpacity = isVisible ? (eqLayer?.shakemapOpacity ?? 1.0) * 0.8 : 0;
    
    if (map.getLayer('selected-earthquake-shakemap-fill')) {
      safeSetLayoutProperty(map, 'selected-earthquake-shakemap-fill', 'visibility', shakemapVisibility);
      safeSetPaintProperty(map, 'selected-earthquake-shakemap-fill', 'fill-color', colorExpr || ['coalesce', ['get', 'fill'], '#ff9900']);
      safeSetPaintProperty(map, 'selected-earthquake-shakemap-fill', 'fill-opacity', baseFillOpacity);
    }
    
    if (map.getLayer('selected-earthquake-shakemap-line')) {
      safeSetLayoutProperty(map, 'selected-earthquake-shakemap-line', 'visibility', shakemapVisibility);
      safeSetPaintProperty(map, 'selected-earthquake-shakemap-line', 'line-color', colorExpr || ['coalesce', ['get', 'stroke'], '#ff0000']);
      safeSetPaintProperty(map, 'selected-earthquake-shakemap-line', 'line-opacity', baseLineOpacity);
    }
    });
  }, [selectedEarthquakeShakemap, mapLoaded, settings.layers]);

  // Render selected CEMS earthquake VT layers
  useEffect(() => {
    
    if (!map || !mapLoaded) return;

    executeWhenStyleLoaded(map, () => {
      if (!map.getSource('selected-cems-vt-source')) {
      map.addSource('selected-cems-vt-source', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
      });


      

      addLayerSafely(map, {
        id: 'selected-cems-vt-extent-fill',
        type: 'fill',
        source: 'selected-cems-vt-source',
        filter: ['==', 'isExtent', true],
        layout: { visibility: 'visible' },
        paint: {
          'fill-color': '#ff9900',
          'fill-opacity': 0.05
        }
      });

      addLayerSafely(map, {
        id: 'selected-cems-vt-extent',
        type: 'line',
        source: 'selected-cems-vt-source',
        filter: ['==', 'isExtent', true],
        layout: { visibility: 'visible' },
        paint: {
          'line-color': '#ffff00',
          'line-width': 2,
          'line-dasharray': [2, 2]
        }
      });

      addLayerSafely(map, {
        id: 'selected-cems-vt-extent-loading',
        type: 'line',
        source: 'selected-cems-vt-source',
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
      });

      addLayerSafely(map, {
        id: 'selected-cems-vt-polygons',
        type: 'fill',
        source: 'selected-cems-vt-source',
        filter: ['all', ['==', '_isPolygon', true], ['!=', 'isExtent', true]],
        layout: { visibility: 'visible' },
        paint: {
          'fill-color': [
            'match',
            ['coalesce', ['get', 'damage_gra'], ['get', 'grading'], ['get', 'notation'], 'none'],
            'Destroyed', '#ff0000',
            'Damaged', '#ff9900',
            'Possibly damaged', '#ffff00',
            'No visible damage', '#888888',
            '#888888'
          ],
          'fill-opacity': [
            'match',
            ['coalesce', ['get', 'damage_gra'], ['get', 'grading'], ['get', 'notation'], 'none'],
            'Destroyed', 0.6,
            'Damaged', 0.6,
            'Possibly damaged', 0.6,
            'No visible damage', 0.6,
            0.25
          ]
        }
      });

      addLayerSafely(map, {
        id: 'selected-cems-vt-lines',
        type: 'line',
        source: 'selected-cems-vt-source',
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
        layout: { visibility: 'visible' },
        paint: {
          'line-color': [
            'match',
            ['coalesce', ['get', 'damage_gra'], ['get', 'grading'], ['get', 'notation'], 'none'],
            'Destroyed', '#ff0000',
            'Damaged', '#ff9900',
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

      addLayerSafely(map, {
        id: 'selected-cems-vt-points',
        type: 'circle',
        source: 'selected-cems-vt-source',
        filter: ['all', 
          ['!=', 'isExtent', true], 
          ['==', '_isPoint', true]
        ],
        layout: { visibility: 'visible' },
        paint: {
          'circle-radius': 4,
          'circle-color': [
            'match',
            ['coalesce', ['get', 'damage_gra'], ['get', 'grading'], ['get', 'notation'], 'none'],
            'Destroyed', '#ff0000',
            'Damaged', '#ff9900',
            'Possibly damaged', '#ffff00',
            'No visible damage', '#888888',
            '#888888'
          ],
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
    }

    const source = map.getSource('selected-cems-vt-source') as maplibregl.GeoJSONSource;
    if (source) {
      source.setData(selectedCemsEarthquakeFeatures || { type: 'FeatureCollection', features: [] });
    }

    const eqLayer = settings.layers.find(l => l.type === 'gdacs_earthquakes');
    const isEqCemsEnabled = eqLayer?.copernicusEnabled !== false;
    const isCemsEnabled = selectedEarthquake ? isEqCemsEnabled : isEqCemsEnabled;
    const cemsVisibility = isCemsEnabled ? 'visible' : 'none';
    const isVisible = eqLayer?._effectiveOpacityVisible ?? true;
    const cemsOpacity = isVisible ? (selectedEarthquake ? (eqLayer?.copernicusOpacity ?? 1.0) : 1.0) : 0;
    
    if (map.getLayer('selected-cems-vt-extent-fill')) {
      safeSetLayoutProperty(map, 'selected-cems-vt-extent-fill', 'visibility', cemsVisibility);
      // Keep base opacity at 0.05, scaling by cemsOpacity
      safeSetPaintProperty(map, 'selected-cems-vt-extent-fill', 'fill-opacity', 0.05 * cemsOpacity);
    }
    if (map.getLayer('selected-cems-vt-extent')) {
      safeSetLayoutProperty(map, 'selected-cems-vt-extent', 'visibility', cemsVisibility);
      safeSetPaintProperty(map, 'selected-cems-vt-extent', 'line-opacity', cemsOpacity);
    }
    if (map.getLayer('selected-cems-vt-extent-loading')) {
      safeSetLayoutProperty(map, 'selected-cems-vt-extent-loading', 'visibility', cemsVisibility);
      safeSetPaintProperty(map, 'selected-cems-vt-extent-loading', 'line-opacity', cemsOpacity);
    }
    if (map.getLayer('selected-cems-vt-polygons')) {
      safeSetLayoutProperty(map, 'selected-cems-vt-polygons', 'visibility', cemsVisibility);
      safeSetPaintProperty(map, 'selected-cems-vt-polygons', 'fill-opacity', [
        'match',
        ['coalesce', ['get', 'damage_gra'], ['get', 'grading'], ['get', 'notation'], 'none'],
        'Destroyed', 0.6 * cemsOpacity,
        'Damaged', 0.6 * cemsOpacity,
        'Possibly damaged', 0.6 * cemsOpacity,
        'No visible damage', 0.6 * cemsOpacity,
        0.25 * cemsOpacity
      ]);
    }
    if (map.getLayer('selected-cems-vt-lines')) {
      safeSetLayoutProperty(map, 'selected-cems-vt-lines', 'visibility', cemsVisibility);
      safeSetPaintProperty(map, 'selected-cems-vt-lines', 'line-opacity', [
        'match',
        ['coalesce', ['get', 'damage_gra'], ['get', 'grading'], ['get', 'notation'], 'none'],
        'Destroyed', 1 * cemsOpacity,
        'Damaged', 1 * cemsOpacity,
        'Possibly damaged', 1 * cemsOpacity,
        'No visible damage', 1 * cemsOpacity,
        0.25 * cemsOpacity
      ]);
    }
    if (map.getLayer('selected-cems-vt-points')) {
      safeSetLayoutProperty(map, 'selected-cems-vt-points', 'visibility', cemsVisibility);
      safeSetPaintProperty(map, 'selected-cems-vt-points', 'circle-opacity', cemsOpacity);
      safeSetPaintProperty(map, 'selected-cems-vt-points', 'circle-stroke-opacity', cemsOpacity);
    }

    });
  }, [selectedCemsEarthquakeFeatures, mapLoaded, settings.layers]);

  // Render CEMS Wildfire Features
  useEffect(() => {
    
    if (!map || !mapLoaded) return;

    executeWhenStyleLoaded(map, () => {

    

    if (!map.getSource('active-wildfire-cems-vt-source')) {
      map.addSource('active-wildfire-cems-vt-source', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
      });

      // Add Extent Layer
      addLayerSafely(map, {
        id: 'active-wildfire-cems-vt-extent-fill',
        type: 'fill',
        source: 'active-wildfire-cems-vt-source',
        filter: ['==', 'isExtent', true],
        layout: { 'visibility': 'visible' },
        paint: {
          'fill-color': '#ff9900',
          'fill-opacity': 0.05
        }
      });
      addLayerSafely(map, {
        id: 'active-wildfire-cems-vt-extent',
        type: 'line',
        source: 'active-wildfire-cems-vt-source',
        filter: ['==', 'isExtent', true],
        layout: {
          'line-join': 'round',
          'line-cap': 'round',
          'visibility': 'visible'
        },
        paint: {
          'line-color': '#ff9900',
          'line-width': 2,
          'line-dasharray': [2, 2]
        }
      });
      addLayerSafely(map, {
        id: 'active-wildfire-cems-vt-extent-loading',
        type: 'line',
        source: 'active-wildfire-cems-vt-source',
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
      });

      // Add Polygons
      addLayerSafely(map, {
        id: 'active-wildfire-cems-vt-polygons',
        type: 'fill',
        source: 'active-wildfire-cems-vt-source',
        filter: ['all', ['==', '_isPolygon', true], ['!=', 'isExtent', true]],
        layout: { 'visibility': 'visible' },
        paint: {
          'fill-color': [
            'match',
            ['coalesce', ['get', 'damage_gra'], ['get', 'grading'], ['get', 'notation'], 'none'],
            'Destroyed', '#ff0000',
            'Damaged', '#ff9900',
            'Possibly damaged', '#ffff00',
            'No visible damage', '#888888',
            '#ff0000'
          ]
        }
      });

      // Add Lines
      addLayerSafely(map, {
        id: 'active-wildfire-cems-vt-lines',
        type: 'line',
        source: 'active-wildfire-cems-vt-source',
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
            'Damaged', '#ff9900',
            'Possibly damaged', '#ffff00',
            'No visible damage', '#888888',
            '#888888'
          ],
          'line-width': 3
        }
      });

      // Add Points
      addLayerSafely(map, {
        id: 'active-wildfire-cems-vt-points',
        type: 'circle',
        source: 'active-wildfire-cems-vt-source',
        filter: ['all', 
          ['!=', 'isExtent', true],
          ['==', '_isPoint', true]
        ],
        layout: { 'visibility': 'visible' },
        paint: {
          'circle-color': [
            'match',
            ['coalesce', ['get', 'damage_gra'], ['get', 'grading'], ['get', 'notation'], 'none'],
            'Destroyed', '#ff0000',
            'Damaged', '#ff9900',
            'Possibly damaged', '#ffff00',
            'No visible damage', '#888888',
            '#888888'
          ],
          'circle-radius': 4,
          'circle-opacity': 1,
          'circle-stroke-width': 0
        }
      });
    }

    const wfLayer = settings.layers.find(l => l.type === 'wildfires');
    const isCemsEnabled = (wfLayer?.copernicusEnabled !== false) && !!activeCemsWildfireFeatures;
    const cemsVisibility = isCemsEnabled ? 'visible' : 'none';
    const isVisible = wfLayer?._effectiveOpacityVisible ?? true;
    const cemsOpacity = isVisible ? (wfLayer?.copernicusOpacity ?? 1.0) : 0;
    
    if (map.getLayer('active-wildfire-cems-vt-extent-fill')) {
      safeSetLayoutProperty(map, 'active-wildfire-cems-vt-extent-fill', 'visibility', cemsVisibility);
    }
    if (map.getLayer('active-wildfire-cems-vt-extent')) {
      safeSetLayoutProperty(map, 'active-wildfire-cems-vt-extent', 'visibility', cemsVisibility);
      safeSetPaintProperty(map, 'active-wildfire-cems-vt-extent', 'line-opacity', cemsOpacity);
    }
    if (map.getLayer('active-wildfire-cems-vt-extent-loading')) {
      safeSetLayoutProperty(map, 'active-wildfire-cems-vt-extent-loading', 'visibility', cemsVisibility);
      safeSetPaintProperty(map, 'active-wildfire-cems-vt-extent-loading', 'line-opacity', cemsOpacity);
    }
    if (map.getLayer('active-wildfire-cems-vt-polygons')) {
      safeSetLayoutProperty(map, 'active-wildfire-cems-vt-polygons', 'visibility', cemsVisibility);
      safeSetPaintProperty(map, 'active-wildfire-cems-vt-polygons', 'fill-opacity', [
        'case',
        ['==', ['coalesce', ['get', 'obj_type'], ''], 'Not Analysed'], 0,
        ['match',
          ['coalesce', ['get', 'damage_gra'], ['get', 'grading'], ['get', 'notation'], 'none'],
          'Destroyed', 0.6 * cemsOpacity,
          'Damaged', 0.6 * cemsOpacity,
          'Possibly damaged', 0.6 * cemsOpacity,
          'No visible damage', 0.6 * cemsOpacity,
          0.6 * cemsOpacity
        ]
      ]);
    }
    if (map.getLayer('active-wildfire-cems-vt-lines')) {
      safeSetLayoutProperty(map, 'active-wildfire-cems-vt-lines', 'visibility', cemsVisibility);
      safeSetPaintProperty(map, 'active-wildfire-cems-vt-lines', 'line-opacity', [
        'match',
        ['coalesce', ['get', 'damage_gra'], ['get', 'grading'], ['get', 'notation'], 'none'],
        'Destroyed', cemsOpacity,
        'Damaged', cemsOpacity,
        'Possibly damaged', cemsOpacity,
        'No visible damage', cemsOpacity,
        0.25 * cemsOpacity
      ]);
    }
    if (map.getLayer('active-wildfire-cems-vt-points')) {
      safeSetLayoutProperty(map, 'active-wildfire-cems-vt-points', 'visibility', cemsVisibility);
      safeSetPaintProperty(map, 'active-wildfire-cems-vt-points', 'circle-opacity', [
        'match',
        ['coalesce', ['get', 'damage_gra'], ['get', 'grading'], ['get', 'notation'], 'none'],
        'Destroyed', cemsOpacity,
        'Damaged', cemsOpacity,
        'Possibly damaged', cemsOpacity,
        'No visible damage', cemsOpacity,
        0.25 * cemsOpacity
      ]);
    }

    });
  }, [activeCemsWildfireFeatures, mapLoaded, settings.layers]);


  // Heavy setData operation isolated to prevent memory leaks on settings save
  useEffect(() => {
    if (!map) return;
    
    let attempts = 0;
    const interval = setInterval(() => {
      const source = map.getSource('active-wildfire-cems-vt-source') as maplibregl.GeoJSONSource;
      if (source) {
        source.setData(activeCemsWildfireFeatures || { type: 'FeatureCollection', features: [] });
        clearInterval(interval);
      }
      attempts++;
      if (attempts > 20) clearInterval(interval);
    }, 500);
    
    return () => clearInterval(interval);
  }, [activeCemsWildfireFeatures, map]);

  // Heavy setData operation isolated to prevent memory leaks on settings save
  useEffect(() => {
    if (!map) return;
    
    let attempts = 0;
    const interval = setInterval(() => {
      const source = map.getSource('active-flood-cems-vt-source') as maplibregl.GeoJSONSource;
      if (source) {
        source.setData(activeCemsFloodFeatures || { type: 'FeatureCollection', features: [] });
        clearInterval(interval);
      }
      attempts++;
      if (attempts > 20) clearInterval(interval);
    }, 500);
    
    return () => clearInterval(interval);
  }, [activeCemsFloodFeatures, map]);

  // Flood CEMS VT rendering
  useEffect(() => {
    
    if (!map || !mapLoaded) return;

    executeWhenStyleLoaded(map, () => {

    

    if (!map.getSource('active-flood-cems-vt-source')) {
      map.addSource('active-flood-cems-vt-source', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
        tolerance: 0.5 // Reduce geometry complexity to save Web Worker RAM
      });

      // Add Extent Layer
      addLayerSafely(map, {
        id: 'active-flood-cems-vt-extent-fill',
        type: 'fill',
        source: 'active-flood-cems-vt-source',
        filter: ['==', 'isExtent', true],
        layout: { 'visibility': 'visible' },
        paint: {
          'fill-color': '#00aaff',
          'fill-opacity': 0.05
        }
      });
      addLayerSafely(map, {
        id: 'active-flood-cems-vt-extent',
        type: 'line',
        source: 'active-flood-cems-vt-source',
        filter: ['==', 'isExtent', true],
        layout: {
          'line-join': 'round',
          'line-cap': 'round',
          'visibility': 'visible'
        },
        paint: {
          'line-color': '#3366ff',
          'line-width': 2,
          'line-dasharray': [2, 2]
        }
      });
      addLayerSafely(map, {
        id: 'active-flood-cems-vt-extent-loading',
        type: 'line',
        source: 'active-flood-cems-vt-source',
        filter: ['all', ['==', 'isExtent', true], ['in', 'activationCode', 'NONE']],
        layout: { 'visibility': 'visible' },
        paint: {
          'line-color': '#ffffff',
          'line-width': 3,
          'line-dasharray': [2, 2]
        }
      });

      // Add Polygons
      addLayerSafely(map, {
        id: 'active-flood-cems-vt-polygons',
        type: 'fill',
        source: 'active-flood-cems-vt-source',
        filter: ['all', ['==', '_isPolygon', true], ['!=', 'isExtent', true]],
        layout: { 'visibility': 'visible' },
        paint: {
          'fill-color': [
            'match',
            ['coalesce', ['get', 'damage_gra'], ['get', 'grading'], ['get', 'notation'], 'none'],
            'Destroyed', '#ff0000',
            'Damaged', '#ff8c00',
            'Possibly damaged', '#ffff00',
            'No visible damage', '#888888',
            '#0000ff'
          ]
        }
      });

      // Add Lines
      addLayerSafely(map, {
        id: 'active-flood-cems-vt-lines',
        type: 'line',
        source: 'active-flood-cems-vt-source',
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
          'line-width': 3
        }
      });

      // Add Points
      addLayerSafely(map, {
        id: 'active-flood-cems-vt-points',
        type: 'circle',
        source: 'active-flood-cems-vt-source',
        filter: ['all', 
          ['!=', 'isExtent', true],
          ['==', '_isPoint', true]
        ],
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
          'circle-radius': 4
        }
      });
    }

    const floodLayer = settings.layers.find(l => l.id === 'floods');
    const isCemsEnabled = (floodLayer?.copernicusEnabled !== false) && !!activeCemsFloodFeatures;
    const cemsVisibility = isCemsEnabled ? 'visible' : 'none';
    const isVisible = floodLayer?._effectiveOpacityVisible ?? true;
    const cemsOpacity = isVisible ? (floodLayer?.copernicusOpacity ?? 1.0) : 0;
    
    if (map.getLayer('active-flood-cems-vt-extent-fill')) {
      safeSetLayoutProperty(map, 'active-flood-cems-vt-extent-fill', 'visibility', cemsVisibility);
    }
    if (map.getLayer('active-flood-cems-vt-extent')) {
      safeSetLayoutProperty(map, 'active-flood-cems-vt-extent', 'visibility', cemsVisibility);
      safeSetPaintProperty(map, 'active-flood-cems-vt-extent', 'line-opacity', cemsOpacity);
    }
    if (map.getLayer('active-flood-cems-vt-extent-loading')) {
      safeSetLayoutProperty(map, 'active-flood-cems-vt-extent-loading', 'visibility', cemsVisibility);
      safeSetPaintProperty(map, 'active-flood-cems-vt-extent-loading', 'line-opacity', cemsOpacity);
    }
    if (map.getLayer('active-flood-cems-vt-polygons')) {
      safeSetLayoutProperty(map, 'active-flood-cems-vt-polygons', 'visibility', cemsVisibility);
      safeSetPaintProperty(map, 'active-flood-cems-vt-polygons', 'fill-opacity', [
        'case',
        ['==', ['coalesce', ['get', 'obj_type'], ''], 'Not Analysed'], 0,
        ['match',
          ['coalesce', ['get', 'damage_gra'], ['get', 'grading'], ['get', 'notation'], 'none'],
          'Destroyed', 0.6 * cemsOpacity,
          'Damaged', 0.6 * cemsOpacity,
          'Possibly damaged', 0.6 * cemsOpacity,
          'No visible damage', 0.6 * cemsOpacity,
          0.6 * cemsOpacity
        ]
      ]);
    }
    if (map.getLayer('active-flood-cems-vt-lines')) {
      safeSetLayoutProperty(map, 'active-flood-cems-vt-lines', 'visibility', cemsVisibility);
      safeSetPaintProperty(map, 'active-flood-cems-vt-lines', 'line-opacity', [
        'match',
        ['coalesce', ['get', 'damage_gra'], ['get', 'grading'], ['get', 'notation'], 'none'],
        'Destroyed', cemsOpacity,
        'Damaged', cemsOpacity,
        'Possibly damaged', cemsOpacity,
        'No visible damage', cemsOpacity,
        0.25 * cemsOpacity
      ]);
    }
    if (map.getLayer('active-flood-cems-vt-points')) {
      safeSetLayoutProperty(map, 'active-flood-cems-vt-points', 'visibility', cemsVisibility);
      safeSetPaintProperty(map, 'active-flood-cems-vt-points', 'circle-opacity', [
        'match',
        ['coalesce', ['get', 'damage_gra'], ['get', 'grading'], ['get', 'notation'], 'none'],
        'Destroyed', cemsOpacity,
        'Damaged', cemsOpacity,
        'Possibly damaged', cemsOpacity,
        'No visible damage', cemsOpacity,
        0.25 * cemsOpacity
      ]);
    }

    });
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

    executeWhenStyleLoaded(map, () => {
      if (!map.getSource('selected-volcano-polygon-source')) {
        map.addSource('selected-volcano-polygon-source', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] }
        });

        addLayerSafely(map, {
          id: 'selected-volcano-polygon-fill',
          type: 'fill',
          source: 'selected-volcano-polygon-source',
          paint: {
            'fill-color': ['coalesce', ['get', 'fillColor'], '#ff0000'],
            'fill-opacity': 0.3
          }
        });

        addLayerSafely(map, {
          id: 'selected-volcano-polygon-line',
          type: 'line',
          source: 'selected-volcano-polygon-source',
          paint: {
            'line-color': ['coalesce', ['get', 'color'], '#ff0000'],
            'line-width': 1,
            'line-opacity': 0.8
          }
        });
      }
    });

    const source = map.getSource('selected-volcano-polygon-source') as maplibregl.GeoJSONSource;
    if (source) {
      source.setData(selectedVolcanoPolygon || { type: 'FeatureCollection', features: [] });
    }
    
    const volLayer = settings.layers.find(l => l.type === 'gdacs_volcanoes');
    const isVisible = volLayer?._effectiveOpacityVisible ?? true;
    const fillOpacity = isVisible ? 0.3 : 0;
    const lineOpacity = isVisible ? 0.8 : 0;

    if (map.getLayer('selected-volcano-polygon-fill')) {
      safeSetPaintProperty(map, 'selected-volcano-polygon-fill', 'fill-opacity', fillOpacity);
    }
    
    if (map.getLayer('selected-volcano-polygon-line')) {
      safeSetPaintProperty(map, 'selected-volcano-polygon-line', 'line-opacity', lineOpacity);
    }
  }, [selectedVolcanoPolygon, mapLoaded, settings.layers]);
  // Animate loading CEMS AOI lines
  useEffect(() => {
    if (!map || !mapLoaded) return;
    
    if (loadingCemsAois.length === 0) {
      // Clean up filters when nothing is loading
      if (map.getLayer('active-wildfire-cems-vt-extent-loading')) {
        map.setFilter('active-wildfire-cems-vt-extent-loading', ['all', ['==', 'isExtent', true], ['in', 'activationCode', 'NONE']]);
      }
      if (map.getLayer('active-wildfire-cems-vt-extent')) {
        map.setFilter('active-wildfire-cems-vt-extent', ['==', 'isExtent', true]);
      }
      if (map.getLayer('active-flood-cems-vt-extent-loading')) {
        map.setFilter('active-flood-cems-vt-extent-loading', ['all', ['==', 'isExtent', true], ['in', 'activationCode', 'NONE']]);
      }
      if (map.getLayer('active-flood-cems-vt-extent')) {
        map.setFilter('active-flood-cems-vt-extent', ['==', 'isExtent', true]);
      }
      if (map.getLayer('selected-cems-vt-extent-loading')) {
        map.setFilter('selected-cems-vt-extent-loading', ['all', ['==', 'isExtent', true], ['in', 'activationCode', 'NONE']]);
      }
      if (map.getLayer('selected-cems-vt-extent')) {
        map.setFilter('selected-cems-vt-extent', ['==', 'isExtent', true]);
      }
      return;
    }

    // Apply filters to route only the loading items to the animated layer
    if (map.getLayer('active-wildfire-cems-vt-extent-loading')) {
      map.setFilter('active-wildfire-cems-vt-extent-loading', ['all', ['==', 'isExtent', true], ['in', 'activationCode', ...loadingCemsAois]] as any);
    }
    if (map.getLayer('active-wildfire-cems-vt-extent')) {
      map.setFilter('active-wildfire-cems-vt-extent', ['all', ['==', 'isExtent', true], ['!', ['in', 'activationCode', ...loadingCemsAois]]] as any);
    }
    if (map.getLayer('active-flood-cems-vt-extent-loading')) {
      map.setFilter('active-flood-cems-vt-extent-loading', ['all', ['==', 'isExtent', true], ['in', 'activationCode', ...loadingCemsAois]] as any);
    }
    if (map.getLayer('active-flood-cems-vt-extent')) {
      map.setFilter('active-flood-cems-vt-extent', ['all', ['==', 'isExtent', true], ['!', ['in', 'activationCode', ...loadingCemsAois]]] as any);
    }
    if (map.getLayer('selected-cems-vt-extent-loading')) {
      map.setFilter('selected-cems-vt-extent-loading', ['all', ['==', 'isExtent', true], ['in', 'activationCode', ...loadingCemsAois]] as any);
    }
    if (map.getLayer('selected-cems-vt-extent')) {
      map.setFilter('selected-cems-vt-extent', ['all', ['==', 'isExtent', true], ['!', ['in', 'activationCode', ...loadingCemsAois]]] as any);
    }

    const dashArraySequence = [
      [0, 4, 3], [0.5, 4, 2.5], [1, 4, 2], [1.5, 4, 1.5],
      [2, 4, 1], [2.5, 4, 0.5], [3, 4, 0], [0, 0, 3, 4],
      [0, 0.5, 3, 4], [0, 1, 3, 4], [0, 1.5, 3, 4],
      [0, 2, 3, 4], [0, 2.5, 3, 4], [0, 3, 3, 4]
    ];
    
    let step = 0;
    let animationId: number;
    let lastTime = 0;
    
    const animateThrottled = (t: number) => {
      if (t - lastTime > 60) {
        step = (step + 1) % dashArraySequence.length;
        if (map.getLayer('active-wildfire-cems-vt-extent-loading')) {
          map.setPaintProperty('active-wildfire-cems-vt-extent-loading', 'line-dasharray', dashArraySequence[step]);
        }
        if (map.getLayer('active-flood-cems-vt-extent-loading')) {
          map.setPaintProperty('active-flood-cems-vt-extent-loading', 'line-dasharray', dashArraySequence[step]);
        }
        if (map.getLayer('selected-cems-vt-extent-loading')) {
          map.setPaintProperty('selected-cems-vt-extent-loading', 'line-dasharray', dashArraySequence[step]);
        }
        lastTime = t;
      }
      animationId = requestAnimationFrame(animateThrottled);
    };

    animationId = requestAnimationFrame(animateThrottled);

    return () => {
      cancelAnimationFrame(animationId);
    };
  }, [map, mapLoaded, loadingCemsAois]);
  // CEMS Detail Fetch Listener
  useEffect(() => {
    const handleFetchCemsDetails = async (e: CustomEvent) => {
      const { cemsType, products, activationCode } = e.detail;
      if (!products || !activationCode) return;
      
      setLoadingCemsAois(prev => [...prev, activationCode]);
      
      const vtPromises: Promise<any>[] = [];
      const productsWithVt = products.filter((p: any) => p.layers && p.layers.some((l: any) => l.format === 'vt'));
      const latestProduct = productsWithVt.length > 0 ? productsWithVt.sort((a: any, b: any) => {
        const typePrio: any = { 'GRA': 4, 'DEL': 3, 'FEP': 2, 'REF': 1 };
        const prioDiff = (typePrio[b.type] || 0) - (typePrio[a.type] || 0);
        if (prioDiff !== 0) return prioDiff;
        return (b.monitoringNumber || 0) - (a.monitoringNumber || 0);
      })[0] : null;
      
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
      
      try {
        const vtResults = await Promise.all(vtPromises);
        const detailedFeatures: any[] = [];
        for (const vtFeatures of vtResults) {
          const filtered = vtFeatures.filter((f: any) => {
            let dmg = (f.properties?.damage_gra || f.properties?.grading || f.properties?.notation || '').toLowerCase().trim();
            let obj = (f.properties?.obj_type || '').toLowerCase().trim();
            
            if (cemsType === 'wildfire') {
              if (dmg === 'no visible damage' || dmg === 'not analysed' || dmg === 'not analyzed') return false;
            }
            if (obj === 'not analysed' || obj === 'not analyzed') return false;
            
            const normalize = (str: any) => {
              if (!str || typeof str !== 'string') return str;
              str = str.trim();
              if (!str) return str;
              return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
            };
            
            if (f.properties) {
              if (f.properties.damage_gra) f.properties.damage_gra = normalize(f.properties.damage_gra);
              if (f.properties.grading) f.properties.grading = normalize(f.properties.grading);
              if (f.properties.notation) f.properties.notation = normalize(f.properties.notation);
              f.properties._isPoint = f.geometry?.type === 'Point' || f.geometry?.type === 'MultiPoint';
              f.properties._isLineString = f.geometry?.type === 'LineString' || f.geometry?.type === 'MultiLineString';
              f.properties._isPolygon = f.geometry?.type === 'Polygon' || f.geometry?.type === 'MultiPolygon';
            }
            return true;
          });
          detailedFeatures.push(...filtered);
        }
        
        if (cemsType === 'wildfire') {
          setActiveCemsWildfireFeatures((prev: any) => {
            if (!prev || !prev.features) return prev;
            // Prevent adding duplicates
            const newFeatures = detailedFeatures.filter(df => !prev.features.some((pf: any) => pf.properties?._uid === df.properties?._uid && df.properties?._uid !== undefined));
            return { type: 'FeatureCollection', features: [...prev.features, ...newFeatures] };
          });
        } else if (cemsType === 'flood') {
          setActiveCemsFloodFeatures((prev: any) => {
            if (!prev || !prev.features) return prev;
            const newFeatures = detailedFeatures.filter(df => !prev.features.some((pf: any) => pf.properties?._uid === df.properties?._uid && df.properties?._uid !== undefined));
            return { type: 'FeatureCollection', features: [...prev.features, ...newFeatures] };
          });
        } else if (cemsType === 'earthquake') {
          setSelectedCemsEarthquakeFeatures((prev: any) => {
            if (!prev || !prev.features) return prev;
            const newFeatures = detailedFeatures.filter(df => !prev.features.some((pf: any) => pf.properties?._uid === df.properties?._uid && df.properties?._uid !== undefined));
            return { type: 'FeatureCollection', features: [...prev.features, ...newFeatures] };
          });
        }
      } catch (err) {
        console.error('Failed to load detailed CEMS features', err);
      } finally {
        setLoadingCemsAois(prev => prev.filter(c => c !== activationCode));
      }
    };
    
    window.addEventListener('fetchCemsDetails', handleFetchCemsDetails as unknown as EventListener);
    return () => {
      window.removeEventListener('fetchCemsDetails', handleFetchCemsDetails as unknown as EventListener);
    };
  }, [setActiveCemsWildfireFeatures, setActiveCemsFloodFeatures, setSelectedCemsEarthquakeFeatures]);

};
