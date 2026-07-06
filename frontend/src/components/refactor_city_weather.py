import re

file_path = '/Users/obermartin/Documents/CURRENT/BILD/OBERMAP2/frontend/src/components/MapContainer.tsx'

with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Add import
import_str = """import { CityWeatherMarkers } from './weather/CityWeatherMarkers';
"""
content = re.sub(r"(import React,.*?;\n)", r"\1" + import_str, content, count=1)

# 2. Remove state and refs
weather_state_pattern = r"^\s*const \[weatherCityData, setWeatherCityData\] = useState.*?;\n\s*const weatherCityFetchCacheRef = useRef.*?;\n\s*const weatherCityMarkersRef = useRef.*?;\n"
content = re.sub(weather_state_pattern, "", content, flags=re.MULTILINE | re.DOTALL)

# 3. Remove Render weather city markers useEffect
city_markers_pattern = r"^\s*// Render weather city markers\n\s*useEffect\(\(\) => \{\n.*?\}, \[weatherCityData, settings\.layers.*?\]\);\n"
content = re.sub(city_markers_pattern, "", content, flags=re.MULTILINE | re.DOTALL)

# 4. Remove Fetch weather data for visible cities useEffect
fetch_cities_pattern = r"^\s*// Fetch weather data for visible cities\n\s*useEffect\(\(\) => \{\n.*?\}, \[mapLoaded, settings\.layers\]\);\n"
content = re.sub(fetch_cities_pattern, "", content, flags=re.MULTILINE | re.DOTALL)

# 5. Insert the component into the JSX
jsx_insert_pattern = r"(<div ref=\{mapContainer\} className=\"w-full h-full touch-none\" />\n)"
jsx_code = """        {/* Weather Subcomponents */}
        <CityWeatherMarkers 
          map={mapRef.current} 
          mapLoaded={mapLoaded} 
          weatherLayer={weatherLayerForTime} 
          selectedWeatherTime={selectedWeatherTime} 
          weatherValidTimes={weatherValidTimes} 
        />
"""
content = re.sub(jsx_insert_pattern, r"\1" + jsx_code, content, count=1)

# We need weatherLayerForTime and selectedWeatherTime defined. Let's see if they exist.
# They are declared around line 247: `const weatherLayerForTime = settings.layers.find...`
# So they should be available in the JSX.

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)

print("Modifications complete.")
