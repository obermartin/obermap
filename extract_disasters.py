import re

with open('frontend/src/components/MapboxMap.tsx', 'r') as f:
    content = f.read()

# Define blocks to extract
blocks_to_extract = [
    # Cyclone Geometry
    (r"  // Fetch geometry when selectedCycloneId changes\n  useEffect\(\(\) => \{.*?^  \}, \[selectedCycloneId, mapLoaded, settings\.layers\]\);\n", "cyclone_geometry"),
    # Cyclone Track
    (r"  // Effect to process and render the cyclone track based on the timeline slider\n  useEffect\(\(\) => \{.*?^  \}, \[cycloneRawData, cycloneTimelinePercent, mapLoaded, settings\.layers\]\);\n", "cyclone_track"),
    # CEMS Earthquakes
    (r"  // Fetch detailed CEMS activation when selectedCemsEarthquake changes\n  useEffect\(\(\) => \{.*?^  \}, \[selectedCemsEarthquake, settings\.layers\]\);\n", "cems_earthquake"),
    # CEMS Wildfires
    (r"  // Fetch detailed CEMS activations for wildfires in the date range\n  useEffect\(\(\) => \{.*?^  \}, \[settings\.layers, settings\.globalDateMode, settings\.globalStartDate, settings\.globalEndDate, getEffectiveLayerDates\]\);\n", "cems_wildfires"),
    # CEMS Floods
    (r"  // Fetch detailed CEMS activations for floods in the date range\n  useEffect\(\(\) => \{.*?^  \}, \[settings\.layers, settings\.globalDateMode, settings\.globalStartDate, settings\.globalEndDate, getEffectiveLayerDates\]\);\n", "cems_floods"),
    # Earthquake Shakemap
    (r"  // Fetch shakemap when selectedEarthquake changes\n  useEffect\(\(\) => \{.*?^  \}, \[selectedEarthquake, mapLoaded, settings\.layers\]\);\n", "shakemap"),
    # Update filters
    (r"  // Update earthquake labels filter\n  useEffect\(\(\) => \{.*?^  \}, \[selectedEarthquake, mapLoaded\]\);\n", "earthquake_filter"),
    (r"  // Update cyclone point filter to hide selected cyclone point\n  useEffect\(\(\) => \{.*?^  \}, \[selectedCycloneId, mapLoaded\]\);\n", "cyclone_filter"),
    # DOM Labels and Rendering
    (r"  // Render selected earthquake DOM label\n  useEffect\(\(\) => \{.*?^  \}, \[selectedEarthquake, mapLoaded, settings\.layers\]\);\n", "earthquake_label"),
    (r"  // Render selected earthquake shakemap\n  useEffect\(\(\) => \{.*?^  \}, \[selectedEarthquake, shakemapRawData, mapLoaded, settings\.layers\]\);\n", "shakemap_render"),
    (r"  // Render selected CEMS earthquake VT layers\n  useEffect\(\(\) => \{.*?^  \}, \[selectedCemsEarthquake, cemsEarthquakeActivation, mapLoaded, settings\.layers\]\);\n", "cems_earthquake_render"),
    (r"  // Render CEMS Wildfire Features\n  useEffect\(\(\) => \{.*?^  \}, \[cemsWildfireActivations, mapLoaded, settings\.layers\]\);\n", "cems_wildfires_render"),
    (r"  // Flood CEMS VT rendering\n  useEffect\(\(\) => \{.*?^  \}, \[cemsFloodActivations, mapLoaded, settings\.layers\]\);\n", "cems_floods_render"),
    (r"  // Render selected volcano DOM label\n  useEffect\(\(\) => \{.*?^  \}, \[selectedVolcano, mapLoaded, settings\.layers\]\);\n", "volcano_label"),
    (r"  // Render selected volcano danger zone polygon\n  useEffect\(\(\) => \{.*?^  \}, \[selectedVolcano, mapLoaded, settings\.layers\]\);\n", "volcano_render")
]

extracted_blocks = []
for pattern, name in blocks_to_extract:
    match = re.search(pattern, content, re.MULTILINE | re.DOTALL)
    if match:
        extracted_blocks.append((name, match.group(0)))
        content = content.replace(match.group(0), "")
    else:
        print(f"FAILED TO FIND BLOCK: {name}")

print(f"Extracted {len(extracted_blocks)} blocks.")

# Build useDisasterStream.ts
hook_content = """import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import type { AppSettings } from '../types';

export interface DisasterStreamProps {
  map: maplibregl.Map | null;
  mapLoaded: boolean;
  settings: AppSettings;
  getEffectiveLayerDates: (layer: any) => { effectiveStartDate: string; effectiveEndDate: string; };
  selectedCycloneId: any;
  cycloneRawData: any;
  setCycloneRawData: (data: any) => void;
  cycloneTimelinePercent: number;
  setCycloneTimelinePercent: (val: number) => void;
  selectedCemsEarthquake: any;
  selectedEarthquake: any;
  selectedVolcano: any;
  t: (key: string) => string;
}

export const useDisasterStream = ({
  map,
  mapLoaded,
  settings,
  getEffectiveLayerDates,
  selectedCycloneId,
  cycloneRawData,
  setCycloneRawData,
  cycloneTimelinePercent,
  setCycloneTimelinePercent,
  selectedCemsEarthquake,
  selectedEarthquake,
  selectedVolcano,
  t
}: DisasterStreamProps) => {
  const [shakemapRawData, setShakemapRawData] = useState<any>(null);
  const [cemsEarthquakeActivation, setCemsEarthquakeActivation] = useState<any>(null);
  const [cemsWildfireActivations, setCemsWildfireActivations] = useState<any[]>([]);
  const [cemsFloodActivations, setCemsFloodActivations] = useState<any[]>([]);

  const earthquakeMarkerRef = useRef<maplibregl.Marker | null>(null);
  const volcanoMarkerRef = useRef<maplibregl.Marker | null>(null);

"""

for name, block in extracted_blocks:
    # Replace mapRef.current with map
    block = block.replace("const map = mapRef.current;", "")
    block = block.replace("!mapRef.current", "!map")
    block = block.replace("mapRef.current", "map")
    hook_content += block + "\n"

hook_content += "};\n"

with open('frontend/src/hooks/useDisasterStream.ts', 'w') as f:
    f.write(hook_content)

with open('frontend/src/components/MapboxMap.tsx', 'w') as f:
    f.write(content)

