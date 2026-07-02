const https = require('https');

https.get('https://rapidmapping.emergency.copernicus.eu/backend/dashboard-api/public-activations-info/?limit=2000', (res) => {
  let data = '';
  res.on('data', (chunk) => data += chunk);
  res.on('end', () => {
    const json = JSON.parse(data);
    const activations = json.results || [];
    
    const sDate = new Date('2026-02-01').getTime();
    const eDate = new Date('2026-02-28').getTime() + 24*60*60*1000 - 1;
    
    const matchingActivations = activations.filter((act) => {
      if (act.category !== 'Flood') return false;
      const actTime = new Date(act.eventTime || act.activationTime).getTime();
      const lastUpdate = act.lastUpdate ? new Date(act.lastUpdate).getTime() : actTime;
      const buffer = 7 * 24 * 60 * 60 * 1000;
      return (actTime - buffer) <= eDate && (lastUpdate + buffer) >= sDate;
    });
    
    console.log('Matching activations:', matchingActivations.map(a => a.code));
  });
});
