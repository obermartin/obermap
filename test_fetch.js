async function test() {
  const res = await fetch('https://rapidmapping.emergency.copernicus.eu/backend/dashboard-api/public-activations-info/?limit=2000');
  const data = await res.json();
  const results = data.results || [];
  const emsr886 = results.find(r => r.code === 'EMSR886');
  console.log('EMSR886:', !!emsr886);
  const emsr873 = results.find(r => r.code === 'EMSR873');
  console.log('EMSR873:', !!emsr873);
}

test();
