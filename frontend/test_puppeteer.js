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
          style: 'https://tiles.openfreemap.org/styles/liberty',
          center: [10, 50],
          zoom: 4
        });
        
        map.on('load', () => {
          const id = 'label_city';
          const origFilter = map.getFilter(id) || null;
          console.log('origFilter:', JSON.stringify(origFilter));
          
          const maxRank = 8;
          const classBasedRank = ['case',
            ['==', ['get', 'class'], 'city'], 5,
            ['==', ['get', 'class'], 'town'], 10,
            ['==', ['get', 'class'], 'village'], 15,
            ['any',
              ['==', ['get', 'class'], 'hamlet'],
              ['==', ['get', 'class'], 'suburb'],
              ['==', ['get', 'class'], 'neighbourhood'],
              ['==', ['get', 'class'], 'isolated_dwelling']
            ], 20,
            30
          ];
          const rankCondition = ['<=', ['coalesce', ['get', 'symbolrank'], ['get', 'scalerank'], ['get', 'rank'], classBasedRank], maxRank];
          const capCondition = ['all', ['has', 'capital'], ['>', ['get', 'capital'], 0]];
          const isCountry = ['any', ['==', ['get', 'class'], 'country'], ['==', ['get', 'type'], 'country']];
          const extraCondition = ['any', rankCondition, capCondition, isCountry];
          
          try {
            const finalFilter = origFilter ? ['all', origFilter, extraCondition] : extraCondition;
            console.log('Applying filter:', JSON.stringify(finalFilter));
            map.setFilter(id, finalFilter);
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
  
  await new Promise(r => setTimeout(r, 5000));
  await browser.close();
})();
