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
        function upgradeLegacyFilter(filter) {
          if (!Array.isArray(filter) || filter.length === 0) return filter;
          const op = filter[0];
          
          // Check if it's already an expression (e.g., uses 'get', 'has' without legacy structure, or is a known expression only op)
          // Legacy filters ALWAYS have a string as their second element (the property key), except for 'all', 'any', 'none'
          if (op !== 'all' && op !== 'any' && op !== 'none') {
            if (filter.length > 1 && Array.isArray(filter[1])) {
              return filter; // Already an expression
            }
          }

          if (op === 'all' || op === 'any' || op === 'none') {
            return [op, ...filter.slice(1).map(upgradeLegacyFilter)];
          }
          if (op === 'has') return ['has', filter[1]];
          if (op === '!has') return ['!', ['has', filter[1]]];
          if (op === 'in') return ['in', ['get', filter[1]], ['literal', filter.slice(2)]];
          if (op === '!in') return ['!', ['in', ['get', filter[1]], ['literal', filter.slice(2)]]];
          if (['==', '!=', '>', '>=', '<', '<='].includes(op)) {
            return [op, ['get', filter[1]], filter[2]];
          }
          return filter;
        }

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
          const finalFilter = ["all", upgradeLegacyFilter(origFilter), extraCondition];
          
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
