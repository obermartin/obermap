const https = require('https');
https.get('https://react-tweet.vercel.app/api/tweet/2074799946147024896', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    try {
      const parsed = JSON.parse(data);
      console.log(JSON.stringify(parsed.data.video, null, 2));
    } catch (e) { console.error(e); }
  });
});
