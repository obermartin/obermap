with open('frontend/src/hooks/useDisasterStream.ts', 'r') as f:
    text = f.read()

# Fix turf imports
text = text.replace("import { length as turfLength } from '@turf/turf';", "import { length, along, lineSlice } from '@turf/turf';")
text = text.replace("import { lineString } from '@turf/helpers';", "")

# Fix utils imports
text = text.replace("import { getEffectiveLayerDates } from '../utils/mapUtils';", "import { getEffectiveLayerDates, parseWKT, safeFetchCemsJson } from '../utils/mapUtils';")

# Add missing refs
refs_to_add = """  const [shakemapRawData, setShakemapRawData] = useState<any>(null);
  const allCemsActivationsRef = useRef<Promise<any> | null>(null);
  const cemsFeatureCacheRef = useRef<Record<string, any>>({});
"""

text = text.replace("  const [shakemapRawData, setShakemapRawData] = useState<any>(null);", refs_to_add)

with open('frontend/src/hooks/useDisasterStream.ts', 'w') as f:
    f.write(text)

print("Fixes applied.")
