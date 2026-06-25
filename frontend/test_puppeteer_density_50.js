import puppeteer from 'puppeteer';

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  
  await page.setContent(`
    <!DOCTYPE html>
    <html>
    <head>
      <script src="https://unpkg.com/maplibre-gl@5.0.1/dist/maplibre-gl.js"></script>
      <link href="https://unpkg.com/maplibre-gl@5.0.1/dist/maplibre-gl.css" rel="stylesheet" />
    </head>
    <body>
      <div id="map" style="width: 800px; height: 800px;"></div>
      <script>
        const map = new maplibregl.Map({
          container: 'map',
          style: 'https://tiles.openfreemap.org/styles/liberty',
          center: [10, 50],
          zoom: 6
        });
        
        map.on('load', () => {
          setTimeout(() => {
            const featuresBefore = map.queryRenderedFeatures({ layers: ['label_city'] });
            console.log('Features before filter:', featuresBefore.length);
            
            const id = 'label_city';
            const origFilter = map.getFilter(id) || null;
            
            // test density = 50
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
              map.setFilter(id, finalFilter);
              
              setTimeout(() => {
                const featuresAfter = map.queryRenderedFeatures({ layers: ['label_city'] });
                console.log('Features after filter:', featuresAfter.length);
              }, 1000);
            } catch(e) {
              console.log('Error:', e.message);
            }
          }, 3000);
        });
      </script>
    </body>
    </html>
  `);

  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  
  await new Promise(r => setTimeout(r, 10000));
  await browser.close();
})();
