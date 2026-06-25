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
          style: {
            version: 8,
            sources: {
              'foo': { type: 'geojson', data: { type: 'FeatureCollection', features: [] } }
            },
            layers: [
              {
                id: 'test',
                type: 'symbol',
                source: 'foo',
                filter: ["==", "class", "city"]
              }
            ]
          }
        });
        
        map.on('load', () => {
          const origFilter = map.getFilter('test') || null;
          console.log('origFilter:', JSON.stringify(origFilter));
          
          const extraCondition = ["==", ["get", "test"], "yes"];
          const finalFilter = ["all", origFilter, extraCondition];
          
          try {
            map.setFilter('test', finalFilter);
            console.log('Success!');
          } catch(e) {
            console.log('Error:', e.message);
          }
        });
      </script>
    </body>
    </html>
  `);

  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  
  await new Promise(r => setTimeout(r, 3000));
  await browser.close();
})();
