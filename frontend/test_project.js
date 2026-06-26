import puppeteer from 'puppeteer';

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  
  await page.setContent(`
    <!DOCTYPE html>
    <html>
    <head>
      <script src="https://unpkg.com/maplibre-gl@5.0.1/dist/maplibre-gl.js"></script>
    </head>
    <body>
      <div id="map" style="width: 400px; height: 400px;"></div>
      <script>
        const map = new maplibregl.Map({
          container: 'map',
          style: { version: 8, sources: {}, layers: [] },
          center: [10, 50],
          zoom: 6
        });
        
        map.on('load', () => {
          const pt1 = map.project([10, 50]);
          console.log('Project 400x400 (center):', pt1.x, pt1.y);
          
          document.getElementById('map').style.width = '800px';
          document.getElementById('map').style.height = '800px';
          map.resize();
          
          const pt2 = map.project([10, 50]);
          console.log('Project 800x800 (center):', pt2.x, pt2.y);
        });
      </script>
    </body>
    </html>
  `);

  page.on('console', msg => console.log(msg.text()));
  
  await new Promise(r => setTimeout(r, 2000));
  await browser.close();
})();
