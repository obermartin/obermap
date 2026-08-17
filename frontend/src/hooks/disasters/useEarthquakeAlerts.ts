import { useState, useEffect } from 'react';
import type { AppSettings } from '../../types';
import { parseWKT, haversineDistance } from '../../utils/mapUtils';
import { safeSetLayoutProperty, safeSetPaintProperty } from '../../utils/mapUtils';

export const useEarthquakeAlerts = (
  map: maplibregl.Map | null,
  mapLoaded: boolean,
  settings: AppSettings,
  setSettings?: React.Dispatch<React.SetStateAction<AppSettings>>
) => {
  const selectedEarthquake = settings.layers.find(l => l.type === 'gdacs_earthquakes')?.selectedFeatureData || null;
  const [selectedEarthquakeShakemap, setSelectedEarthquakeShakemap] = useState<any>(null);
  const [selectedEarthquakeUsgsDyfi10km, setSelectedEarthquakeUsgsDyfi10km] = useState<any>(null);
  const [selectedEarthquakeUsgsDyfi1km, setSelectedEarthquakeUsgsDyfi1km] = useState<any>(null);
  const [selectedEarthquakeUsgsLandslide, setSelectedEarthquakeUsgsLandslide] = useState<{ url: string, extent: [number, number, number, number] } | null>(null);
  const [selectedEarthquakeUsgsLiquefaction, setSelectedEarthquakeUsgsLiquefaction] = useState<{ url: string, extent: [number, number, number, number] } | null>(null);
  
  const selectedCemsEarthquake = settings.layers.find(l => l.type === 'gdacs_earthquakes')?.selectedCemsData || null;
  const [selectedCemsEarthquakeFeatures, setSelectedCemsEarthquakeFeatures] = useState<any>(null);

  // 1. Fetch CEMS Features
  useEffect(() => {
    if (!selectedCemsEarthquake) {
      setSelectedCemsEarthquakeFeatures(null);
      window.dispatchEvent(new CustomEvent('exportDataReady', {
        detail: { type: 'cems_earthquake', id: undefined, ready: false }
      }));
      return;
    }

    // ALWAYS clear old features first
    setSelectedCemsEarthquakeFeatures(null);

    window.dispatchEvent(new CustomEvent('exportDataReady', {
      detail: { type: 'cems_earthquake', id: selectedCemsEarthquake.code, ready: false }
    }));

    let isSubscribed = true;
    (async () => {
      try {
        const rawUrl = `https://rapidmapping.emergency.copernicus.eu/backend/dashboard-api/public-activations/?code=${selectedCemsEarthquake.code}`;
        const url = `./api.php?action=proxy_cems&url=${encodeURIComponent(rawUrl)}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error('Failed to fetch detailed CEMS activation');
        const data = await res.json();
        
        const allFeatures: any[] = [];
        
        if (data && data.results && data.results.length > 0 && data.results[0].aois) {
          let aoiIndex = 0;
          for (const aoi of data.results[0].aois) {
            aoiIndex++;
            if (aoi.extent) {
              const aoiGeom = parseWKT(aoi.extent);
              if (aoiGeom) {
                const guaranteedAoiName = aoi.aoiName || aoi.name || `AOI-${aoiIndex}`;
                allFeatures.push({
                  type: 'Feature',
                  geometry: aoiGeom.geometry,
                  properties: { 
                    aoiName: guaranteedAoiName, 
                    isExtent: true,
                    isClickableAoi: true,
                    activationCode: selectedCemsEarthquake.code,
                    cemsType: 'earthquake',
                    _products: JSON.stringify(aoi.products)
                  }
                });
              }
            }
          }
        }
        
        if (isSubscribed) {
          setSelectedCemsEarthquakeFeatures({
            type: 'FeatureCollection',
            features: allFeatures
          });
          window.dispatchEvent(new CustomEvent('exportDataReady', {
            detail: { type: 'cems_earthquake', id: selectedCemsEarthquake.code, ready: allFeatures.length > 0 ? true : 'empty' }
          }));
        }
      } catch (err) {
        console.error('Error fetching CEMS details', err);
        if (isSubscribed) {
          window.dispatchEvent(new CustomEvent('exportDataReady', {
            detail: { type: 'cems_earthquake', id: selectedCemsEarthquake.code, ready: 'empty' }
          }));
        }
      }
    })();
    return () => { isSubscribed = false; };
  }, [selectedCemsEarthquake]);

  // 2. Fetch GDACS Shakemap
  useEffect(() => {
    if (!selectedEarthquake) {
      setSelectedEarthquakeShakemap(null);
      window.dispatchEvent(new CustomEvent('exportDataReady', {
        detail: { type: 'gdacs_earthquakes', id: undefined, ready: false }
      }));
      return;
    }

    let isSubscribed = true;
    window.dispatchEvent(new CustomEvent('exportDataReady', {
      detail: { type: 'gdacs_earthquakes', id: selectedEarthquake.id, ready: false }
    }));
    
    (async () => {
      try {
        const targetUrl = encodeURIComponent(selectedEarthquake.geomUrl.replace('http:', 'https:'));
        const polyRes = await fetch(`./api.php?action=proxy_gdacs&url=${targetUrl}`);
        if (!polyRes.ok) throw new Error('Failed to fetch shakemap');
        const polyData = await polyRes.json();
        if (isSubscribed) {
          setSelectedEarthquakeShakemap(polyData);
          window.dispatchEvent(new CustomEvent('exportDataReady', {
            detail: { 
              type: 'gdacs_earthquakes', 
              id: selectedEarthquake.id, 
              ready: polyData?.features?.length > 0 ? true : 'empty' 
            }
          }));
        }
      } catch (err) {
        console.error('Error fetching shakemap for selected earthquake:', err);
        if (isSubscribed) {
          setSelectedEarthquakeShakemap(null);
          window.dispatchEvent(new CustomEvent('exportDataReady', {
            detail: { type: 'gdacs_earthquakes', id: selectedEarthquake.id, ready: 'empty' }
          }));
        }
      }
    })();

    return () => { isSubscribed = false; };
  }, [selectedEarthquake]);

  // 3. Fetch USGS Overlays based on shakemap sourceid
  useEffect(() => {
    setSelectedEarthquakeUsgsDyfi10km(null);
    setSelectedEarthquakeUsgsDyfi1km(null);
    setSelectedEarthquakeUsgsLandslide(null);
    setSelectedEarthquakeUsgsLiquefaction(null);

    if (!selectedEarthquakeShakemap || !selectedEarthquakeShakemap.features || selectedEarthquakeShakemap.features.length === 0) {
      return;
    }

    let isSubscribed = true;
    (async () => {
      try {
        const sourceId = selectedEarthquakeShakemap.features[0].properties?.sourceid;
        if (!sourceId) return;

        const res = await fetch(`https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&eventid=${sourceId}`);
        if (!res.ok) return; 
        const data = await res.json();
        
        if (!isSubscribed) return;

        const products = data.properties?.products;
        if (!products) return;

        const fixGeoJsonPolygons = (geoJson: any) => {
          if (!geoJson || !geoJson.features) return geoJson;
          const newFeatures = geoJson.features.map((feature: any) => {
            if (feature.geometry && (feature.geometry.type === 'Polygon' || feature.geometry.type === 'MultiPolygon')) {
              const coords = feature.geometry.coordinates;
              const fixRing = (ring: number[][]) => {
                if (ring.length > 0) {
                  const first = ring[0];
                  const last = ring[ring.length - 1];
                  if (first[0] !== last[0] || first[1] !== last[1]) {
                    ring.push([...first]);
                  }
                }
              };
              
              if (feature.geometry.type === 'Polygon') {
                coords.forEach(fixRing);
              } else {
                coords.forEach((polygon: any) => polygon.forEach(fixRing));
              }
            }
            return feature;
          });
          return { ...geoJson, features: newFeatures };
        };

        // DYFI 10km
        if (products.dyfi && products.dyfi[0]?.contents['dyfi_geo_10km.geojson']) {
          const dyfiRes = await fetch(products.dyfi[0].contents['dyfi_geo_10km.geojson'].url);
          if (dyfiRes.ok) {
            const dyfiData = await dyfiRes.json();
            if (isSubscribed) setSelectedEarthquakeUsgsDyfi10km(fixGeoJsonPolygons(dyfiData));
          }
        }

        // DYFI 1km
        if (products.dyfi && products.dyfi[0]?.contents['dyfi_geo_1km.geojson']) {
          const dyfiRes = await fetch(products.dyfi[0].contents['dyfi_geo_1km.geojson'].url);
          if (dyfiRes.ok) {
            const dyfiData = await dyfiRes.json();
            if (isSubscribed) setSelectedEarthquakeUsgsDyfi1km(fixGeoJsonPolygons(dyfiData));
          }
        }

        // Ground Failure
        if (products['ground-failure'] && products['ground-failure'][0]?.contents['info.json']) {
          const gfRes = await fetch(products['ground-failure'][0].contents['info.json'].url);
          if (gfRes.ok) {
            const gfData = await gfRes.json();
            
            // Landslide
            if (gfData.Landslides) {
              const preferred = gfData.Landslides.find((l: any) => l.preferred) || gfData.Landslides[0];
              if (preferred && preferred.overlay && preferred.extent) {
                const overlayUrl = products['ground-failure'][0].contents[preferred.overlay]?.url;
                if (overlayUrl && isSubscribed) {
                  setSelectedEarthquakeUsgsLandslide({ url: overlayUrl, extent: preferred.extent });
                }
              }
            }

            // Liquefaction
            if (gfData.Liquefaction) {
              const preferred = gfData.Liquefaction.find((l: any) => l.preferred) || gfData.Liquefaction[0];
              if (preferred && preferred.overlay && preferred.extent) {
                const overlayUrl = products['ground-failure'][0].contents[preferred.overlay]?.url;
                if (overlayUrl && isSubscribed) {
                  setSelectedEarthquakeUsgsLiquefaction({ url: overlayUrl, extent: preferred.extent });
                }
              }
            }
          }
        }
      } catch (err) {
        console.error('Error fetching USGS data:', err);
      }
    })();

    return () => { isSubscribed = false; };
  }, [selectedEarthquakeShakemap]);

  // 4. Render Mapbox Layers for USGS
  useEffect(() => {
    if (!map || !mapLoaded) return;
    const eqLayer = settings.layers.find(l => l.type === 'gdacs_earthquakes');
    const isVisible = eqLayer?._effectiveOpacityVisible ?? true;
    const targetOpacity = isVisible ? (eqLayer?.usgsDyfi10kmOpacity ?? 0.6) : 0;

    if (map.getStyle()) {
      if (!map.getSource('selected-usgs-dyfi-10km-source') && selectedEarthquakeUsgsDyfi10km) {
        map.addSource('selected-usgs-dyfi-10km-source', {
          type: 'geojson',
          data: selectedEarthquakeUsgsDyfi10km
        });
        const beforeId = (eqLayer && map.getLayer(`dynamic-layer-${eqLayer.id}`)) ? `dynamic-layer-${eqLayer.id}` : (map.getLayer('custom-polygons') ? 'custom-polygons' : undefined);
        map.addLayer({
          id: 'selected-usgs-dyfi-10km-fill',
          type: 'fill',
          source: 'selected-usgs-dyfi-10km-source',
          layout: {
            'visibility': eqLayer?.usgsDyfi10kmEnabled ? 'visible' : 'none'
          },
          paint: {
            'fill-color': [
              'step',
              ['get', 'cdi'],
              'rgba(255, 255, 255, 0)',
              1, '#ffffff',
              2, '#bfccff',
              3, '#a0e6ff',
              4, '#80ffff',
              5, '#7aff93',
              6, '#ffff00',
              7, '#ffc800',
              8, '#ff9100',
              9, '#ff0000',
              10, '#c80000'
            ],
            'fill-opacity': targetOpacity,
            'fill-opacity-transition': { duration: 300 }
          }
        }, beforeId);
      }
    }

    const source = map.getSource('selected-usgs-dyfi-10km-source') as maplibregl.GeoJSONSource;
    if (source) {
      source.setData(selectedEarthquakeUsgsDyfi10km || { type: 'FeatureCollection', features: [] });
    }

    const visibility = eqLayer?.usgsDyfi10kmEnabled ? 'visible' : 'none';
    if (map.getLayer('selected-usgs-dyfi-10km-fill')) {
      safeSetLayoutProperty(map, 'selected-usgs-dyfi-10km-fill', 'visibility', visibility);
      safeSetPaintProperty(map, 'selected-usgs-dyfi-10km-fill', 'fill-opacity', targetOpacity);
    }
  }, [selectedEarthquakeUsgsDyfi10km, mapLoaded, settings.layers]);

  useEffect(() => {
    if (!map || !mapLoaded) return;
    const eqLayer = settings.layers.find(l => l.type === 'gdacs_earthquakes');
    const isVisible = eqLayer?._effectiveOpacityVisible ?? true;
    const targetOpacity = isVisible ? (eqLayer?.usgsLandslideOpacity ?? 0.8) : 0;

    if (map.getStyle()) {
      if (!map.getSource('selected-usgs-landslide-source') && selectedEarthquakeUsgsLandslide) {
        map.addSource('selected-usgs-landslide-source', {
          type: 'image',
          url: selectedEarthquakeUsgsLandslide.url,
          coordinates: [
            [selectedEarthquakeUsgsLandslide.extent[0], selectedEarthquakeUsgsLandslide.extent[3]],
            [selectedEarthquakeUsgsLandslide.extent[1], selectedEarthquakeUsgsLandslide.extent[3]],
            [selectedEarthquakeUsgsLandslide.extent[1], selectedEarthquakeUsgsLandslide.extent[2]],
            [selectedEarthquakeUsgsLandslide.extent[0], selectedEarthquakeUsgsLandslide.extent[2]]
          ]
        });
        const beforeId = (eqLayer && map.getLayer(`dynamic-layer-${eqLayer.id}`)) ? `dynamic-layer-${eqLayer.id}` : (map.getLayer('custom-polygons') ? 'custom-polygons' : undefined);
        map.addLayer({
          id: 'selected-usgs-landslide-raster',
          type: 'raster',
          source: 'selected-usgs-landslide-source',
          paint: {
            'raster-opacity': targetOpacity,
            'raster-opacity-transition': { duration: 300 }
          }
        }, beforeId);
      } else if (map.getSource('selected-usgs-landslide-source') && selectedEarthquakeUsgsLandslide) {
        (map.getSource('selected-usgs-landslide-source') as any).updateImage({
          url: selectedEarthquakeUsgsLandslide.url,
          coordinates: [
            [selectedEarthquakeUsgsLandslide.extent[0], selectedEarthquakeUsgsLandslide.extent[3]],
            [selectedEarthquakeUsgsLandslide.extent[1], selectedEarthquakeUsgsLandslide.extent[3]],
            [selectedEarthquakeUsgsLandslide.extent[1], selectedEarthquakeUsgsLandslide.extent[2]],
            [selectedEarthquakeUsgsLandslide.extent[0], selectedEarthquakeUsgsLandslide.extent[2]]
          ]
        });
      }
    }
    
    const visibility = (eqLayer?.usgsLandslideEnabled && selectedEarthquakeUsgsLandslide) ? 'visible' : 'none';
    if (map.getLayer('selected-usgs-landslide-raster')) {
      safeSetLayoutProperty(map, 'selected-usgs-landslide-raster', 'visibility', visibility);
      safeSetPaintProperty(map, 'selected-usgs-landslide-raster', 'raster-opacity', targetOpacity);
      
      const bMin = eqLayer?.usgsLandslideBrightness !== undefined && eqLayer.usgsLandslideBrightness > 0 ? eqLayer.usgsLandslideBrightness : 0;
      const bMax = eqLayer?.usgsLandslideBrightness !== undefined && eqLayer.usgsLandslideBrightness < 0 ? 1 + eqLayer.usgsLandslideBrightness : 1;
      safeSetPaintProperty(map, 'selected-usgs-landslide-raster', 'raster-brightness-min', bMin);
      safeSetPaintProperty(map, 'selected-usgs-landslide-raster', 'raster-brightness-max', bMax);
      safeSetPaintProperty(map, 'selected-usgs-landslide-raster', 'raster-contrast', eqLayer?.usgsLandslideContrast ?? 0);
      safeSetPaintProperty(map, 'selected-usgs-landslide-raster', 'raster-saturation', eqLayer?.usgsLandslideSaturation ?? 0);
      safeSetPaintProperty(map, 'selected-usgs-landslide-raster', 'raster-hue-rotate', eqLayer?.usgsLandslideHue ?? 0);
    }
  }, [selectedEarthquakeUsgsLandslide, mapLoaded, settings.layers]);

  useEffect(() => {
    if (!map || !mapLoaded) return;
    const eqLayer = settings.layers.find(l => l.type === 'gdacs_earthquakes');
    const isVisible = eqLayer?._effectiveOpacityVisible ?? true;
    const targetOpacity = isVisible ? (eqLayer?.usgsLiquefactionOpacity ?? 0.8) : 0;

    if (map.getStyle()) {
      if (!map.getSource('selected-usgs-liquefaction-source') && selectedEarthquakeUsgsLiquefaction) {
        map.addSource('selected-usgs-liquefaction-source', {
          type: 'image',
          url: selectedEarthquakeUsgsLiquefaction.url,
          coordinates: [
            [selectedEarthquakeUsgsLiquefaction.extent[0], selectedEarthquakeUsgsLiquefaction.extent[3]],
            [selectedEarthquakeUsgsLiquefaction.extent[1], selectedEarthquakeUsgsLiquefaction.extent[3]],
            [selectedEarthquakeUsgsLiquefaction.extent[1], selectedEarthquakeUsgsLiquefaction.extent[2]],
            [selectedEarthquakeUsgsLiquefaction.extent[0], selectedEarthquakeUsgsLiquefaction.extent[2]]
          ]
        });
        const beforeId = (eqLayer && map.getLayer(`dynamic-layer-${eqLayer.id}`)) ? `dynamic-layer-${eqLayer.id}` : (map.getLayer('custom-polygons') ? 'custom-polygons' : undefined);
        map.addLayer({
          id: 'selected-usgs-liquefaction-raster',
          type: 'raster',
          source: 'selected-usgs-liquefaction-source',
          paint: {
            'raster-opacity': targetOpacity,
            'raster-opacity-transition': { duration: 300 }
          }
        }, beforeId);
      } else if (map.getSource('selected-usgs-liquefaction-source') && selectedEarthquakeUsgsLiquefaction) {
        (map.getSource('selected-usgs-liquefaction-source') as any).updateImage({
          url: selectedEarthquakeUsgsLiquefaction.url,
          coordinates: [
            [selectedEarthquakeUsgsLiquefaction.extent[0], selectedEarthquakeUsgsLiquefaction.extent[3]],
            [selectedEarthquakeUsgsLiquefaction.extent[1], selectedEarthquakeUsgsLiquefaction.extent[3]],
            [selectedEarthquakeUsgsLiquefaction.extent[1], selectedEarthquakeUsgsLiquefaction.extent[2]],
            [selectedEarthquakeUsgsLiquefaction.extent[0], selectedEarthquakeUsgsLiquefaction.extent[2]]
          ]
        });
      }
    }
    
    const visibility = (eqLayer?.usgsLiquefactionEnabled && selectedEarthquakeUsgsLiquefaction) ? 'visible' : 'none';
    if (map.getLayer('selected-usgs-liquefaction-raster')) {
      safeSetLayoutProperty(map, 'selected-usgs-liquefaction-raster', 'visibility', visibility);
      safeSetPaintProperty(map, 'selected-usgs-liquefaction-raster', 'raster-opacity', targetOpacity);
      
      const bMin = eqLayer?.usgsLiquefactionBrightness !== undefined && eqLayer.usgsLiquefactionBrightness > 0 ? eqLayer.usgsLiquefactionBrightness : 0;
      const bMax = eqLayer?.usgsLiquefactionBrightness !== undefined && eqLayer.usgsLiquefactionBrightness < 0 ? 1 + eqLayer.usgsLiquefactionBrightness : 1;
      safeSetPaintProperty(map, 'selected-usgs-liquefaction-raster', 'raster-brightness-min', bMin);
      safeSetPaintProperty(map, 'selected-usgs-liquefaction-raster', 'raster-brightness-max', bMax);
      safeSetPaintProperty(map, 'selected-usgs-liquefaction-raster', 'raster-contrast', eqLayer?.usgsLiquefactionContrast ?? 0);
      safeSetPaintProperty(map, 'selected-usgs-liquefaction-raster', 'raster-saturation', eqLayer?.usgsLiquefactionSaturation ?? 0);
      safeSetPaintProperty(map, 'selected-usgs-liquefaction-raster', 'raster-hue-rotate', eqLayer?.usgsLiquefactionHue ?? 0);
    }
  }, [selectedEarthquakeUsgsLiquefaction, mapLoaded, settings.layers]);
  
  // 5. Correlate CEMS activation when a GDACS earthquake is selected
  useEffect(() => {
    // Always clear old CEMS selection when selecting a new earthquake or deselecting
    if (!selectedEarthquake || selectedCemsEarthquake) {
      if (setSettings && selectedCemsEarthquake) {
        setSettings(prev => ({
          ...prev,
          layers: prev.layers.map(l => l.type === 'gdacs_earthquakes' ? { ...l, selectedCemsData: null } : l)
        }));
      }
    }

    if (!selectedEarthquake) {
      return;
    }

    let isSubscribed = true;
    (async () => {
      try {
        console.log(`Fetching CEMS for gdacsId: EQ${selectedEarthquake.id}`);
        const rawUrl = `https://rapidmapping.emergency.copernicus.eu/backend/dashboard-api/public-activations-info/?gdacsId=EQ${selectedEarthquake.id}`;
        const url = `./api.php?action=proxy_cems&url=${encodeURIComponent(rawUrl)}`;
        const res = await fetch(url);
        let act = null;
        if (res.ok) {
          try {
            const data = await res.json();
            if (data.results && data.results.length > 0) {
              act = data.results[0];
              console.log(`[CEMS Debug] Found CEMS activation for gdacsId EQ${selectedEarthquake.id}:`, act.code);
            }
          } catch (e) {
            console.warn(`[CEMS Debug] Invalid JSON when fetching by gdacsId:`, e);
          }
        }
        
        // Fallback to spatial matching if gdacsId fails
        if (!act) {
           console.log(`[CEMS Debug] gdacsId match failed. Attempting spatial matching for earthquake coordinates:`, selectedEarthquake.coordinates);
           const rawUrl2 = `https://rapidmapping.emergency.copernicus.eu/backend/dashboard-api/public-activations-info/`;
           const url2 = `./api.php?action=proxy_cems&url=${encodeURIComponent(rawUrl2)}`;
           const allRes = await fetch(url2);
           if (allRes.ok) {
             const allData = await allRes.json();
             if (allData && allData.results) {
               console.log(`[CEMS Debug] Spatial match search - fetched ${allData.results.length} activations`);
               // Find all earthquake activations
               const earthquakes = allData.results.filter((a: any) => a.category === 'Earthquake' && a.centroid);
               
                let bestMatch = null;
               let bestDist = Infinity;
               
               console.log(`[CEMS Debug] Evaluating ${earthquakes.length} earthquakes for spatial match against ${selectedEarthquake.coordinates}`);
               
               for (const eq of earthquakes) {
                 // Ensure the CEMS event time is within 7 days of the GDACS earthquake time
                 const eqDate = new Date(selectedEarthquake.properties.fromdate);
                 const cemsDate = new Date(eq.eventTime || eq.activationTime);
                 const timeDiffDays = Math.abs(eqDate.getTime() - cemsDate.getTime()) / (1000 * 3600 * 24);
                 
                 if (isNaN(timeDiffDays) || timeDiffDays > 7) {
                   continue;
                 }

                 const geom = parseWKT(eq.centroid);
                 if (geom) {
                   const dist = haversineDistance(
                     [selectedEarthquake.coordinates[0], selectedEarthquake.coordinates[1]],
                     geom.geometry.coordinates
                   );
                   console.log(`[CEMS Debug] EQ ${eq.code} distance: ${dist}km. Expected [lon,lat] but got selectedEQ=${selectedEarthquake.coordinates[0]},${selectedEarthquake.coordinates[1]} and CEMS=${geom.geometry.coordinates[0]},${geom.geometry.coordinates[1]}`);
                   // Buffer of 100km
                   if (dist <= 100 && dist < bestDist) {
                     bestDist = dist;
                     bestMatch = eq;
                   }
                 }
               }

               // If the closest CEMS earthquake is within 100km, match it
               if (bestMatch && bestDist <= 100) {
                 console.log(`[CEMS Debug] Spatial match found: ${bestMatch.code} at distance ${bestDist.toFixed(2)}km`);
                 act = bestMatch;
               }
             }
           }
        }

        if (act && isSubscribed) {
           if (setSettings) {
             setSettings(prev => ({
               ...prev,
               layers: prev.layers.map(l => l.type === 'gdacs_earthquakes' ? { 
                 ...l, 
                 selectedCemsData: {
                   id: act.code,
                   code: act.code,
                   properties: act,
                   coordinates: selectedEarthquake.coordinates
                 } 
               } : l)
             }));
           }
        }
      } catch (err) {
        console.error('Error fetching correlated CEMS activation:', err);
      }
    })();

    return () => {
      isSubscribed = false;
    };
  }, [selectedEarthquake]);

  return {
    selectedEarthquake,
    selectedEarthquakeShakemap,
    selectedEarthquakeUsgsDyfi10km,
    selectedEarthquakeUsgsDyfi1km,
    selectedEarthquakeUsgsLandslide,
    selectedEarthquakeUsgsLiquefaction,
    selectedCemsEarthquake,
    selectedCemsEarthquakeFeatures,
    setSelectedCemsEarthquakeFeatures,
  };
};
