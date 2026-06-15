const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  
  await page.goto('http://localhost:5173', {waitUntil: 'networkidle0'});
  await new Promise(r => setTimeout(r, 2000));
  
  // Inject script to expose map
  const mapState = await page.evaluate(() => {
    return new Promise(resolve => {
      // Find the map instance
      // Mapbox GL JS attaches the map to the container element
      const mapContainer = document.querySelector('.mapboxgl-canvas-container').parentNode;
      // We can't easily get the map instance from the DOM.
      // Let's monkey-patch mapboxgl.Map in the page to expose the instance
      resolve("Cannot easily grab map instance");
    });
  });
  console.log(mapState);
  await browser.close();
})();
