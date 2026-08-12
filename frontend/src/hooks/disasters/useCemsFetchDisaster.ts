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
          allCemsActivationsRef.current = fetch(`https://rapidmapping.emergency.copernicus.eu/backend/dashboard-api/public-activations-info/?limit=2000`)
            .then(res => res.json())
            .then(data => data?.results || []);
        }
        const activations = await allCemsActivationsRef.current;
        if (!activations) return;

        const sDate = new Date(effectiveStartDate).getTime();
        const eDate = new Date(effectiveEndDate).getTime() + 24 * 60 * 60 * 1000 - 1;
        const matching = activations.filter((act: any) => {
          if (act.category !== category) return false;
          const actTime = new Date(act.eventTime || act.activationTime).getTime();
          const buffer = 7 * 24 * 60 * 60 * 1000;
          return (actTime >= sDate - buffer && actTime <= eDate + buffer);
        });

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
              const res = await fetch(`https://rapidmapping.emergency.copernicus.eu/backend/dashboard-api/public-activations/?code=${act.code}`);
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
