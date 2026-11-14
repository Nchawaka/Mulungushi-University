// Captures Swagger UI screenshots for the lab report (requires a running server and playwright-core + Chromium)
const { chromium } = require('playwright-core');
const BASE = process.env.BASE_URL || 'http://localhost:3000';
const OUT = require('path').join(__dirname, '..', 'docs', 'screenshots');

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome',
    args: ['--no-sandbox'],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto(`${BASE}/api-docs/`, { waitUntil: 'networkidle' });
  await page.waitForSelector('.opblock');
  await page.screenshot({ path: `${OUT}/01-swagger-overview.png`, fullPage: false });

  // Expand POST /api/v1/reports, try an INVALID payload live
  await page.click('#operations-Reports-createReport .opblock-summary');
  await page.click('#operations-Reports-createReport .try-out__btn');
  const ta = page.locator('#operations-Reports-createReport textarea.body-param__text');
  await ta.fill(JSON.stringify({ category: 'cooking', title: 'abc', building: 'Block A', isAdmin: true }, null, 2));
  await page.click('#operations-Reports-createReport .execute');
  await page.waitForSelector('#operations-Reports-createReport .live-responses-table .response-col_status');
  await page.waitForTimeout(500);
  await page.locator('#operations-Reports-createReport').scrollIntoViewIfNeeded();
  const sy = await page.evaluate(() => window.scrollY);
  const top = await page.locator('#operations-Reports-createReport .opblock-summary').boundingBox();
  const live = await page.locator('#operations-Reports-createReport .live-responses-table').boundingBox();
  await page.screenshot({
    path: `${OUT}/02-swagger-try-invalid-422.png`,
    fullPage: true,
    clip: { x: top.x, y: top.y + sy, width: top.width, height: live.y + live.height - top.y + 8 },
  });

  // Schemas section (OAS 3.1 renders components with the JSON Schema 2020-12 viewer)
  await page.click('#operations-Reports-createReport .opblock-summary'); // collapse
  const art = page
    .locator('section.models article.json-schema-2020-12[data-json-schema-level="0"]')
    .filter({ has: page.locator('.json-schema-2020-12__title', { hasText: /^ReportCreate$/ }) });
  await art.scrollIntoViewIfNeeded();
  await art.locator('.json-schema-2020-12-expand-deep-button').first().click();
  await page.waitForTimeout(600);
  await art.screenshot({ path: `${OUT}/03-swagger-schemas.png` });
  await browser.close();
  console.log('screenshots saved');
})().catch((e) => { console.error(e); process.exit(1); });
