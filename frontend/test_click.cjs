const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  page.on('console', msg => {
    if (msg.text().includes('HIGHLIGHT CLICK')) {
      console.log('BROWSER CONSOLE:\n', msg.text());
    }
  });
  
  await page.goto('http://localhost:5174');
  await page.waitForTimeout(5000); // let map load
  
  // Click the highlight tool
  const highlightTool = await page.locator('button[title="Select Place/Country"]').first();
  await highlightTool.click();
  await page.waitForTimeout(1000);
  
  // Click in the middle of the map (Berlin area approx from default view)
  await page.mouse.click(500, 500);
  await page.waitForTimeout(2000);
  
  await browser.close();
})();
