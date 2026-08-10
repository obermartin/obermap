import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('BROWSER CONSOLE:', msg.text()));
  
  await page.goto('http://localhost:5173');
  await page.waitForTimeout(5000); // Wait for map to load
  
  const layersInfo = await page.evaluate(() => {
    if (!window.map) return 'No window.map';
    const style = window.map.getStyle();
    if (!style) return 'No style';
    const layers = style.layers;
    
    const eqIdx = layers.findIndex(l => l.id === 'selected-earthquake-shakemap-fill');
    const fireIdx = layers.findIndex(l => l.id === 'active-wildfire-cems-vt-polygons');
    
    return {
      totalLayers: layers.length,
      hasEarthquake: eqIdx !== -1,
      eqIndex: eqIdx,
      eqBefore: eqIdx !== -1 ? layers[eqIdx + 1]?.id : null,
      eqAfter: eqIdx !== -1 ? layers[eqIdx - 1]?.id : null,
      hasWildfire: fireIdx !== -1,
      fireIndex: fireIdx,
      fireBefore: fireIdx !== -1 ? layers[fireIdx + 1]?.id : null,
      fireAfter: fireIdx !== -1 ? layers[fireIdx - 1]?.id : null,
      customPolygonsIdx: layers.findIndex(l => l.id === 'custom-polygons'),
      firstSymbolIdx: layers.findIndex(l => l.type === 'symbol'),
      firstSymbolId: layers.find(l => l.type === 'symbol')?.id,
      shakemapLayout: window.map.getLayer('selected-earthquake-shakemap-fill') ? window.map.getLayoutProperty('selected-earthquake-shakemap-fill', 'visibility') : null,
      shakemapOpacity: window.map.getLayer('selected-earthquake-shakemap-fill') ? window.map.getPaintProperty('selected-earthquake-shakemap-fill', 'fill-opacity') : null,
    };
  });
  
  console.log('LAYERS INFO:', JSON.stringify(layersInfo, null, 2));
  
  await browser.close();
})();
