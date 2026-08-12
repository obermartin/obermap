const fs = require('fs');
let content = fs.readFileSync('src/components/MapboxMap.tsx', 'utf8');

// The wind particle animation block starts around `  useEffect(() => {` after `// Prototype Open-Meteo wind layer.`?
// Actually in the current state it just starts with `  useEffect(() => {\n    const map = mapRef.current;\n    const canvas = windCanvasRef.current;\n    const windLayer = settings.layers.find(l => l.type === 'weather_forecast');\n`
// Let's replace the whole useEffect block.

const startStr = `  useEffect(() => {
    const map = mapRef.current;
    const canvas = windCanvasRef.current;
    const windLayer = settings.layers.find(l => l.type === 'weather_forecast');
    if (!map || !canvas || !mapLoaded || !windLayer?.visible || !windGeojson || isSecondary) return;`;

const endStr = `      map.off('pitchend', refreshParticles);
      ctx.clearRect(0, 0, width, height);
    };
  }, [settings.layers, mapLoaded, windGeojson, isSecondary, selectedWeatherTime]);`;

const startIndex = content.indexOf(startStr);
const endIndex = content.indexOf(endStr, startIndex);

if (startIndex === -1 || endIndex === -1) {
  console.error("Could not find block to replace!");
  process.exit(1);
}

const before = content.substring(0, startIndex);
const after = content.substring(endIndex + endStr.length);

const hookCall = `  useWindAnimation({
    map: mapRef.current,
    canvas: windCanvasRef.current,
    mapLoaded,
    settings,
    windGeojson,
    isSecondary,
    selectedWeatherTime
  });`;

content = before + hookCall + after;

// Add import
const importStr = `import { useWindAnimation } from '../hooks/useWindAnimation';\n`;
// Add it after the other hooks imports
content = content.replace(`import { useWeatherLayer } from '../hooks/useWeatherLayer';`, `import { useWeatherLayer } from '../hooks/useWeatherLayer';\n${importStr}`);

fs.writeFileSync('src/components/MapboxMap.tsx', content, 'utf8');
console.log("Replaced successfully!");
