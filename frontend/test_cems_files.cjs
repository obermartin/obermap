const https = require('https');

https.get('https://rapidmapping.emergency.copernicus.eu/backend/dashboard-api/public-activations/?code=EMSR864', (res) => {
  let data = '';
  res.on('data', (chunk) => data += chunk);
  res.on('end', () => {
    const json = JSON.parse(data);
    const aois = json.results[0].aois || [];
    
    aois.forEach(aoi => {
      if(aoi.products) {
        aoi.products.forEach(p => {
          if(p.layers) {
            p.layers.forEach(l => {
              if (l.format === 'vt' && l.json) {
                https.get(l.json, (res2) => {
                  let ldata = '';
                  res2.on('data', chunk => ldata += chunk);
                  res2.on('end', () => {
                    try {
                      JSON.parse(ldata);
                    } catch(e) {
                      console.log('Error parsing', l.json, e.message);
                    }
                  });
                });
              }
            });
          }
        });
      }
    });
  });
});
