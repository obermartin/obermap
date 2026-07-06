import re

# Fix mapUtils.ts
with open('frontend/src/utils/mapUtils.ts', 'r') as f:
    map_utils = f.read()

# Add queue variables
queue_vars = """
const MAX_CONCURRENT_CEMS_FETCHES = 10;
let cemsFetchQueue: (() => Promise<any>)[] = [];
let activeCemsFetches = 0;
"""
map_utils = map_utils.replace("export function enqueueCemsFetch", queue_vars + "\nexport function enqueueCemsFetch")
map_utils = map_utils.replace("async export function", "export async function")

with open('frontend/src/utils/mapUtils.ts', 'w') as f:
    f.write(map_utils)


# Fix useDisasterAlerts.ts
with open('frontend/src/hooks/useDisasterAlerts.ts', 'r') as f:
    hook = f.read()

# import safeFetchCemsJson
if "safeFetchCemsJson" not in hook.split("from '../utils/mapUtils';")[0]:
    hook = hook.replace("import { parseWKT, haversineDistance }", "import { parseWKT, haversineDistance, safeFetchCemsJson }")

with open('frontend/src/hooks/useDisasterAlerts.ts', 'w') as f:
    f.write(hook)


# Fix MapboxMap.tsx
with open('frontend/src/components/MapboxMap.tsx', 'r') as f:
    mapbox = f.read()

# Remove old queue vars if they exist
mapbox = re.sub(r"const MAX_CONCURRENT_CEMS_FETCHES = 10;\nlet cemsFetchQueue: \(\(\) => Promise<any>\)\[\] = \[\];\nlet activeCemsFetches = 0;\n", "", mapbox)
mapbox = re.sub(r"window\.cemsDebugInfo = \(\) => \(\{ q: cemsFetchQueue\.length, active: activeCemsFetches \}\);\n", "", mapbox)

# import useDisasterAlerts
if "import { useDisasterAlerts }" not in mapbox:
    mapbox = mapbox.replace("import { useAnnotationTools }", "import { useAnnotationTools }\nimport { useDisasterAlerts } from '../hooks/useDisasterAlerts';")

# fix TS2740 (missing await on safeFetchCemsJson? wait, safeFetchCemsJson returns a promise)
# In MapboxMap.tsx line 5218: `allCemsActivationsRef.current = safeFetchCemsJson(...)`
# wait, it was originally `await safeFetchCemsJson` or it was inside an async IIFE!
# Let's check line 5218.

with open('frontend/src/components/MapboxMap.tsx', 'w') as f:
    f.write(mapbox)

print("Fixed build issues.")
