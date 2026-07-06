with open('frontend/src/components/MapboxMap.tsx', 'r') as f:
    mapbox_content = f.read()

start_idx = mapbox_content.find("  // Fetch geometry when selectedCycloneId changes")
end_idx = mapbox_content.find("  // Dynamically update clip polygons to match screen-space of highlight DOM labels")
night_start = mapbox_content.find("  // Nighttime layer update", start_idx)
night_end = mapbox_content.find("  // Fetch detailed CEMS activation when selectedCemsEarthquake changes", start_idx)

if start_idx != -1 and end_idx != -1 and night_start != -1 and night_end != -1:
    night_logic = mapbox_content[night_start:night_end]
    
    replacement = f"""  useDisasterStream({{
    map: mapRef.current,
    mapLoaded,
    settings,
    selectedCycloneId,
    cycloneTimelinePercent,
    setCycloneTimelinePercent,
    selectedCemsEarthquake,
    selectedEarthquake,
    selectedVolcano,
    getEffectiveLayerDates,
    t
  }});

{night_logic}"""
    
    new_mapbox_content = mapbox_content[:start_idx] + replacement + mapbox_content[end_idx:]
    
    # Also remove the useState declarations for internal states
    states_to_remove = [
        "  const [cycloneRawData, setCycloneRawData] = useState<any>(null);\\n",
        "  const [shakemapRawData, setShakemapRawData] = useState<any>(null);\\n",
        "  const [cemsEarthquakeActivation, setCemsEarthquakeActivation] = useState<any>(null);\\n",
        "  const [cemsWildfireActivations, setCemsWildfireActivations] = useState<any[]>([]);\\n",
        "  const [cemsFloodActivations, setCemsFloodActivations] = useState<any[]>([]);\\n",
        "  const earthquakeMarkerRef = useRef<maplibregl.Marker | null>(null);\\n",
        "  const volcanoMarkerRef = useRef<maplibregl.Marker | null>(null);\\n"
    ]
    
    for state in states_to_remove:
        new_mapbox_content = new_mapbox_content.replace(state.replace("\\n", "\n"), "")
        
    # Add import
    import_statement = "import { useDisasterStream } from '../hooks/useDisasterStream';\n"
    new_mapbox_content = new_mapbox_content.replace("import { useAisStream } from '../hooks/useAisStream';", "import { useAisStream } from '../hooks/useAisStream';\n" + import_statement)
        
    with open('frontend/src/components/MapboxMap.tsx', 'w') as f:
        f.write(new_mapbox_content)
        
    print("Successfully replaced disaster logic in MapboxMap.tsx")
else:
    print("Could not find replacement bounds in MapboxMap.tsx")
