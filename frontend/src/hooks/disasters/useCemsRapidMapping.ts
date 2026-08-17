import { useEffect, useState, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import type { AppSettings } from '../../types';
import { safeSetLayoutProperty, safeSetPaintProperty, executeWhenStyleLoaded, safeFetchCemsJson } from '../../utils/mapUtils';
import { setupCemsLayers } from './cemsLayerUtils';
import { useCemsFetchDisaster } from './useCemsFetchDisaster';

export interface UseCemsRapidMappingProps {
  map: maplibregl.Map | null;
  mapLoaded: boolean;
  settings: AppSettings;
  selectedEarthquake: any;
  selectedCemsEarthquakeFeatures: any;
  setSelectedCemsEarthquakeFeatures: React.Dispatch<React.SetStateAction<any>>;
}

export const useCemsRapidMapping = ({
  map,
  mapLoaded,
  settings,
  selectedEarthquake,
  selectedCemsEarthquakeFeatures,
  setSelectedCemsEarthquakeFeatures,
}: UseCemsRapidMappingProps) => {
  const [activeCemsWildfireFeatures, setActiveCemsWildfireFeatures] = useState<any>(null);
  const [activeCemsFloodFeatures, setActiveCemsFloodFeatures] = useState<any>(null);
  const [loadingCemsAois, setLoadingCemsAois] = useState<string[]>([]);
  const allCemsActivationsRef = useRef<Promise<any> | null>(null);
  const cemsFeatureCacheRef = useRef<Record<string, any>>({});

  // 1. Force immediate re-evaluation on layer changes
  useEffect(() => {
    if (!map || !mapLoaded) return;
    executeWhenStyleLoaded(map, () => {
      safeSetLayoutProperty(map, 'active-wildfire-cems-vt-layer', 'visibility', 'none');
      safeSetLayoutProperty(map, 'active-flood-cems-vt-layer', 'visibility', 'none');
    });
  }, [settings.layers]);

  // 2. GeoJSON Export Listener for CEMS Wildfires and Floods
  useEffect(() => {
    const handleExport = (e: CustomEvent) => {
      if (!e.detail?.type) return;
      if (e.detail.type === 'cems_wildfire' || e.detail.type === 'cems_flood') {
        import('../../utils/exportUtils').then(({ downloadGeoJSON, processCemsGeometry }) => {
          if (e.detail.type === 'cems_wildfire' && activeCemsWildfireFeatures) {
            const processedCems = processCemsGeometry(activeCemsWildfireFeatures);
            downloadGeoJSON(processedCems, `cems_wildfire_damage.geojson`);
          } else if (e.detail.type === 'cems_flood' && activeCemsFloodFeatures) {
            const processedCems = processCemsGeometry(activeCemsFloodFeatures);
            downloadGeoJSON(processedCems, `cems_flood_damage.geojson`);
          }
        });
      }
    };
    window.addEventListener('requestGeoJsonExport', handleExport as EventListener);
    return () => window.removeEventListener('requestGeoJsonExport', handleExport as EventListener);
  }, [activeCemsWildfireFeatures, activeCemsFloodFeatures]);

  const [activeDownloadAoi, setActiveDownloadAoi] = useState<{ aoiName: string, cemsType: string, coordinates: [number, number] } | null>(null);
  const downloadMarkerRef = useRef<maplibregl.Marker | null>(null);

  const latestFeaturesRef = useRef({
    wildfire: activeCemsWildfireFeatures,
    flood: activeCemsFloodFeatures,
    earthquake: selectedCemsEarthquakeFeatures
  });

  useEffect(() => {
    latestFeaturesRef.current = {
      wildfire: activeCemsWildfireFeatures,
      flood: activeCemsFloodFeatures,
      earthquake: selectedCemsEarthquakeFeatures
    };
  }, [activeCemsWildfireFeatures, activeCemsFloodFeatures, selectedCemsEarthquakeFeatures]);

  // 3. Setup Data Sources & Mapbox Layers
  useEffect(() => {
    if (!map || !mapLoaded) return;
    
    const ensureSources = () => {
      executeWhenStyleLoaded(map, () => {
        // If the source was missing, setupCemsLayers will recreate it with []
        setupCemsLayers(map, 'active-wildfire-cems-vt-source');
        setupCemsLayers(map, 'active-flood-cems-vt-source');
        setupCemsLayers(map, 'selected-cems-vt-source');
        
        // Re-inject the current feature data into the recreated sources
        const wfSource = map.getSource('active-wildfire-cems-vt-source') as maplibregl.GeoJSONSource;
        if (wfSource && latestFeaturesRef.current.wildfire) wfSource.setData(latestFeaturesRef.current.wildfire);
        
        const flSource = map.getSource('active-flood-cems-vt-source') as maplibregl.GeoJSONSource;
        if (flSource && latestFeaturesRef.current.flood) flSource.setData(latestFeaturesRef.current.flood);
        
        const eqSource = map.getSource('selected-cems-vt-source') as maplibregl.GeoJSONSource;
        if (eqSource && latestFeaturesRef.current.earthquake) eqSource.setData(latestFeaturesRef.current.earthquake);
      });
    };
    
    // Initial setup
    ensureSources();
    
    // If the app changes the basemap style (e.g. light/dark mode switch),
    // Mapbox wipes all runtime-added sources. We must re-add them.
    map.on('style.load', ensureSources);
    
    return () => {
      map.off('style.load', ensureSources);
    };
  }, [map, mapLoaded]);

  // 4. Fetch CEMS AOIs for Wildfires
  useCemsFetchDisaster({
    layerId: 'wildfires',
    category: 'Wildfire',
    cemsType: 'wildfire',
    settings,
    map,
    allCemsActivationsRef,
    cemsFeatureCacheRef,
    activeFeatures: activeCemsWildfireFeatures,
    setActiveFeatures: setActiveCemsWildfireFeatures
  });

  // 3. Fetch CEMS AOIs for Floods
  useCemsFetchDisaster({
    layerId: 'floods',
    category: 'Flood',
    cemsType: 'flood',
    settings,
    map,
    allCemsActivationsRef,
    cemsFeatureCacheRef,
    activeFeatures: activeCemsFloodFeatures,
    setActiveFeatures: setActiveCemsFloodFeatures
  });

  // 4. Update Mapbox Data Sources
  const updateDataSource = (sourceId: string, data: any) => {
    if (!map) return () => {};
    let attempts = 0;
    console.log(`[CEMS Mapbox Debug] Attempting to set ${data?.features?.length || 0} features to ${sourceId}...`);
    const interval = setInterval(() => {
      const source = map.getSource(sourceId) as maplibregl.GeoJSONSource;
      if (source) {
        source.setData(data || { type: 'FeatureCollection', features: [] });
        console.log(`[CEMS Mapbox Debug] SUCCESS setting data for ${sourceId}:`, data?.features?.length || 0, 'features');
        if (data && data.features && data.features.length > 0) {
           console.log(`[CEMS Mapbox Debug] Sample feature geometry:`, JSON.stringify(data.features[0].geometry));
        }
        clearInterval(interval);
      }
      if (++attempts > 20) {
        console.log(`[CEMS Mapbox Debug] FAILED to set data for ${sourceId} after 20 attempts`);
        clearInterval(interval);
      }
    }, 500);
    return () => clearInterval(interval);
  };

  useEffect(() => { return updateDataSource('active-wildfire-cems-vt-source', activeCemsWildfireFeatures); }, [activeCemsWildfireFeatures, map]);
  useEffect(() => { return updateDataSource('active-flood-cems-vt-source', activeCemsFloodFeatures); }, [activeCemsFloodFeatures, map]);
  useEffect(() => { return updateDataSource('selected-cems-vt-source', selectedCemsEarthquakeFeatures); }, [selectedCemsEarthquakeFeatures, map]);

  // 5. Update Mapbox Layer Visibility and Opacity dynamically based on settings
  useEffect(() => {
    if (!map || !mapLoaded) return;
    
    executeWhenStyleLoaded(map, () => {
      const buildDimOp = (baseOp: any) => {
        if (!activeDownloadAoi) return baseOp;
        return ['case', ['==', ['get', 'aoiName'], activeDownloadAoi.aoiName], ['*', 0.1, baseOp], baseOp];
      };

      const buildExtentColor = (baseColor: any) => {
        if (!activeDownloadAoi) return baseColor;
        return ['case', ['==', ['get', 'aoiName'], activeDownloadAoi.aoiName], '#ffffff', baseColor];
      };

      const buildExtentWidth = (baseWidth: any) => {
        if (!activeDownloadAoi) return baseWidth;
        return ['case', ['==', ['get', 'aoiName'], activeDownloadAoi.aoiName], 4, baseWidth];
      };

      // Wildfires
      const wfLayer = settings.layers.find(l => l.id === 'wildfires');
      const wfCemsOpacity = (wfLayer?._effectiveOpacityVisible ?? true) ? (wfLayer?.copernicusOpacity ?? 1.0) : 0;
      const wfCemsVis = (wfLayer?.copernicusEnabled !== false) && !!activeCemsWildfireFeatures ? 'visible' : 'none';

      if (map.getLayer('active-wildfire-cems-vt-extent-fill')) { safeSetLayoutProperty(map, 'active-wildfire-cems-vt-extent-fill', 'visibility', wfCemsVis); safeSetPaintProperty(map, 'active-wildfire-cems-vt-extent-fill', 'fill-opacity', 0.05 * wfCemsOpacity); }
      if (map.getLayer('active-wildfire-cems-vt-extent')) { safeSetLayoutProperty(map, 'active-wildfire-cems-vt-extent', 'visibility', wfCemsVis); safeSetPaintProperty(map, 'active-wildfire-cems-vt-extent', 'line-color', buildExtentColor('#ff0000')); safeSetPaintProperty(map, 'active-wildfire-cems-vt-extent', 'line-width', buildExtentWidth(2)); safeSetPaintProperty(map, 'active-wildfire-cems-vt-extent', 'line-opacity', wfCemsOpacity); }
      if (map.getLayer('active-wildfire-cems-vt-extent-loading')) { safeSetLayoutProperty(map, 'active-wildfire-cems-vt-extent-loading', 'visibility', wfCemsVis); safeSetPaintProperty(map, 'active-wildfire-cems-vt-extent-loading', 'line-opacity', wfCemsOpacity); }
      if (map.getLayer('active-wildfire-cems-vt-polygons')) { safeSetLayoutProperty(map, 'active-wildfire-cems-vt-polygons', 'visibility', wfCemsVis); safeSetPaintProperty(map, 'active-wildfire-cems-vt-polygons', 'fill-opacity', buildDimOp(['case', ['==', ['coalesce', ['get', 'obj_type'], ''], 'Not Analysed'], 0, ['match', ['coalesce', ['get', 'damage_gra'], ['get', 'grading'], ['get', 'notation'], 'none'], 'Destroyed', 0.6 * wfCemsOpacity, 'Damaged', 0.6 * wfCemsOpacity, 'Possibly damaged', 0.6 * wfCemsOpacity, 'No visible damage', 0.6 * wfCemsOpacity, 0.6 * wfCemsOpacity]])); }
      if (map.getLayer('active-wildfire-cems-vt-lines')) { safeSetLayoutProperty(map, 'active-wildfire-cems-vt-lines', 'visibility', wfCemsVis); safeSetPaintProperty(map, 'active-wildfire-cems-vt-lines', 'line-opacity', buildDimOp(['match', ['coalesce', ['get', 'damage_gra'], ['get', 'grading'], ['get', 'notation'], 'none'], 'Destroyed', 1 * wfCemsOpacity, 'Damaged', 1 * wfCemsOpacity, 'Possibly damaged', 1 * wfCemsOpacity, 'No visible damage', 1 * wfCemsOpacity, 0.25 * wfCemsOpacity])); }
      if (map.getLayer('active-wildfire-cems-vt-points')) { safeSetLayoutProperty(map, 'active-wildfire-cems-vt-points', 'visibility', wfCemsVis); safeSetPaintProperty(map, 'active-wildfire-cems-vt-points', 'circle-opacity', buildDimOp(wfCemsOpacity)); }

      // Floods
      const flLayer = settings.layers.find(l => l.id === 'floods');
      const flCemsOpacity = (flLayer?._effectiveOpacityVisible ?? true) ? (flLayer?.copernicusOpacity ?? 1.0) : 0;
      const flCemsVis = (flLayer?.copernicusEnabled !== false) && !!activeCemsFloodFeatures ? 'visible' : 'none';

      if (map.getLayer('active-flood-cems-vt-extent-fill')) { safeSetLayoutProperty(map, 'active-flood-cems-vt-extent-fill', 'visibility', flCemsVis); safeSetPaintProperty(map, 'active-flood-cems-vt-extent-fill', 'fill-opacity', 0.05 * flCemsOpacity); }
      if (map.getLayer('active-flood-cems-vt-extent')) { safeSetLayoutProperty(map, 'active-flood-cems-vt-extent', 'visibility', flCemsVis); safeSetPaintProperty(map, 'active-flood-cems-vt-extent', 'line-color', buildExtentColor('#0000ff')); safeSetPaintProperty(map, 'active-flood-cems-vt-extent', 'line-width', buildExtentWidth(2)); safeSetPaintProperty(map, 'active-flood-cems-vt-extent', 'line-opacity', flCemsOpacity); }
      if (map.getLayer('active-flood-cems-vt-extent-loading')) { safeSetLayoutProperty(map, 'active-flood-cems-vt-extent-loading', 'visibility', flCemsVis); safeSetPaintProperty(map, 'active-flood-cems-vt-extent-loading', 'line-opacity', flCemsOpacity); }
      if (map.getLayer('active-flood-cems-vt-polygons')) { safeSetLayoutProperty(map, 'active-flood-cems-vt-polygons', 'visibility', flCemsVis); safeSetPaintProperty(map, 'active-flood-cems-vt-polygons', 'fill-opacity', buildDimOp(['case', ['==', ['coalesce', ['get', 'obj_type'], ''], 'Not Analysed'], 0, ['match', ['coalesce', ['get', 'damage_gra'], ['get', 'grading'], ['get', 'notation'], 'none'], 'Destroyed', 0.6 * flCemsOpacity, 'Damaged', 0.6 * flCemsOpacity, 'Possibly damaged', 0.6 * flCemsOpacity, 'No visible damage', 0.6 * flCemsOpacity, 0.6 * flCemsOpacity]])); }
      if (map.getLayer('active-flood-cems-vt-lines')) { safeSetLayoutProperty(map, 'active-flood-cems-vt-lines', 'visibility', flCemsVis); safeSetPaintProperty(map, 'active-flood-cems-vt-lines', 'line-opacity', buildDimOp(['match', ['coalesce', ['get', 'damage_gra'], ['get', 'grading'], ['get', 'notation'], 'none'], 'Destroyed', 1 * flCemsOpacity, 'Damaged', 1 * flCemsOpacity, 'Possibly damaged', 1 * flCemsOpacity, 'No visible damage', 1 * flCemsOpacity, 0.25 * flCemsOpacity])); }
      if (map.getLayer('active-flood-cems-vt-points')) { safeSetLayoutProperty(map, 'active-flood-cems-vt-points', 'visibility', flCemsVis); safeSetPaintProperty(map, 'active-flood-cems-vt-points', 'circle-opacity', buildDimOp(flCemsOpacity)); }

      // Earthquakes
      const eqLayer = settings.layers.find(l => l.type === 'gdacs_earthquakes');
      const isEqCemsEnabled = eqLayer?.copernicusEnabled !== false;
      const eqCemsVis = (selectedEarthquake ? isEqCemsEnabled : isEqCemsEnabled) ? 'visible' : 'none';
      const isEqVis = eqLayer?._effectiveOpacityVisible ?? true;
      const eqCemsOpacity = isEqVis ? (selectedEarthquake ? (eqLayer?.copernicusOpacity ?? 1.0) : 1.0) : 0;

      if (map.getLayer('selected-cems-vt-extent-fill')) { safeSetLayoutProperty(map, 'selected-cems-vt-extent-fill', 'visibility', eqCemsVis); safeSetPaintProperty(map, 'selected-cems-vt-extent-fill', 'fill-opacity', 0.05 * eqCemsOpacity); }
      if (map.getLayer('selected-cems-vt-extent')) { safeSetLayoutProperty(map, 'selected-cems-vt-extent', 'visibility', eqCemsVis); safeSetPaintProperty(map, 'selected-cems-vt-extent', 'line-color', buildExtentColor('#ff8c00')); safeSetPaintProperty(map, 'selected-cems-vt-extent', 'line-width', buildExtentWidth(2)); safeSetPaintProperty(map, 'selected-cems-vt-extent', 'line-opacity', eqCemsOpacity); }
      if (map.getLayer('selected-cems-vt-extent-loading')) { safeSetLayoutProperty(map, 'selected-cems-vt-extent-loading', 'visibility', eqCemsVis); safeSetPaintProperty(map, 'selected-cems-vt-extent-loading', 'line-opacity', eqCemsOpacity); }
      if (map.getLayer('selected-cems-vt-polygons')) { safeSetLayoutProperty(map, 'selected-cems-vt-polygons', 'visibility', eqCemsVis); safeSetPaintProperty(map, 'selected-cems-vt-polygons', 'fill-opacity', buildDimOp(['case', ['==', ['coalesce', ['get', 'obj_type'], ''], 'Not Analysed'], 0, ['match', ['coalesce', ['get', 'damage_gra'], ['get', 'grading'], ['get', 'notation'], 'none'], 'Destroyed', 0.6 * eqCemsOpacity, 'Damaged', 0.6 * eqCemsOpacity, 'Possibly damaged', 0.6 * eqCemsOpacity, 'No visible damage', 0.6 * eqCemsOpacity, 0.25 * eqCemsOpacity]])); }
      if (map.getLayer('selected-cems-vt-lines')) { safeSetLayoutProperty(map, 'selected-cems-vt-lines', 'visibility', eqCemsVis); safeSetPaintProperty(map, 'selected-cems-vt-lines', 'line-opacity', buildDimOp(['match', ['coalesce', ['get', 'damage_gra'], ['get', 'grading'], ['get', 'notation'], 'none'], 'Destroyed', 1 * eqCemsOpacity, 'Damaged', 1 * eqCemsOpacity, 'Possibly damaged', 1 * eqCemsOpacity, 'No visible damage', 1 * eqCemsOpacity, 0.25 * eqCemsOpacity])); }
      if (map.getLayer('selected-cems-vt-points')) { safeSetLayoutProperty(map, 'selected-cems-vt-points', 'visibility', eqCemsVis); safeSetPaintProperty(map, 'selected-cems-vt-points', 'circle-opacity', buildDimOp(eqCemsOpacity)); }
    });
  }, [mapLoaded, settings.layers, activeCemsWildfireFeatures, activeCemsFloodFeatures, selectedEarthquake, selectedCemsEarthquakeFeatures, activeDownloadAoi]);

  // 6. Animate loading CEMS AOI lines
  useEffect(() => {
    if (!map || !mapLoaded) return;
    
    const layerGroups = ['active-wildfire-cems-vt-extent', 'active-flood-cems-vt-extent', 'selected-cems-vt-extent'];

    if (loadingCemsAois.length === 0) {
      layerGroups.forEach(base => {
        if (map.getLayer(`${base}-loading`)) map.setFilter(`${base}-loading`, ['all', ['==', 'isExtent', true], ['in', 'aoiName', 'NONE']]);
        if (map.getLayer(base)) map.setFilter(base, ['==', 'isExtent', true]);
      });
      return;
    }

    layerGroups.forEach(base => {
      if (map.getLayer(`${base}-loading`)) map.setFilter(`${base}-loading`, ['all', ['==', 'isExtent', true], ['in', 'aoiName', ...loadingCemsAois]] as any);
      if (map.getLayer(base)) map.setFilter(base, ['all', ['==', 'isExtent', true], ['!', ['in', 'aoiName', ...loadingCemsAois]]] as any);
    });

    const dashArraySequence = [
      [0, 4, 3, 0], [0.5, 4, 2.5, 0], [1, 4, 2, 0], [1.5, 4, 1.5, 0],
      [2, 4, 1, 0], [2.5, 4, 0.5, 0], [3, 4, 0, 0], [0, 0, 3, 4],
      [0, 0.5, 3, 4], [0, 1, 3, 4], [0, 1.5, 3, 4],
      [0, 2, 3, 4], [0, 2.5, 3, 4], [0, 3, 3, 4]
    ];
    
    let step = 0;
    let animationId: number;
    let lastTime = 0;
    
    const animateThrottled = (t: number) => {
      if (t - lastTime > 60) {
        step = (step + 1) % dashArraySequence.length;
        layerGroups.forEach(base => {
          if (map.getLayer(`${base}-loading`)) map.setPaintProperty(`${base}-loading`, 'line-dasharray', dashArraySequence[step]);
        });
        lastTime = t;
      }
      animationId = requestAnimationFrame(animateThrottled);
    };

    animationId = requestAnimationFrame(animateThrottled);
    return () => cancelAnimationFrame(animationId);
  }, [map, mapLoaded, loadingCemsAois]);

  // 7. CEMS Detail Fetch Listener
  useEffect(() => {
    const handleFetchCemsDetails = async (e: CustomEvent) => {
      const { cemsType, products, aoiName, coordinates } = e.detail;
      
      const isAlreadyLoaded = ['wildfire', 'flood', 'earthquake'].some(type => {
        const stateVar = type === 'wildfire' ? latestFeaturesRef.current.wildfire : type === 'flood' ? latestFeaturesRef.current.flood : latestFeaturesRef.current.earthquake;
        return stateVar?.features?.some((f: any) => f.properties?.aoiName === aoiName && !f.properties?.isExtent);
      });

      if (isAlreadyLoaded) {
        if (coordinates) {
          setActiveDownloadAoi({ aoiName, cemsType, coordinates });
        }
        return;
      }

      console.log(`[CEMS Debug] Received fetchCemsDetails for ${aoiName}`, { cemsType, productsCount: products?.length });
      
      if (!products || !aoiName) {
        console.warn(`[CEMS Debug] Missing products or aoiName! Aborting.`);
        return;
      }
      
      setLoadingCemsAois(prev => [...prev, aoiName]);
      const vtPromises: Promise<any>[] = [];
      
      const productsWithVt = products.filter((p: any) => p.layers && p.layers.some((l: any) => l.format === 'vt'));
      console.log(`[CEMS Debug] Filtered products with 'vt' format: ${productsWithVt.length} out of ${products.length}`);
      
      const latestProduct = productsWithVt.length > 0 ? productsWithVt.sort((a: any, b: any) => {
        const typePrio: any = { 'GRA': 4, 'DEL': 3, 'FEP': 2, 'REF': 1 };
        const prioDiff = (typePrio[b.type] || 0) - (typePrio[a.type] || 0);
        if (prioDiff !== 0) return prioDiff;
        return (b.monitoringNumber || 0) - (a.monitoringNumber || 0);
      })[0] : null;
      
      if (latestProduct) console.log(`[CEMS Debug] Selected latest product:`, latestProduct.type);
      else console.warn(`[CEMS Debug] No products with 'vt' format found for ${aoiName}!`);
      
      const productsToProcess = latestProduct ? [latestProduct] : [];
      for (const product of productsToProcess) {
        if (product.layers) {
          for (const layer of product.layers) {
            if (layer.format === 'vt' && layer.json) {
              console.log(`[CEMS Debug] Pushing fetch promise for VT layer:`, layer.json);
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
              f.properties.aoiName = aoiName;
              f.properties.cemsType = cemsType;
              if (f.properties.damage_gra) f.properties.damage_gra = normalize(f.properties.damage_gra);
              if (f.properties.grading) f.properties.grading = normalize(f.properties.grading);
              if (f.properties.notation) f.properties.notation = normalize(f.properties.notation);
              f.properties._isPoint = f.geometry?.type === 'Point' || f.geometry?.type === 'MultiPoint';
              f.properties._isLineString = f.geometry?.type === 'LineString' || f.geometry?.type === 'MultiLineString';
              f.properties._isPolygon = f.geometry?.type === 'Polygon' || f.geometry?.type === 'MultiPolygon';
              f.properties._uid = `${aoiName}-${Math.random().toString(36).substr(2, 9)}`;
              if (f.properties.obj_type) {
                // Highly efficient heuristic to uniquely identify geometries without expensive stringification
                const coordsLength = Array.isArray(f.geometry?.coordinates) ? 
                  (Array.isArray(f.geometry.coordinates[0]) ? 
                    (Array.isArray(f.geometry.coordinates[0][0]) ? f.geometry.coordinates[0][0].length : f.geometry.coordinates[0].length) 
                  : f.geometry.coordinates.length) 
                : 0;
                f.properties._uid = `${aoiName}-${f.properties.obj_type}-${f.properties.notation || f.properties.grading || f.properties.damage_gra || ''}-${coordsLength}`;
              }
            }
            return true;
          });
          detailedFeatures.push(...filtered);
        }
        
        if (cemsType === 'wildfire') {
          setActiveCemsWildfireFeatures((prev: any) => {
            if (!prev || !prev.features) return prev;
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
        setLoadingCemsAois(prev => prev.filter(c => c !== aoiName));
      }
    };
    
    window.addEventListener('fetchCemsDetails', handleFetchCemsDetails as unknown as EventListener);
    return () => window.removeEventListener('fetchCemsDetails', handleFetchCemsDetails as unknown as EventListener);
  }, [setActiveCemsWildfireFeatures, setActiveCemsFloodFeatures, setSelectedCemsEarthquakeFeatures]);

  // 8. Handle Download Overlay Marker and Click-away
  useEffect(() => {
    if (!map || !activeDownloadAoi) {
      if (downloadMarkerRef.current) {
        downloadMarkerRef.current.remove();
        downloadMarkerRef.current = null;
      }
      return;
    }

    if (downloadMarkerRef.current) downloadMarkerRef.current.remove();

    const el = document.createElement('div');
    el.className = 'cems-download-marker';

    el.innerHTML = `
      <div class="pointer-events-auto cursor-pointer flex items-center justify-center relative w-14 h-14">
        <button class="relative w-14 h-14 flex flex-shrink-0 items-center justify-center transition-colors bg-black text-ui-text hover:text-ui-bg shadow-2xl rounded-full ui-glass-panel group pointer-events-auto border-none">
          <div class="absolute inset-0 rounded-full transition-colors group-hover:bg-ui-text z-0"></div>
          <div class="relative z-10 flex items-center justify-center transition-transform group-hover:scale-110">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>
          </div>
        </button>
      </div>
    `;

    el.querySelector('button')?.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      
      const { aoiName, cemsType } = activeDownloadAoi;
      const stateVar = cemsType === 'wildfire' ? latestFeaturesRef.current.wildfire : cemsType === 'flood' ? latestFeaturesRef.current.flood : latestFeaturesRef.current.earthquake;
      if (stateVar && stateVar.features) {
        const aoiFeatures = stateVar.features.filter((f: any) => f.properties?.aoiName === aoiName && !f.properties?.isExtent);
        import('../../utils/exportUtils').then(({ downloadGeoJSON, processCemsGeometry }) => {
          const processed = processCemsGeometry({ type: 'FeatureCollection', features: aoiFeatures });
          downloadGeoJSON(processed, `cems_${cemsType}_${aoiName}_damage.geojson`);
        });
      }
      
      setActiveDownloadAoi(null);
    });

    downloadMarkerRef.current = new maplibregl.Marker({ element: el, anchor: 'center' })
      .setLngLat(activeDownloadAoi.coordinates)
      .addTo(map);

    const handleMapClick = () => {
      setActiveDownloadAoi(null);
    };
    
    // Slight delay to prevent the initial click that triggered this from immediately closing it
    setTimeout(() => {
      map.on('click', handleMapClick);
    }, 100);

    return () => {
      map.off('click', handleMapClick);
    };
  }, [map, activeDownloadAoi, settings.uiLiquidGlass]);
};
