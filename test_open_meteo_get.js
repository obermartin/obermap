async function test() {
  const lats = Array(200).fill(50.1).join(',');
  const lons = Array(200).fill(10.1).join(',');
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lons}&daily=wind_speed_10m_max`;
  console.log("URL length:", url.length);
  const res = await fetch(url);
  console.log(res.status);
}
test();
