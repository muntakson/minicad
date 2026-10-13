import { chromium } from 'playwright';

const PORT = process.env.PORT || 3015;
const URL = `http://localhost:${PORT}`;

async function test() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  await page.goto(URL);
  await page.waitForSelector('#cad-canvas');
  await page.waitForTimeout(500);

  let pass = 0, fail = 0;
  function check(label, got, expect) {
    if (got === expect) { console.log(`  ✓ ${label}: ${got}`); pass++; }
    else { console.log(`  ✗ ${label}: got ${JSON.stringify(got)}, expected ${JSON.stringify(expect)}`); fail++; }
  }

  // 1. SHELTER command exists
  console.log('\n--- SHELTER command ---');
  const cmdExists = await page.evaluate(() => window.__engine.commands.has('SHELTER'));
  check('SHELTER registered', cmdExists, true);
  const aliasWorks = await page.evaluate(() => {
    for (const [, def] of window.__engine.commands) {
      if (def.aliases && def.aliases.includes('SHL')) return true;
    }
    return false;
  });
  check('SHL alias exists', aliasWorks, true);

  // 2. SHELTER starts shelter mode after click
  console.log('\n--- SHELTER -> click -> shelter mode ---');
  await page.evaluate(() => window.__engine.handleInput('SHELTER'));
  await page.waitForTimeout(100);

  const canvas = await page.$('#cad-canvas');
  const box = await canvas.boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(200);

  const state1 = await page.evaluate(() => ({
    active: window.__shelterState.active,
    dragging: window.__shelterState.dragging,
  }));
  check('Shelter active after SHELTER + click', state1.active, true);
  check('Shelter dragging', state1.dragging, true);

  // 3. Q = CCW rotation (+15)
  console.log('\n--- Q/E rotation ---');
  await page.keyboard.press('q');
  await page.waitForTimeout(50);
  check('After Q (CCW +15°)', await page.evaluate(() => window.__shelterState.rotation), 15);

  await page.keyboard.press('q');
  await page.waitForTimeout(50);
  check('After Q again (+30°)', await page.evaluate(() => window.__shelterState.rotation), 30);

  await page.keyboard.press('e');
  await page.waitForTimeout(50);
  check('After E (CW -15° -> 15°)', await page.evaluate(() => window.__shelterState.rotation), 15);

  // 4. WASD resize
  console.log('\n--- WASD resize ---');
  await page.keyboard.press('a');
  await page.waitForTimeout(50);
  check('After A (W+)', await page.evaluate(() => window.__shelterState.width), 5.4);

  await page.keyboard.press('d');
  await page.waitForTimeout(50);
  check('After D (W-)', await page.evaluate(() => window.__shelterState.width), 5.3);

  await page.keyboard.press('w');
  await page.waitForTimeout(50);
  check('After W (H+)', await page.evaluate(() => window.__shelterState.height), 6.1);

  await page.keyboard.press('s');
  await page.waitForTimeout(50);
  check('After S (H-)', await page.evaluate(() => window.__shelterState.height), 6);

  // 5. ESC cancels
  console.log('\n--- ESC cancel ---');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(100);
  check('Active after Escape', await page.evaluate(() => window.__shelterState.active), false);

  // 6. SHELTER again — click to place finalizes
  console.log('\n--- Click to place finalizes ---');
  const entsBefore = await page.evaluate(() => window.__store.entities.length);

  await page.evaluate(() => window.__engine.handleInput('SHELTER'));
  await page.waitForTimeout(100);
  // First click sets position and starts shelter
  await page.mouse.click(box.x + 300, box.y + 300);
  await page.waitForTimeout(200);

  check('Shelter active before placement click',
    await page.evaluate(() => window.__shelterState.active), true);

  // Second click places and finalizes
  await page.mouse.click(box.x + 400, box.y + 400);
  await page.waitForTimeout(200);

  check('Shelter active after placement click',
    await page.evaluate(() => window.__shelterState.active), false);

  const entsAfter = await page.evaluate(() => window.__store.entities.length);
  const shelterOnly = await page.evaluate(() =>
    window.__store.entities.filter(e => e.layer === '쉼터').length
  );
  check('Shelter entities (polyline + 4 texts)', shelterOnly, 5);
  console.log(`  Total entities added: ${entsAfter - entsBefore} (includes annotations)`);

  const shelterEnts = await page.evaluate(() =>
    window.__store.entities.filter(e => e.layer === '쉼터').length
  );
  console.log(`  쉼터 layer entities: ${shelterEnts}`);

  console.log(`\n=== ${pass} passed, ${fail} failed ===`);
  await browser.close();
  process.exit(fail > 0 ? 1 : 0);
}

test().catch(e => { console.error('TEST ERROR:', e); process.exit(1); });
