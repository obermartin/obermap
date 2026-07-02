import re

with open('src/components/MapContainer.tsx', 'r') as f:
    content = f.read()

# 1. Inject cemsFetchQueue ONLY ONCE, right above safeFetchCemsJson
# First, let's find the safeFetchCemsJson declaration
safe_fetch_regex = r"(async function safeFetchCemsJson\(url: string\) \{\n  try \{\n    const res = await fetch\(url\);\n    if \(\!res\.ok\) return \[\];\n    const text = await res\.text\(\);\n    try \{\n      const data = JSON\.parse\(text\);\n      return data && data\.features \? data\.features : \(data\.type === 'Feature' \? \[data\] : \[\]\);\n    \} catch \(err: any\) \{.*?return features;\n    \}\n  \} catch \(e\) \{\n    console\.warn\(`Fetch error for CEMS JSON \$\{url\}`\, e\);\n    return \[\];\n  \}\n\})"

match = re.search(safe_fetch_regex, content, re.DOTALL)
if match:
    old_func = match.group(1)
    
    new_func = """// Simple concurrency limiter for CEMS fetches
const cemsFetchQueue: (() => Promise<void>)[] = [];
let activeCemsFetches = 0;
const MAX_CONCURRENT_CEMS_FETCHES = 10;

async function enqueueCemsFetch<T>(task: () => Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    cemsFetchQueue.push(async () => {
      try {
        resolve(await task());
      } catch (e) {
        reject(e);
      }
    });
    processCemsFetchQueue();
  });
}

function processCemsFetchQueue() {
  while (activeCemsFetches < MAX_CONCURRENT_CEMS_FETCHES && cemsFetchQueue.length > 0) {
    const task = cemsFetchQueue.shift();
    if (task) {
      activeCemsFetches++;
      task().finally(() => {
        activeCemsFetches--;
        processCemsFetchQueue();
      });
    }
  }
}

async function safeFetchCemsJson(url: string) {
  return enqueueCemsFetch(async () => {
""" + old_func.replace("async function safeFetchCemsJson(url: string) {\n", "").replace("return features;\n    }\n  } catch (e) {\n    console.warn(`Fetch error for CEMS JSON ${url}`, e);\n    return [];\n  }\n}", "return features;\n    }\n  } catch (e) {\n    console.warn(`Fetch error for CEMS JSON ${url}`, e);\n    return [];\n  }\n  });\n}")
    
    content = content.replace(old_func, new_func)

# 2. Modify Floods loop to use incremental Mapbox updating and ignore allResults
# We will find the specific flood mapping block
flood_mapping_regex = r"(        const fetchPromises = matchingActivations\.map\(\(act: any\) => \{\n          if \(\!cemsFeatureCacheRef\.current\[act\.code\]\) \{.*?delete cemsFeatureCacheRef\.current\[act\.code\];\n            return \[\];\n          \}\);\n        \}\);\n\n        const allResults = await Promise\.all\(fetchPromises\);\n        const allFeatures = allResults\.flat\(\);\n\n        console\.log\(`\[CEMS Debug\] Total features to render:`, allFeatures\.length\);\n\n        if \(isSubscribed\) \{\n          setActiveCemsFloodFeatures\(\{\n            type: 'FeatureCollection',\n            features: allFeatures\n          \}\);\n        \})"

match = re.search(flood_mapping_regex, content, re.DOTALL)
if match:
    old_block = match.group(1)
    
    new_block = old_block.replace(
        """          return cemsFeatureCacheRef.current[act.code].catch((e: any) => {
            console.error('[CEMS Debug] Failed to fetch detailed CEMS activation', e);
            delete cemsFeatureCacheRef.current[act.code];
            return [];
          });
        });

        const allResults = await Promise.all(fetchPromises);
        const allFeatures = allResults.flat();

        console.log(`[CEMS Debug] Total features to render:`, allFeatures.length);

        if (isSubscribed) {
          setActiveCemsFloodFeatures({
            type: 'FeatureCollection',
            features: allFeatures
          });
        }""",
        """          return cemsFeatureCacheRef.current[act.code].then((actFeatures: any[]) => {
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

        await Promise.all(fetchPromises);"""
    )
    content = content.replace(old_block, new_block)

# 3. Fix Clear Cache for both Wildfire and Flood
content = content.replace(
    "if (!floodLayer || !floodLayer.visible || !floodLayer.copernicusEnabled) {\n      if (activeCemsFloodFeatures) setActiveCemsFloodFeatures(null);\n      return;\n    }",
    "if (!floodLayer || !floodLayer.visible || !floodLayer.copernicusEnabled) {\n      if (activeCemsFloodFeatures) setActiveCemsFloodFeatures(null);\n      cemsFeatureCacheRef.current = {};\n      return;\n    }"
)

with open('src/components/MapContainer.tsx', 'w') as f:
    f.write(content)
