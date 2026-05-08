const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('BROWSER CONSOLE:', msg.text()));
  page.on('pageerror', err => console.log('BROWSER ERROR:', err.toString()));
  
  await page.goto('http://localhost:5174');
  await page.waitForTimeout(2000);
  
  console.log("Setting tool to arrow");
  await page.evaluate(() => {
    // We can't click easily, let's just trigger window events or we can click the exact coordinate
  });
  
  // Actually, we can use puppeteer mouse
  await page.mouse.click(30, 250); // Guessing where the arrow tool is (left sidebar)
  await page.waitForTimeout(500);
  
  console.log("Drawing first arrow");
  await page.mouse.move(300, 300);
  await page.mouse.down();
  await page.mouse.move(400, 400, {steps: 10});
  await page.mouse.up();
  await page.waitForTimeout(500);

  console.log("Drawing second arrow");
  await page.mouse.move(500, 300);
  await page.mouse.down();
  await page.mouse.move(600, 400, {steps: 10});
  await page.mouse.up();
  await page.waitForTimeout(1000);
  
  await browser.close();
})();
