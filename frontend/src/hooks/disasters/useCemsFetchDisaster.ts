import { useEffect } from 'react';
import type { AppSettings } from '../../types';
import { getEffectiveLayerDates } from '../../utils/layerUtils';
import { parseWKT } from '../../utils/mapUtils';

export interface UseCemsFetchDisasterProps {
  layerId: string;
  category: 'Wildfire' | 'Flood';
  cemsType: 'wildfire' | 'flood';
  settings: AppSettings;
  map: any;
  allCemsActivationsRef: React.MutableRefObject<Promise<any> | null>;
  cemsFeatureCacheRef: React.MutableRefObject<Record<string, any>>;
  activeFeatures: any;
  setActiveFeatures: React.Dispatch<React.SetStateAction<any>>;
}

export const useCemsFetchDisaster = ({
  layerId,
  category,
  cemsType,
  settings,
  map,
  allCemsActivationsRef,
  cemsFeatureCacheRef,
  activeFeatures,
  setActiveFeatures
}: UseCemsFetchDisasterProps) => {
  useEffect(() => {
    // layerId could be 'wildfires' or 'floods'
    const layer = settings.layers.find(l => l.type === layerId || l.id === layerId);
    
    if (!layer || !layer.visible || layer.copernicusEnabled === false) {
      if (activeFeatures) setActiveFeatures(null);
      window.dispatchEvent(new CustomEvent('exportDataReady', { detail: { type: `cems_${cemsType}`, id: undefined, ready: false } }));
      return;
    }

    let isSubscribed = true;
    window.dispatchEvent(new CustomEvent('exportDataReady', { detail: { type: `cems_${cemsType}`, id: cemsType, ready: false } }));
    const { effectiveStartDate, effectiveEndDate } = getEffectiveLayerDates(layer, settings);
    
    (async () => {
      try {
        if (!allCemsActivationsRef.current) {
          const rawUrl = `https://rapidmapping.emergency.copernicus.eu/backend/dashboard-api/public-activations-info/?limit=2000`;
          const url = `./api.php?action=proxy_cems&url=${encodeURIComponent(rawUrl)}`;
          allCemsActivationsRef.current = fetch(url)
            .then(res => res.json())
            .then(data => data?.results || []);
        }
        const activations = await allCemsActivationsRef.current;
        if (!activations) {
           console.log(`[CEMS Debug] ${cemsType} - no activations returned from limit=2000`);
           return;
        }

        const sDate = new Date(effectiveStartDate).getTime();
        const eDate = new Date(effectiveEndDate).getTime() + 24 * 60 * 60 * 1000 - 1;
        const matching = activations.filter((act: any) => {
          if (act.category !== category) return false;
          const actTime = new Date(act.eventTime || act.activationTime).getTime();
          const buffer = 7 * 24 * 60 * 60 * 1000;
          return (actTime >= sDate - buffer && actTime <= eDate + buffer);
        });
        
        console.log(`[CEMS Debug] ${cemsType} - found ${matching.length} matching activations for ${category} between ${new Date(sDate).toISOString()} and ${new Date(eDate).toISOString()}`);

        if (matching.length === 0) {
          if (isSubscribed) {
            setActiveFeatures(null);
            window.dispatchEvent(new CustomEvent('exportDataReady', { detail: { type: `cems_${cemsType}`, id: cemsType, ready: 'empty' } }));
          }
          return;
        }

        const fetchPromises = matching.map((act: any) => {
          if (!cemsFeatureCacheRef.current[act.code]) {
            cemsFeatureCacheRef.current[act.code] = (async () => {
              const rawUrl2 = `https://rapidmapping.emergency.copernicus.eu/backend/dashboard-api/public-activations/?code=${act.code}`;
              const url2 = `./api.php?action=proxy_cems&url=${encodeURIComponent(rawUrl2)}`;
              const res = await fetch(url2);
              const data = await res.json();
              const actFeatures: any[] = [];
              if (data?.results?.[0]?.aois) {
                let aoiIndex = 0;
                for (const aoi of data.results[0].aois) {
                  aoiIndex++;
                  if (aoi.extent) {
                    const aoiGeom = parseWKT(aoi.extent);
                    if (aoiGeom) {
                      const guaranteedAoiName = aoi.aoiName || aoi.name || `AOI-${aoiIndex}`;
                      actFeatures.push({
                        type: 'Feature',
                        geometry: aoiGeom.geometry,
                        properties: { 
                          aoiName: guaranteedAoiName, 
                          isExtent: true,
                          isClickableAoi: true,
                          activationCode: act.code,
                          cemsType: cemsType,
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
          return cemsFeatureCacheRef.current[act.code].catch(() => { delete cemsFeatureCacheRef.current[act.code]; return []; });
        });

        const allFeatures = (await Promise.all(fetchPromises)).flat();
        console.log(`[CEMS Debug] ${cemsType} - successfully extracted ${allFeatures.length} AOI features`);
        if (isSubscribed) {
          if (allFeatures.length > 0) {
            setActiveFeatures({ type: 'FeatureCollection', features: allFeatures });
          }
          window.dispatchEvent(new CustomEvent('exportDataReady', { detail: { type: `cems_${cemsType}`, id: cemsType, ready: allFeatures.length > 0 ? true : 'empty' } }));
        }
      } catch (err) {
        console.error(`Error fetching CEMS ${cemsType} data`, err);
        if (isSubscribed) window.dispatchEvent(new CustomEvent('exportDataReady', { detail: { type: `cems_${cemsType}`, id: cemsType, ready: 'empty' } }));
      }
    })();
    return () => { isSubscribed = false; };
  }, [settings.layers, settings.globalDateMode, settings.globalStartDate, settings.globalEndDate, map]);
};
