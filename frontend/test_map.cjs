const { chromium } = require('playwright-core');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('BROWSER:', msg.text()));
  
  console.log('Navigating to local dev server...');
  await page.goto('http://localhost:5173');
  
  console.log('Waiting for map to initialize...');
  await page.waitForTimeout(10000); // Wait 10 seconds for map and data
  
  // Click on a CEMS earthquake or wildfire to trigger the overlay?
  // Or just dump the layers to see if they exist!
  const layers = await page.evaluate(() => {
    if (!window.__DEBUG_MAP__) return 'NO MAP';
    return window.__DEBUG_MAP__.getStyle().layers.map(l => l.id);
  });
  
  console.log('Layers:', JSON.stringify(layers, null, 2));
  
  await browser.close();
})();
