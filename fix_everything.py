import re

# 1. MapboxMap.tsx
with open('frontend/src/components/MapboxMap.tsx', 'r') as f:
    mapbox = f.read()

# The exact block at the top of MapboxMap:
cems_queue_regex = r"const MAX_CONCURRENT_CEMS_FETCHES = 10;\nlet cemsFetchQueue: \(\(\) => Promise<any>\)\[\] = \[\];\nlet activeCemsFetches = 0;\n\nexport function enqueueCemsFetch<T>\(task: \(\) => Promise<T>\): Promise<T> \{\n  return new Promise\(\(resolve, reject\) => \{\n    cemsFetchQueue\.push\(async \(\) => \{\n      try \{\n        resolve\(await task\(\)\);\n      \} catch \(e\) \{\n        reject\(e\);\n      \}\n    \}\);\n    processCemsFetchQueue\(\);\n  \}\);\n\}\n\n// @ts-ignore\nwindow\.cemsDebugInfo = \(\) => \(\{ q: cemsFetchQueue\.length, active: activeCemsFetches \}\);\n\nfunction processCemsFetchQueue\(\) \{\n  while \(activeCemsFetches < MAX_CONCURRENT_CEMS_FETCHES && cemsFetchQueue\.length > 0\) \{\n    const task = cemsFetchQueue\.shift\(\);\n    if \(task\) \{\n      activeCemsFetches\+\+;\n      task\(\)\.finally\(\(\) => \{\n        activeCemsFetches--;\n        processCemsFetchQueue\(\);\n      \}\);\n    \}\n  \}\n\}\n\nasync function safeFetchCemsJson\(url: string\) \{\n  return enqueueCemsFetch\(async \(\) => \{\n    try \{\n      const res = await fetch\(url\);\n      if \(\!res\.ok\) return \[\];\n      const text = await res\.text\(\);\n      return parseWKT\(text\);\n    \} catch \(e\) \{\n      console\.error\('Failed to fetch CEMS geometry:', e\);\n      return \[\];\n    \}\n  \}\);\n\}\n"

# Search for the block using a looser regex just in case
cems_block_loose = r"(const MAX_CONCURRENT_CEMS_FETCHES = 10;[\s\S]*?async function safeFetchCemsJson[\s\S]*?\}\n\n)"
match = re.search(cems_block_loose, mapbox)
if match:
    mapbox = mapbox.replace(match.group(1), "")
    print("Removed cems queue block from MapboxMap.")
else:
    print("Could not find cems queue block in MapboxMap. Trying fallback:")
    match = re.search(r"(const MAX_CONCURRENT_CEMS_FETCHES = 10;[\s\S]*?  \}\);\n\}\n)", mapbox)
    if match:
        mapbox = mapbox.replace(match.group(1), "")
        print("Removed cems queue block (fallback) from MapboxMap.")

# Also there are old imports in mapbox
# let's write mapbox
with open('frontend/src/components/MapboxMap.tsx', 'w') as f:
    f.write(mapbox)

# 2. mapUtils.ts
with open('frontend/src/utils/mapUtils.ts', 'r') as f:
    map_utils = f.read()

# remove old mangled insertions
map_utils = re.sub(r"\nconst MAX_CONCURRENT_CEMS_FETCHES = 10;[\s\S]*", "", map_utils)

cems_util_block = """
const MAX_CONCURRENT_CEMS_FETCHES = 10;
let cemsFetchQueue: (() => Promise<any>)[] = [];
let activeCemsFetches = 0;

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

export async function safeFetchCemsJson(url: string) {
  return enqueueCemsFetch(async () => {
    try {
      const res = await fetch(url);
      if (!res.ok) return [];
      const text = await res.text();
      return parseWKT(text);
    } catch (e) {
      console.error('Failed to fetch CEMS geometry:', e);
      return [];
    }
  });
}
"""

with open('frontend/src/utils/mapUtils.ts', 'w') as f:
    f.write(map_utils + "\n" + cems_util_block)
print("Updated mapUtils.ts")

# 3. useDisasterAlerts.ts
with open('frontend/src/hooks/useDisasterAlerts.ts', 'r') as f:
    hook = f.read()

# Remove unused refs
hook = re.sub(r"  const selectedEarthquakeRef = useRef.*?\n", "", hook)
hook = re.sub(r"  const selectedCemsEarthquakeRef = useRef.*?\n", "", hook)
hook = re.sub(r"  const selectedVolcanoRef = useRef.*?\n", "", hook)
hook = re.sub(r"  const cemsFeatureCacheRef = useRef.*?\n", "", hook)
hook = re.sub(r"  const allCemsActivationsRef = useRef.*?\n", "", hook)

with open('frontend/src/hooks/useDisasterAlerts.ts', 'w') as f:
    f.write(hook)
print("Cleaned up useDisasterAlerts.ts")

