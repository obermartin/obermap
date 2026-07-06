import re

with open('frontend/src/components/MapboxMap.tsx', 'r') as f:
    mapbox = f.read()

# Grab the block from "// Simple concurrency limiter for CEMS fetches"
# down to the end of safeFetchCemsJson
start_str = "// Simple concurrency limiter for CEMS fetches"
end_str = "    }\n  });\n}"

start_idx = mapbox.find(start_str)
end_idx = mapbox.find(end_str, start_idx) + len(end_str)

if start_idx != -1 and end_idx != -1:
    cems_block = mapbox[start_idx:end_idx]
    
    # remove from mapbox
    mapbox = mapbox[:start_idx] + mapbox[end_idx:]
    with open('frontend/src/components/MapboxMap.tsx', 'w') as f:
        f.write(mapbox)
        
    print("Removed original CEMS block from MapboxMap.")
    
    # Write to mapUtils.ts
    with open('frontend/src/utils/mapUtils.ts', 'r') as f:
        map_utils = f.read()
    
    # remove the broken cems_util_block I added earlier
    broken_block_start = "const MAX_CONCURRENT_CEMS_FETCHES = 10;"
    broken_block_idx = map_utils.find(broken_block_start)
    if broken_block_idx != -1:
        map_utils = map_utils[:broken_block_idx]
    
    # append the good block, but make safeFetchCemsJson exported
    cems_block = cems_block.replace("async function safeFetchCemsJson", "export async function safeFetchCemsJson")
    
    # Wait, the MapboxMap.tsx block lacked enqueueCemsFetch!
    # Did my previous script delete it? Let's add it back.
    enqueue_code = """
const MAX_CONCURRENT_CEMS_FETCHES = 10;

export function enqueueCemsFetch<T>(task: () => Promise<T>): Promise<T> {
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
"""
    map_utils += "\n" + cems_block.replace("const cemsFetchQueue", enqueue_code + "\nconst cemsFetchQueue")
    
    with open('frontend/src/utils/mapUtils.ts', 'w') as f:
        f.write(map_utils)
    print("Added CEMS block to mapUtils.ts")

# 2. Fix the useDisasterAlerts missing ref error
with open('frontend/src/hooks/useDisasterAlerts.ts', 'r') as f:
    hook = f.read()

# In useDisasterAlerts.ts(480,9): error TS2552: Cannot find name 'selectedCemsEarthquakeRef'.
# This is inside an effect that was copied over. We can replace it with `selectedCemsEarthquake`.
hook = hook.replace("selectedCemsEarthquakeRef.current", "selectedCemsEarthquake")
hook = hook.replace("selectedEarthquakeRef.current", "selectedEarthquake")

with open('frontend/src/hooks/useDisasterAlerts.ts', 'w') as f:
    f.write(hook)
print("Fixed missing refs in useDisasterAlerts.")

# 3. Fix weatherToggleRef in MapboxMap.tsx
with open('frontend/src/components/MapboxMap.tsx', 'r') as f:
    mapbox2 = f.read()

mapbox2 = mapbox2.replace("const weatherToggleRef = useRef<boolean>(false);", "") # remove if it was somehow dangling
mapbox2 = mapbox2.replace("  const weatherToggleRef = useRef<boolean>(false);\n", "")

# Wait, if it says "Cannot find name 'weatherToggleRef'", it means I DELETED the declaration!
# Let's add it back at the top!
mapbox2 = mapbox2.replace("const cemsFeatureCacheRef = useRef<Record<string, any>>({});", "const cemsFeatureCacheRef = useRef<Record<string, any>>({});\n  const weatherToggleRef = useRef<boolean>(false);")

with open('frontend/src/components/MapboxMap.tsx', 'w') as f:
    f.write(mapbox2)
print("Restored weatherToggleRef")

