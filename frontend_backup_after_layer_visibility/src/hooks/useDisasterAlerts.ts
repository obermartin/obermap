import { useState, useEffect, useRef } from 'react';
import type { AppSettings } from '../types';
import { parseWKT, haversineDistance, safeFetchCemsJson } from '../utils/mapUtils';

export const useDisasterAlerts = (
  map: maplibregl.Map | null,
  mapLoaded: boolean,
  settings: AppSettings
) => {
  const [selectedEarthquake, setSelectedEarthquakeState] = useState<{ id: string, ep: string, geomUrl: string, coordinates: [number, number], properties: any } | null>(null);
  const [selectedEarthquakeShakemap, setSelectedEarthquakeShakemap] = useState<any>(null);
  const [selectedEarthquakeUsgsDyfi10km, setSelectedEarthquakeUsgsDyfi10km] = useState<any>(null);
  const [selectedEarthquakeUsgsDyfi1km, setSelectedEarthquakeUsgsDyfi1km] = useState<any>(null);
  const [selectedEarthquakeUsgsLandslide, setSelectedEarthquakeUsgsLandslide] = useState<{ url: string, extent: [number, number, number, number] } | null>(null);
  const [selectedEarthquakeUsgsLiquefaction, setSelectedEarthquakeUsgsLiquefaction] = useState<{ url: string, extent: [number, number, number, number] } | null>(null);
  const [selectedCemsEarthquake, setSelectedCemsEarthquakeState] = useState<{ id: string, code: string, properties: any, coordinates: [number, number] } | null>(null);
  const [selectedCemsEarthquakeFeatures, setSelectedCemsEarthquakeFeatures] = useState<any>(null);
  const [activeCemsWildfireFeatures, setActiveCemsWildfireFeatures] = useState<any>(null);
  const [activeCemsFloodFeatures, setActiveCemsFloodFeatures] = useState<any>(null);


  const weatherToggleRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let animationFrameId: number;

    const updatePosition = () => {
      const toggle = weatherToggleRef.current;
      if (!toggle) {
        animationFrameId = requestAnimationFrame(updatePosition);
        return;
      }
      
      const toolbar = document.getElementById('global-toolbar-container');
      const dateControl = document.getElementById('global-date-control-container');
      
      if (toolbar && dateControl) {
        const toolbarRect = toolbar.getBoundingClientRect();
        const dateRect = dateControl.getBoundingClientRect();
        
        toggle.style.left = `${toolbarRect.right}px`;
        toggle.style.right = `${window.innerWidth - dateRect.left}px`;
      }
      
      animationFrameId = requestAnimationFrame(updatePosition);
    };
    
    updatePosition();
    
    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  const [selectedVolcano, setSelectedVolcanoState] = useState<{ id: string, ep: string, geomUrl: string, coordinates: [number, number], properties: any } | null>(null);
  const [selectedVolcanoPolygon, setSelectedVolcanoPolygon] = useState<any>(null);


  useEffect(() => {
    if (!selectedCemsEarthquake) {
      setSelectedCemsEarthquakeFeatures(null);
      return;
    }

    let isSubscribed = true;
    (async () => {
      try {
        const res = await fetch(`https://rapidmapping.emergency.copernicus.eu/backend/dashboard-api/public-activations/?code=${selectedCemsEarthquake.code}`);
        if (!res.ok) throw new Error('Failed to fetch detailed CEMS activation');
        const data = await res.json();
        
        const allFeatures: any[] = [];
        
        if (data && data.results && data.results.length > 0 && data.results[0].aois) {
          for (const aoi of data.results[0].aois) {
            // Also add AOI extent polygon
            if (aoi.extent) {
              const aoiGeom = parseWKT(aoi.extent);
              if (aoiGeom) {
                allFeatures.push({
                  type: 'Feature',
                  geometry: aoiGeom.geometry,
                  properties: { aoiName: aoi.aoiName, isExtent: true }
                });
              }
            }

            if (aoi.products) {
              // Find the latest product that actually contains VT layers!
const productsWithVt = aoi.products.filter((p: any) => p.layers && p.layers.some((l: any) => l.format === 'vt'));
const latestProduct = productsWithVt.length > 0 ? productsWithVt.sort((a: any, b: any) => (b.monitoringNumber || 0) - (a.monitoringNumber || 0))[0] : null;
                    const productsToProcess = latestProduct ? [latestProduct] : [];
                    for (const product of productsToProcess) {
                if (product.layers) {
                  for (const layer of product.layers) {
                    if (layer.format === 'vt' && layer.json) {
                      try {
                        const features = await safeFetchCemsJson(layer.json);
                        if (features && features.length) {
                          allFeatures.push(...features);
                        }
                      } catch (err) {
                        console.error('Failed to fetch CEMS VT layer', err);
                      }
                    }
                  }
                }
              }
            }
          }
        }
        
        if (isSubscribed) {
          setSelectedCemsEarthquakeFeatures({
            type: 'FeatureCollection',
            features: allFeatures
          });
        }
      } catch (err) {
        console.error('Error fetching CEMS details', err);
      }
    })();
    return () => { isSubscribed = false; };
  }, [selectedCemsEarthquake]);


  useEffect(() => {
    if (!selectedEarthquake) {
      setSelectedEarthquakeShakemap(null);
      return;
    }

    let isSubscribed = true;
    (async () => {
      try {
        const polyRes = await fetch(selectedEarthquake.geomUrl.replace('http:', 'https:'));
        if (!polyRes.ok) throw new Error('Failed to fetch shakemap');
        const polyData = await polyRes.json();
        if (isSubscribed) {
          setSelectedEarthquakeShakemap(polyData);
        }
      } catch (err) {
        console.error('Error fetching shakemap for selected earthquake:', err);
        if (isSubscribed) {
          setSelectedEarthquakeShakemap(null);
        }
      }
    })();

    return () => { isSubscribed = false; };
  }, [selectedEarthquake]);

  // Fetch USGS overlays when selectedEarthquakeShakemap changes
  useEffect(() => {
    if (!selectedEarthquakeShakemap || !selectedEarthquakeShakemap.features || selectedEarthquakeShakemap.features.length === 0) {
      setSelectedEarthquakeUsgsDyfi10km(null);
      setSelectedEarthquakeUsgsDyfi1km(null);
      setSelectedEarthquakeUsgsLandslide(null);
      setSelectedEarthquakeUsgsLiquefaction(null);
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

  // Render USGS DYFI 10km
  useEffect(() => {
     
    if (!map || !mapLoaded) return;

    if (!map.getSource('selected-usgs-dyfi-10km-source')) {
      map.addSource('selected-usgs-dyfi-10km-source', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
      });

      const eqLayer = settings.layers.find(l => l.type === 'gdacs_earthquakes');
      const beforeId = (eqLayer && map.getLayer(`dynamic-layer-${eqLayer.id}`)) ? `dynamic-layer-${eqLayer.id}` : 'custom-polygons';

      map.addLayer({
        id: 'selected-usgs-dyfi-10km-fill',
        type: 'fill',
        source: 'selected-usgs-dyfi-10km-source',
        paint: {
          'fill-color': [
            'step',
            ['to-number', ['coalesce', ['get', 'cdi'], 0]],
            '#ffffff', 1,
            '#bfccff', 2,
            '#a0e6ff', 3,
            '#80ffff', 4,
            '#7aff93', 5,
            '#ffff00', 6,
            '#ffc800', 7,
            '#ff9100', 8,
            '#ff0000', 9,
            '#c80000'
          ],
          'fill-opacity': eqLayer?.usgsDyfi10kmOpacity ?? 0.6
        }
      }, beforeId);
    }

    const source = map.getSource('selected-usgs-dyfi-10km-source') as maplibregl.GeoJSONSource;
    if (source) {
      source.setData(selectedEarthquakeUsgsDyfi10km || { type: 'FeatureCollection', features: [] });
    }

    const eqLayer = settings.layers.find(l => l.type === 'gdacs_earthquakes');
    const visibility = eqLayer?.usgsDyfi10kmEnabled ? 'visible' : 'none';
    if (map.getLayer('selected-usgs-dyfi-10km-fill')) {
      map.setLayoutProperty('selected-usgs-dyfi-10km-fill', 'visibility', visibility);
      map.setPaintProperty('selected-usgs-dyfi-10km-fill', 'fill-opacity', eqLayer?.usgsDyfi10kmOpacity ?? 0.6);
    }
  }, [selectedEarthquakeUsgsDyfi10km, mapLoaded, settings.layers]);

  // Render USGS DYFI 1km
  useEffect(() => {
     
    if (!map || !mapLoaded) return;

    if (!map.getSource('selected-usgs-dyfi-1km-source')) {
      map.addSource('selected-usgs-dyfi-1km-source', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
      });

      const eqLayer = settings.layers.find(l => l.type === 'gdacs_earthquakes');
      const beforeId = (eqLayer && map.getLayer(`dynamic-layer-${eqLayer.id}`)) ? `dynamic-layer-${eqLayer.id}` : 'custom-polygons';

      map.addLayer({
        id: 'selected-usgs-dyfi-1km-fill',
        type: 'fill',
        source: 'selected-usgs-dyfi-1km-source',
        paint: {
          'fill-color': [
            'step',
            ['to-number', ['coalesce', ['get', 'cdi'], 0]],
            '#ffffff', 1,
            '#bfccff', 2,
            '#a0e6ff', 3,
            '#80ffff', 4,
            '#7aff93', 5,
            '#ffff00', 6,
            '#ffc800', 7,
            '#ff9100', 8,
            '#ff0000', 9,
            '#c80000'
          ],
          'fill-opacity': eqLayer?.usgsDyfi1kmOpacity ?? 0.6
        }
      }, beforeId);
    }

    const source = map.getSource('selected-usgs-dyfi-1km-source') as maplibregl.GeoJSONSource;
    if (source) {
      source.setData(selectedEarthquakeUsgsDyfi1km || { type: 'FeatureCollection', features: [] });
    }

    const eqLayer = settings.layers.find(l => l.type === 'gdacs_earthquakes');
    const visibility = eqLayer?.usgsDyfi1kmEnabled ? 'visible' : 'none';
    if (map.getLayer('selected-usgs-dyfi-1km-fill')) {
      map.setLayoutProperty('selected-usgs-dyfi-1km-fill', 'visibility', visibility);
      map.setPaintProperty('selected-usgs-dyfi-1km-fill', 'fill-opacity', eqLayer?.usgsDyfi1kmOpacity ?? 0.6);
    }
  }, [selectedEarthquakeUsgsDyfi1km, mapLoaded, settings.layers]);

  // Render USGS Landslide Overlay
  useEffect(() => {
     
    if (!map || !mapLoaded) return;

    if (!map.getSource('selected-usgs-landslide-source') && selectedEarthquakeUsgsLandslide) {
      map.addSource('selected-usgs-landslide-source', {
        type: 'image',
        url: selectedEarthquakeUsgsLandslide.url,
        coordinates: [
          [selectedEarthquakeUsgsLandslide.extent[0], selectedEarthquakeUsgsLandslide.extent[3]], // Top Left
          [selectedEarthquakeUsgsLandslide.extent[1], selectedEarthquakeUsgsLandslide.extent[3]], // Top Right
          [selectedEarthquakeUsgsLandslide.extent[1], selectedEarthquakeUsgsLandslide.extent[2]], // Bottom Right
          [selectedEarthquakeUsgsLandslide.extent[0], selectedEarthquakeUsgsLandslide.extent[2]]  // Bottom Left
        ]
      });

      const eqLayer = settings.layers.find(l => l.type === 'gdacs_earthquakes');
      const beforeId = (eqLayer && map.getLayer(`dynamic-layer-${eqLayer.id}`)) ? `dynamic-layer-${eqLayer.id}` : 'custom-polygons';

      map.addLayer({
        id: 'selected-usgs-landslide-raster',
        type: 'raster',
        source: 'selected-usgs-landslide-source',
        paint: {
          'raster-opacity': eqLayer?.usgsLandslideOpacity ?? 0.8
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

    const eqLayer = settings.layers.find(l => l.type === 'gdacs_earthquakes');
    const visibility = (eqLayer?.usgsLandslideEnabled && selectedEarthquakeUsgsLandslide) ? 'visible' : 'none';
    if (map.getLayer('selected-usgs-landslide-raster')) {
      map.setLayoutProperty('selected-usgs-landslide-raster', 'visibility', visibility);
      map.setPaintProperty('selected-usgs-landslide-raster', 'raster-opacity', eqLayer?.usgsLandslideOpacity ?? 0.8);
      
      const bMin = eqLayer?.usgsLandslideBrightness !== undefined && eqLayer.usgsLandslideBrightness > 0 ? eqLayer.usgsLandslideBrightness : 0;
      const bMax = eqLayer?.usgsLandslideBrightness !== undefined && eqLayer.usgsLandslideBrightness < 0 ? 1 + eqLayer.usgsLandslideBrightness : 1;
      map.setPaintProperty('selected-usgs-landslide-raster', 'raster-brightness-min', bMin);
      map.setPaintProperty('selected-usgs-landslide-raster', 'raster-brightness-max', bMax);
      map.setPaintProperty('selected-usgs-landslide-raster', 'raster-contrast', eqLayer?.usgsLandslideContrast ?? 0);
      map.setPaintProperty('selected-usgs-landslide-raster', 'raster-saturation', eqLayer?.usgsLandslideSaturation ?? 0);
      map.setPaintProperty('selected-usgs-landslide-raster', 'raster-hue-rotate', eqLayer?.usgsLandslideHue ?? 0);
    }
  }, [selectedEarthquakeUsgsLandslide, mapLoaded, settings.layers]);

  // Render USGS Liquefaction Overlay
  useEffect(() => {
     
    if (!map || !mapLoaded) return;

    if (!map.getSource('selected-usgs-liquefaction-source') && selectedEarthquakeUsgsLiquefaction) {
      map.addSource('selected-usgs-liquefaction-source', {
        type: 'image',
        url: selectedEarthquakeUsgsLiquefaction.url,
        coordinates: [
          [selectedEarthquakeUsgsLiquefaction.extent[0], selectedEarthquakeUsgsLiquefaction.extent[3]], // Top Left
          [selectedEarthquakeUsgsLiquefaction.extent[1], selectedEarthquakeUsgsLiquefaction.extent[3]], // Top Right
          [selectedEarthquakeUsgsLiquefaction.extent[1], selectedEarthquakeUsgsLiquefaction.extent[2]], // Bottom Right
          [selectedEarthquakeUsgsLiquefaction.extent[0], selectedEarthquakeUsgsLiquefaction.extent[2]]  // Bottom Left
        ]
      });

      const eqLayer = settings.layers.find(l => l.type === 'gdacs_earthquakes');
      const beforeId = (eqLayer && map.getLayer(`dynamic-layer-${eqLayer.id}`)) ? `dynamic-layer-${eqLayer.id}` : 'custom-polygons';

      map.addLayer({
        id: 'selected-usgs-liquefaction-raster',
        type: 'raster',
        source: 'selected-usgs-liquefaction-source',
        paint: {
          'raster-opacity': eqLayer?.usgsLiquefactionOpacity ?? 0.8
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

    const eqLayer = settings.layers.find(l => l.type === 'gdacs_earthquakes');
    const visibility = (eqLayer?.usgsLiquefactionEnabled && selectedEarthquakeUsgsLiquefaction) ? 'visible' : 'none';
    if (map.getLayer('selected-usgs-liquefaction-raster')) {
      map.setLayoutProperty('selected-usgs-liquefaction-raster', 'visibility', visibility);
      map.setPaintProperty('selected-usgs-liquefaction-raster', 'raster-opacity', eqLayer?.usgsLiquefactionOpacity ?? 0.8);
      
      const bMin = eqLayer?.usgsLiquefactionBrightness !== undefined && eqLayer.usgsLiquefactionBrightness > 0 ? eqLayer.usgsLiquefactionBrightness : 0;
      const bMax = eqLayer?.usgsLiquefactionBrightness !== undefined && eqLayer.usgsLiquefactionBrightness < 0 ? 1 + eqLayer.usgsLiquefactionBrightness : 1;
      map.setPaintProperty('selected-usgs-liquefaction-raster', 'raster-brightness-min', bMin);
      map.setPaintProperty('selected-usgs-liquefaction-raster', 'raster-brightness-max', bMax);
      map.setPaintProperty('selected-usgs-liquefaction-raster', 'raster-contrast', eqLayer?.usgsLiquefactionContrast ?? 0);
      map.setPaintProperty('selected-usgs-liquefaction-raster', 'raster-saturation', eqLayer?.usgsLiquefactionSaturation ?? 0);
      map.setPaintProperty('selected-usgs-liquefaction-raster', 'raster-hue-rotate', eqLayer?.usgsLiquefactionHue ?? 0);
    }
  }, [selectedEarthquakeUsgsLiquefaction, mapLoaded, settings.layers]);
  
  // Fetch corresponding CEMS activation when a GDACS earthquake is selected
  useEffect(() => {
    if (!selectedEarthquake) {
      return;
    }

    // Always clear old CEMS selection when selecting a new earthquake
    if (selectedCemsEarthquake) {
      setSelectedCemsEarthquakeState(null);
    }

    let isSubscribed = true;
    (async () => {
      try {
        console.log(`Fetching CEMS for gdacsId: EQ${selectedEarthquake.id}`);
        const res = await fetch(`https://rapidmapping.emergency.copernicus.eu/backend/dashboard-api/public-activations-info/?gdacsId=EQ${selectedEarthquake.id}`);
        let act = null;

        if (res.ok) {
           const data = await res.json();
           if (data && data.results && data.results.length > 0) {
             act = data.results[0];
           }
        }
        
        // Fallback to spatial matching if gdacsId fails
        if (!act) {
           console.log(`gdacsId match failed. Attempting spatial matching for earthquake coordinates:`, selectedEarthquake.coordinates);
           const allRes = await fetch(`https://rapidmapping.emergency.copernicus.eu/backend/dashboard-api/public-activations-info/`);
           if (allRes.ok) {
             const allData = await allRes.json();
             if (allData && allData.results) {
               // Find all earthquake activations
               const earthquakes = allData.results.filter((a: any) => a.category === 'Earthquake' && a.centroid);
               
               let closestAct = null;
               let minDistance = Infinity;

               for (const a of earthquakes) {
                 // Ensure the CEMS event time is within 7 days of the GDACS earthquake time
                 const eqDate = new Date(selectedEarthquake.properties.fromdate);
                 const cemsDate = new Date(a.eventTime || a.activationTime);
                 const timeDiffDays = Math.abs(eqDate.getTime() - cemsDate.getTime()) / (1000 * 3600 * 24);
                 
                 if (isNaN(timeDiffDays) || timeDiffDays > 7) {
                   continue;
                 }

                 const geom = parseWKT(a.centroid);
                 if (geom && geom.geometry && geom.geometry.type === 'Point') {
                   const cemsCoords = geom.geometry.coordinates as [number, number];
                   const dist = haversineDistance(selectedEarthquake.coordinates, cemsCoords);
                   if (dist < minDistance) {
                     minDistance = dist;
                     closestAct = a;
                   }
                 }
               }

               // If the closest CEMS earthquake is within 100km, match it
               if (closestAct && minDistance <= 100) {
                 console.log(`Spatial match found: ${closestAct.code} at distance ${minDistance.toFixed(2)}km`);
                 act = closestAct;
               }
             }
           }
        }

        if (act && isSubscribed) {
           setSelectedCemsEarthquakeState({
             id: act.code,
             code: act.code,
             properties: act,
             coordinates: selectedEarthquake.coordinates
           });
        }
      } catch (err) {
        console.error('Error fetching correlated CEMS activation:', err);
      }
    })();

    return () => {
      isSubscribed = false;
    };
  }, [selectedEarthquake]);

  // Fetch danger zone polygon when selectedVolcano changes
  useEffect(() => {
    if (!selectedVolcano) {
      setSelectedVolcanoPolygon(null);
      return;
    }

    let isSubscribed = true;
    (async () => {
      try {
        const polyRes = await fetch(selectedVolcano.geomUrl.replace('http:', 'https:'));
        if (!polyRes.ok) throw new Error('Failed to fetch volcano polygon');
        const polyData = await polyRes.json();
        if (isSubscribed) {
          setSelectedVolcanoPolygon(polyData);
        }
      } catch (err) {
        console.error('Error fetching danger zone polygon for selected volcano:', err);
        if (isSubscribed) {
          setSelectedVolcanoPolygon(null);
        }
      }
    })();

    return () => { isSubscribed = false; };
  }, [selectedVolcano]);


  return {
    selectedEarthquake,
    setSelectedEarthquakeState,
    selectedEarthquakeShakemap,
    selectedEarthquakeUsgsDyfi10km,
    selectedEarthquakeUsgsDyfi1km,
    selectedEarthquakeUsgsLandslide,
    selectedEarthquakeUsgsLiquefaction,
    selectedCemsEarthquake,
    setSelectedCemsEarthquakeState,
    selectedCemsEarthquakeFeatures,
    activeCemsWildfireFeatures,
    setActiveCemsWildfireFeatures,
    activeCemsFloodFeatures,
    setActiveCemsFloodFeatures,
    selectedVolcano,
    setSelectedVolcanoState,
    selectedVolcanoPolygon,
  };
};
