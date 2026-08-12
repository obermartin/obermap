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

  // 3. Setup Data Sources & Mapbox Layers
  useEffect(() => {
    if (!map || !mapLoaded) return;
    executeWhenStyleLoaded(map, () => {
      setupCemsLayers(map, 'active-wildfire-cems-vt-source');
      setupCemsLayers(map, 'active-flood-cems-vt-source');
      setupCemsLayers(map, 'selected-cems-vt-source');
    });
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
    const interval = setInterval(() => {
      const source = map.getSource(sourceId) as maplibregl.GeoJSONSource;
      if (source) {
        source.setData(data || { type: 'FeatureCollection', features: [] });
        clearInterval(interval);
      }
      if (++attempts > 20) clearInterval(interval);
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
      // Wildfires
      const wfLayer = settings.layers.find(l => l.type === 'wildfires');
      const wfCemsOpacity = (wfLayer?._effectiveOpacityVisible ?? true) ? (wfLayer?.copernicusOpacity ?? 1.0) : 0;
      const wfCemsVis = (wfLayer?.copernicusEnabled !== false) && !!activeCemsWildfireFeatures ? 'visible' : 'none';
      
      if (map.getLayer('active-wildfire-cems-vt-extent-fill')) { safeSetLayoutProperty(map, 'active-wildfire-cems-vt-extent-fill', 'visibility', wfCemsVis); safeSetPaintProperty(map, 'active-wildfire-cems-vt-extent-fill', 'fill-opacity', 0.05 * wfCemsOpacity); }
      if (map.getLayer('active-wildfire-cems-vt-extent')) { safeSetLayoutProperty(map, 'active-wildfire-cems-vt-extent', 'visibility', wfCemsVis); safeSetPaintProperty(map, 'active-wildfire-cems-vt-extent', 'line-opacity', wfCemsOpacity); }
      if (map.getLayer('active-wildfire-cems-vt-extent-loading')) { safeSetLayoutProperty(map, 'active-wildfire-cems-vt-extent-loading', 'visibility', wfCemsVis); safeSetPaintProperty(map, 'active-wildfire-cems-vt-extent-loading', 'line-opacity', wfCemsOpacity); }
      if (map.getLayer('active-wildfire-cems-vt-polygons')) { safeSetLayoutProperty(map, 'active-wildfire-cems-vt-polygons', 'visibility', wfCemsVis); safeSetPaintProperty(map, 'active-wildfire-cems-vt-polygons', 'fill-opacity', ['case', ['==', ['coalesce', ['get', 'obj_type'], ''], 'Not Analysed'], 0, ['match', ['coalesce', ['get', 'damage_gra'], ['get', 'grading'], ['get', 'notation'], 'none'], 'Destroyed', 0.6 * wfCemsOpacity, 'Damaged', 0.6 * wfCemsOpacity, 'Possibly damaged', 0.6 * wfCemsOpacity, 'No visible damage', 0.6 * wfCemsOpacity, 0.25 * wfCemsOpacity]]); }
      if (map.getLayer('active-wildfire-cems-vt-lines')) { safeSetLayoutProperty(map, 'active-wildfire-cems-vt-lines', 'visibility', wfCemsVis); safeSetPaintProperty(map, 'active-wildfire-cems-vt-lines', 'line-opacity', ['match', ['coalesce', ['get', 'damage_gra'], ['get', 'grading'], ['get', 'notation'], 'none'], 'Destroyed', 1 * wfCemsOpacity, 'Damaged', 1 * wfCemsOpacity, 'Possibly damaged', 1 * wfCemsOpacity, 'No visible damage', 1 * wfCemsOpacity, 0.25 * wfCemsOpacity]); }
      if (map.getLayer('active-wildfire-cems-vt-points')) { safeSetLayoutProperty(map, 'active-wildfire-cems-vt-points', 'visibility', wfCemsVis); safeSetPaintProperty(map, 'active-wildfire-cems-vt-points', 'circle-opacity', wfCemsOpacity); }

      // Floods
      const flLayer = settings.layers.find(l => l.id === 'floods');
      const flCemsOpacity = (flLayer?._effectiveOpacityVisible ?? true) ? (flLayer?.copernicusOpacity ?? 1.0) : 0;
      const flCemsVis = (flLayer?.copernicusEnabled !== false) && !!activeCemsFloodFeatures ? 'visible' : 'none';

      if (map.getLayer('active-flood-cems-vt-extent-fill')) { safeSetLayoutProperty(map, 'active-flood-cems-vt-extent-fill', 'visibility', flCemsVis); safeSetPaintProperty(map, 'active-flood-cems-vt-extent-fill', 'fill-opacity', 0.05 * flCemsOpacity); }
      if (map.getLayer('active-flood-cems-vt-extent')) { safeSetLayoutProperty(map, 'active-flood-cems-vt-extent', 'visibility', flCemsVis); safeSetPaintProperty(map, 'active-flood-cems-vt-extent', 'line-opacity', flCemsOpacity); }
      if (map.getLayer('active-flood-cems-vt-extent-loading')) { safeSetLayoutProperty(map, 'active-flood-cems-vt-extent-loading', 'visibility', flCemsVis); safeSetPaintProperty(map, 'active-flood-cems-vt-extent-loading', 'line-opacity', flCemsOpacity); }
      if (map.getLayer('active-flood-cems-vt-polygons')) { safeSetLayoutProperty(map, 'active-flood-cems-vt-polygons', 'visibility', flCemsVis); safeSetPaintProperty(map, 'active-flood-cems-vt-polygons', 'fill-opacity', ['case', ['==', ['coalesce', ['get', 'obj_type'], ''], 'Not Analysed'], 0, ['match', ['coalesce', ['get', 'damage_gra'], ['get', 'grading'], ['get', 'notation'], 'none'], 'Destroyed', 0.6 * flCemsOpacity, 'Damaged', 0.6 * flCemsOpacity, 'Possibly damaged', 0.6 * flCemsOpacity, 'No visible damage', 0.6 * flCemsOpacity, 0.6 * flCemsOpacity]]); }
      if (map.getLayer('active-flood-cems-vt-lines')) { safeSetLayoutProperty(map, 'active-flood-cems-vt-lines', 'visibility', flCemsVis); safeSetPaintProperty(map, 'active-flood-cems-vt-lines', 'line-opacity', ['match', ['coalesce', ['get', 'damage_gra'], ['get', 'grading'], ['get', 'notation'], 'none'], 'Destroyed', 1 * flCemsOpacity, 'Damaged', 1 * flCemsOpacity, 'Possibly damaged', 1 * flCemsOpacity, 'No visible damage', 1 * flCemsOpacity, 0.25 * flCemsOpacity]); }
      if (map.getLayer('active-flood-cems-vt-points')) { safeSetLayoutProperty(map, 'active-flood-cems-vt-points', 'visibility', flCemsVis); safeSetPaintProperty(map, 'active-flood-cems-vt-points', 'circle-opacity', flCemsOpacity); }

      // Earthquakes
      const eqLayer = settings.layers.find(l => l.type === 'gdacs_earthquakes');
      const isEqCemsEnabled = eqLayer?.copernicusEnabled !== false;
      const eqCemsVis = (selectedEarthquake ? isEqCemsEnabled : isEqCemsEnabled) ? 'visible' : 'none';
      const isEqVis = eqLayer?._effectiveOpacityVisible ?? true;
      const eqCemsOpacity = isEqVis ? (selectedEarthquake ? (eqLayer?.copernicusOpacity ?? 1.0) : 1.0) : 0;

      if (map.getLayer('selected-cems-vt-extent-fill')) { safeSetLayoutProperty(map, 'selected-cems-vt-extent-fill', 'visibility', eqCemsVis); safeSetPaintProperty(map, 'selected-cems-vt-extent-fill', 'fill-opacity', 0.05 * eqCemsOpacity); }
      if (map.getLayer('selected-cems-vt-extent')) { safeSetLayoutProperty(map, 'selected-cems-vt-extent', 'visibility', eqCemsVis); safeSetPaintProperty(map, 'selected-cems-vt-extent', 'line-opacity', eqCemsOpacity); }
      if (map.getLayer('selected-cems-vt-extent-loading')) { safeSetLayoutProperty(map, 'selected-cems-vt-extent-loading', 'visibility', eqCemsVis); safeSetPaintProperty(map, 'selected-cems-vt-extent-loading', 'line-opacity', eqCemsOpacity); }
      if (map.getLayer('selected-cems-vt-polygons')) { safeSetLayoutProperty(map, 'selected-cems-vt-polygons', 'visibility', eqCemsVis); safeSetPaintProperty(map, 'selected-cems-vt-polygons', 'fill-opacity', ['case', ['==', ['coalesce', ['get', 'obj_type'], ''], 'Not Analysed'], 0, ['match', ['coalesce', ['get', 'damage_gra'], ['get', 'grading'], ['get', 'notation'], 'none'], 'Destroyed', 0.6 * eqCemsOpacity, 'Damaged', 0.6 * eqCemsOpacity, 'Possibly damaged', 0.6 * eqCemsOpacity, 'No visible damage', 0.6 * eqCemsOpacity, 0.25 * eqCemsOpacity]]); }
      if (map.getLayer('selected-cems-vt-lines')) { safeSetLayoutProperty(map, 'selected-cems-vt-lines', 'visibility', eqCemsVis); safeSetPaintProperty(map, 'selected-cems-vt-lines', 'line-opacity', ['match', ['coalesce', ['get', 'damage_gra'], ['get', 'grading'], ['get', 'notation'], 'none'], 'Destroyed', 1 * eqCemsOpacity, 'Damaged', 1 * eqCemsOpacity, 'Possibly damaged', 1 * eqCemsOpacity, 'No visible damage', 1 * eqCemsOpacity, 0.25 * eqCemsOpacity]); }
      if (map.getLayer('selected-cems-vt-points')) { safeSetLayoutProperty(map, 'selected-cems-vt-points', 'visibility', eqCemsVis); safeSetPaintProperty(map, 'selected-cems-vt-points', 'circle-opacity', eqCemsOpacity); }
    });
  }, [mapLoaded, settings.layers, activeCemsWildfireFeatures, activeCemsFloodFeatures, selectedEarthquake, selectedCemsEarthquakeFeatures]);

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
      const { cemsType, products, aoiName } = e.detail;
      if (!products || !aoiName) return;
      
      setLoadingCemsAois(prev => [...prev, aoiName]);
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
              f.properties._uid = `${aoiName}-${Math.random().toString(36).substr(2, 9)}`;
              if (f.properties.obj_type) {
                f.properties._uid = `${aoiName}-${f.properties.obj_type}-${f.properties.notation || f.properties.grading || f.properties.damage_gra || ''}-${JSON.stringify(f.geometry?.coordinates || '').length}`;
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
};
