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
            const originalFiltersRef = { current: {} };
            const style = map.getStyle();
            
            if (style && style.layers) {
              style.layers.forEach(layer => {
                if (layer.type === 'symbol' && !layer.id.startsWith('custom-')) {
                  originalFiltersRef.current[layer.id] = map.getFilter(layer.id) || null;
                }
              });
              
              const density = 50;
              
              style.layers.forEach(layer => {
                if (layer.type === 'symbol' && !layer.id.startsWith('custom-')) {
                  const origFilter = originalFiltersRef.current[layer.id];
                  let extraCondition = null;
                  const id = layer.id.toLowerCase();
                  const sourceLayer = layer['source-layer'] ? layer['source-layer'].toLowerCase() : '';
                  
                  if (id.includes('place') || sourceLayer.includes('place') || id.includes('settlement') || sourceLayer.includes('settlement') || id.includes('village') || id.includes('town') || id.includes('cit') || id.includes('capital')) {
                    if (density < 100) {
                      let maxRank = 1;
                      if (density > 0) {
                        maxRank = 1 + Math.floor(Math.pow(density / 100, 2) * 14);
                      }
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
                      let capCondition = ['==', '1', '2'];
                      if (density === 0) {
                         capCondition = ['all', ['has', 'capital'], ['==', ['get', 'capital'], 2]]; 
                      } else if (density < 10) {
                         capCondition = ['all', ['has', 'capital'], ['<=', ['get', 'capital'], 3]]; 
                      } else {
                         capCondition = ['all', ['has', 'capital'], ['>', ['get', 'capital'], 0]];   
                      }
                      const isCountry = ['any', ['==', ['get', 'class'], 'country'], ['==', ['get', 'type'], 'country']];
                      extraCondition = ['any', rankCondition, capCondition, isCountry];
                    }
                  }
                  
                  let finalFilter = origFilter;
                  if (extraCondition) {
                    finalFilter = origFilter ? ['all', origFilter, extraCondition] : extraCondition;
                  }
                  
                  try {
                    map.setFilter(layer.id, finalFilter);
                  } catch(e) {
                    console.log('Error:', layer.id, e.message);
                  }
                }
              });
              
              console.log("Filters applied.");
              setTimeout(() => {
                const featuresAfter = map.queryRenderedFeatures({ layers: ['label_city'] });
                console.log('Features after filter:', featuresAfter.length);
              }, 1000);
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
