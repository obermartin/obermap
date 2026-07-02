const fs = require('fs');
let code = fs.readFileSync('src/components/MapContainer.tsx', 'utf8');

// 1. Fix Wildfire
const wfSearch = `        const allResults = await Promise.all(fetchPromises);
        const allFeatures: any[] = [];

        console.log(\`[CEMS Debug] Total features to render:\`, allFeatures.length);

        if (isSubscribed) {
          setActiveCemsWildfireFeatures({
            type: 'FeatureCollection',
            features: allFeatures
          });
        }`;
const wfReplace = `        const allResults = await Promise.all(fetchPromises);
        const allFeatures = allResults.flat();

        console.log(\`[CEMS Debug] Total features to render:\`, allFeatures.length);

        if (isSubscribed) {
          setActiveCemsWildfireFeatures({
            type: 'FeatureCollection',
            features: allFeatures
          });
        }`;
code = code.replace(wfSearch, wfReplace);


// 2. Fix Flood
const floodSearch = `          return cemsFeatureCacheRef.current[act.code].then((actFeatures: any[]) => {
            if (isSubscribed && actFeatures.length > 0) {
              setActiveCemsFloodFeatures((prev: any) => {
                const currentFeatures = prev && prev.features ? prev.features : [];
                return {
                  type: 'FeatureCollection',
                  features: [...currentFeatures, ...actFeatures]
                };
              });
            }
            return actFeatures;
          }).catch((e: any) => {
            console.error('[CEMS Debug] Failed to fetch detailed CEMS activation', e);
            delete cemsFeatureCacheRef.current[act.code];
            return [];
          });
        });

        await Promise.all(fetchPromises);`;

const floodReplace = `          return cemsFeatureCacheRef.current[act.code].catch((e: any) => {
            console.error('[CEMS Debug] Failed to fetch detailed CEMS activation', e);
            delete cemsFeatureCacheRef.current[act.code];
            return [];
          });
        });

        const allResults = await Promise.all(fetchPromises);
        const allFeatures = allResults.flat();

        if (isSubscribed) {
          setActiveCemsFloodFeatures({
            type: 'FeatureCollection',
            features: allFeatures
          });
        }`;
code = code.replace(floodSearch, floodReplace);

fs.writeFileSync('src/components/MapContainer.tsx', code);
console.log('Fixed rendering logic');
