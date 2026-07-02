const fs = require('fs');
let code = fs.readFileSync('src/components/MapContainer.tsx', 'utf8');

const wrongWildfireCode = `          return cemsFeatureCacheRef.current[act.code].then(actFeatures => {
            if (isSubscribed && actFeatures.length > 0) {
              setActiveCemsFloodFeatures(prev => {
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

        // Replaced monolithic assembly with incremental updates in the promise chain
        // We still await all to handle loading states if needed
        await Promise.all(fetchPromises);
        const allFeatures = allResults.flat();
        if (isSubscribed) {
          const actCollection: GeoJSON.FeatureCollection = {
            type: 'FeatureCollection',
            features: allFeatures
          };
          setActiveCemsWildfireFeatures(actCollection);
        }`;

// Wait, the replace code for wildfire was a mix. Let's just restore the file and patch carefully.
