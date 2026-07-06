import re

with open('frontend/src/hooks/useDisasterStream.ts', 'r') as f:
    text = f.read()

# Add missing turf imports
turf_imports = "import along from '@turf/along';\nimport turfLength from '@turf/length';\nimport lineSlice from '@turf/line-slice';\n"
text = text.replace("import turfLength from '@turf/length';\n", "")
text = text.replace("import lineSlice from '@turf/line-slice';\n", "")
text = text.replace("import type { AppSettings } from '../types';\n", "import type { AppSettings } from '../types';\n" + turf_imports)

# Fix turfLength usage
text = text.replace("length(masterTrack", "turfLength(masterTrack")

# Add mapUtils imports
utils_imports = "import { parseWKT, safeFetchCemsJson } from '../utils/mapUtils';\n"
text = text.replace("import turfLength", utils_imports + "import turfLength")

with open('frontend/src/hooks/useDisasterStream.ts', 'w') as f:
    f.write(text)

print("Fixed imports and turfLength.")
