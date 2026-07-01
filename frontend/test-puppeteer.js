import puppeteer from 'puppeteer';

(async () => {
  const browser = await puppeteer.launch({ headless: "new" });
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  
  await page.goto('http://localhost:5173');
  
  // Wait for layers to load
  await new Promise(r => setTimeout(r, 5000));

  await page.evaluate(() => {
    // enable wildfires
    window.dispatchEvent(new CustomEvent('DEBUG_TOGGLE_WILDFIRES'));
  });

  await new Promise(r => setTimeout(r, 2000));
  
  // Dump window.DEBUG_GDACS_WILDFIRES
  const data = await page.evaluate(() => {
    return window.DEBUG_GDACS_WILDFIRES;
  });
  
  console.log('GDACS DATA:', data ? JSON.stringify(data).substring(0, 500) : 'NULL');
  
  await browser.close();
})();
