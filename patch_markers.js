const fs = require('fs');
const file = 'frontend/src/components/weather/CityWeatherMarkers.tsx';
let code = fs.readFileSync(file, 'utf8');

code = code.replace(
  /el\.className = 'custom-city-weather-marker.*';/,
  `el.className = 'custom-city-weather-marker absolute pointer-events-none flex items-center gap-1.5 px-2 py-0.5 -mt-4 text-white bg-black shadow-md rounded';\n        el.style.zIndex = '9999';\n        el.style.backgroundColor = 'black';\n        el.style.color = 'white';\n        el.style.border = '1px solid rgba(255,255,255,0.2)';`
);

code = code.replace(
  /const el = marker\.getElement\(\);\n\s*el\.innerHTML = '';/,
  `const el = marker.getElement();\n      el.innerHTML = '';`
);

// Add cleanup function
code = code.replace(
  /return null;\n\};\n$/,
  `  useEffect(() => {\n    return () => {\n      Object.values(weatherCityMarkersRef.current).forEach(m => m.remove());\n      weatherCityMarkersRef.current = {};\n    };\n  }, []);\n\n  return null;\n};\n`
);

fs.writeFileSync(file, code);
