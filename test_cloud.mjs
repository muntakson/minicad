import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage();
page.on('console', msg => { if (msg.type() === 'error') console.log('ERR:', msg.text().substring(0,200)); });

await page.goto('http://localhost:3010', { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);

// Test 1: Open from Cloud
console.log('=== Test 1: Open from Cloud ===');
await page.click('[data-menu="file"]');
await page.waitForTimeout(300);
await page.click('[data-action="cloud-open"]');
await page.waitForTimeout(1000);

const isOpen = await page.$eval('#cloud-overlay', el => el.classList.contains('open'));
console.log('Dialog opened:', isOpen);

const fileRows = await page.$$('.cloud-file-row');
console.log('Files listed:', fileRows.length);

// Find the plywood file
let targetRow = null;
for (const row of fileRows) {
  const name = await row.$eval('.cloud-file-name', el => el.textContent);
  if (name.includes('plywood')) { targetRow = row; break; }
}
if (!targetRow && fileRows.length > 0) targetRow = fileRows[0];

if (targetRow) {
  const fname = await targetRow.$eval('.cloud-file-name', el => el.textContent);
  console.log('Opening:', fname);
  await targetRow.click();
  await page.waitForTimeout(200);
  await page.click('#cloud-open-ok');
  await page.waitForTimeout(3000);
  const entityCount = await page.evaluate(() => window.__store.entities.length);
  console.log('Entities loaded:', entityCount);
  console.log('Test 1:', entityCount > 0 ? 'PASS' : 'FAIL');
} else {
  console.log('Test 1: FAIL (no files)');
}

// Test 2: Save to Cloud
console.log('\n=== Test 2: Save to Cloud ===');
await page.click('[data-menu="file"]');
await page.waitForTimeout(300);
await page.click('[data-action="cloud-save"]');
await page.waitForTimeout(500);

const saveOpen = await page.$eval('#cloud-overlay', el => el.classList.contains('open'));
console.log('Save dialog opened:', saveOpen);

await page.fill('#cloud-save-name', 'test-cloud-save.dxf');
await page.click('#cloud-save-ok');

// Wait for save to complete
await page.waitForFunction(() => {
  const hist = document.getElementById('cmd-history').textContent;
  return hist.includes('Saved to cloud') || hist.includes('Error');
}, { timeout: 15000 });

const lastOutput = await page.evaluate(() => {
  const lines = document.getElementById('cmd-history').textContent.split('\n').filter(l => l.trim());
  return lines[lines.length - 1];
});
console.log('Result:', lastOutput);

const listRes = await page.evaluate(async () => {
  const r = await fetch('http://localhost:3002/api/cloud/list');
  return r.json();
});
const saved = listRes.files.find(f => f.filename === 'test-cloud-save.dxf');
console.log('File in cloud:', !!saved, saved ? `(${saved.entity_count} entities)` : '');
console.log('Test 2:', saved ? 'PASS' : 'FAIL');

// Test 3: Re-open saved file
console.log('\n=== Test 3: Re-open saved file ===');
await page.evaluate(() => { window.__store.entities = []; });

await page.click('[data-menu="file"]');
await page.waitForTimeout(300);
await page.click('[data-action="cloud-open"]');
await page.waitForTimeout(1000);

const rows2 = await page.$$('.cloud-file-row');
for (const row of rows2) {
  const name = await row.$eval('.cloud-file-name', el => el.textContent);
  if (name === 'test-cloud-save.dxf') {
    await row.dblclick();
    break;
  }
}
await page.waitForTimeout(3000);
const count2 = await page.evaluate(() => window.__store.entities.length);
console.log('Re-opened entities:', count2);
console.log('Test 3:', count2 > 0 ? 'PASS' : 'FAIL');

// Cleanup
if (saved) {
  await page.evaluate(async (id) => {
    await fetch('http://localhost:3002/api/cloud/delete/' + id, { method: 'DELETE' });
  }, saved.id);
  console.log('\nCleaned up test file');
}

await browser.close();
console.log('\nDone.');
