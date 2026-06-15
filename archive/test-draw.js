const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  
  // Collect all console logs
  const logs = [];
  page.on('console', async (msg) => {
    const args = await Promise.all(msg.args().map(a => a.jsonValue().catch(() => a.toString())));
    logs.push(args.join(' '));
  });
  
  await page.goto('http://localhost:5173', {waitUntil: 'networkidle0'});
  await new Promise(r => setTimeout(r, 2000));
  
  // We need to fetch the annotations source data
  const data = await page.evaluate(() => {
    const map = window._map; // Wait, we didn't expose map to window.
    return "Map not exposed";
  });
  
  console.log(logs.join('\n'));
  
  await browser.close();
})();
