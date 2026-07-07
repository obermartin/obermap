async function test() {
  const params = new URLSearchParams({
    latitude: '50.1,50.2',
    longitude: '10.1,10.2',
    daily: 'temperature_2m_max'
  });
  
  const res = await fetch('https://api.open-meteo.com/v1/forecast', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString()
  });
  
  console.log(res.status);
  console.log(await res.text());
}

test();
