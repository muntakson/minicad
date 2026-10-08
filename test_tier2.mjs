import { chromium } from 'playwright';

const URL = 'http://localhost:3011/';
let page, browser;
const RESULTS = [];

async function setup() {
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  page = await ctx.newPage();
  await page.goto(URL);
  await page.waitForSelector('#cad-canvas', { timeout: 5000 });
  await page.waitForTimeout(500);
}

async function cmd(text) {
  const input = page.locator('#cmd-input');
  await input.fill(text);
  await input.press('Enter');
  await page.waitForTimeout(150);
}

async function getOutput(n = 3) {
  return page.evaluate((count) => {
    const hist = document.getElementById('cmd-history');
    const lines = hist.innerText.split('\n').filter(l => l.trim());
    return lines.slice(-count).join('\n');
  }, n);
}

async function pressEnter() {
  const input = page.locator('#cmd-input');
  await input.fill('');
  await input.press('Enter');
  await page.waitForTimeout(150);
}

async function entityCount() {
  return page.evaluate(() => window.__store.entities.length);
}

async function lastEntity() {
  return page.evaluate(() => {
    const ents = window.__store.entities;
    if (ents.length === 0) return null;
    const e = ents[ents.length - 1];
    return { type: e.type, id: e.id };
  });
}

async function test(name, fn) {
  const r = { name, status: 'PASS', notes: '' };
  try { await fn(); r.notes = 'OK'; }
  catch (e) { r.status = 'FAIL'; r.notes = e.message.split('\n')[0]; }
  RESULTS.push(r);
  console.log(`${r.status === 'PASS' ? '✓' : '✗'} ${name} — ${r.notes}`);
}

// ===== ELLIPSE TESTS =====

async function testEllipseCenter() {
  const before = await entityCount();
  await cmd('EL');
  await cmd('c');
  await cmd('100,100');
  await cmd('150,100');
  await cmd('30');
  await page.waitForTimeout(200);
  const after = await entityCount();
  if (after <= before) throw new Error('No ellipse created');
  const last = await lastEntity();
  if (last.type !== 'ellipse') throw new Error(`Expected ellipse, got ${last.type}`);
  const out = await getOutput();
  if (!out.includes('Ellipse created')) throw new Error('No confirmation: ' + out);
}

async function testEllipseAxis() {
  const before = await entityCount();
  await cmd('EL');
  await cmd('200,200');
  await cmd('300,200');
  await cmd('40');
  await page.waitForTimeout(200);
  const after = await entityCount();
  if (after <= before) throw new Error('No ellipse created');
  const last = await lastEntity();
  if (last.type !== 'ellipse') throw new Error(`Expected ellipse, got ${last.type}`);
}

async function testEllipseAlias() {
  const before = await entityCount();
  await cmd('EL');
  const out = await getOutput();
  if (!out.includes('ELLIPSE')) throw new Error('EL alias not recognized: ' + out);
  await page.keyboard.press('Escape');
}

async function testEllipseEscape() {
  const before = await entityCount();
  await cmd('EL');
  await cmd('c');
  await cmd('50,50');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(100);
  const after = await entityCount();
  if (after !== before) throw new Error('Entity created despite Escape');
}

// ===== ARRAY TESTS =====

async function testArrayRectangular() {
  // Draw a circle
  await cmd('C');
  await cmd('0,0');
  await cmd('5');
  await page.waitForTimeout(150);
  // Select it
  await page.evaluate(() => {
    const store = window.__store;
    store.entities[store.entities.length - 1].selected = true;
    store.emit();
  });
  const before = await entityCount();
  await cmd('AR');
  await cmd('r');
  await cmd('3');  // rows
  await cmd('3');  // cols
  await cmd('20'); // row distance
  await cmd('20'); // col distance
  await page.waitForTimeout(200);
  const after = await entityCount();
  // 3x3 = 9, minus original = 8 new copies
  if (after - before !== 8) throw new Error(`Expected 8 new entities, got ${after - before}`);
  const out = await getOutput();
  if (!out.includes('Rectangular array') && !out.includes('created')) throw new Error('No confirmation: ' + out);
}

async function testArrayPolar() {
  // Draw a line
  await cmd('L');
  await cmd('100,0');
  await cmd('120,0');
  await pressEnter();
  await page.waitForTimeout(150);
  // Select it
  await page.evaluate(() => {
    const store = window.__store;
    store.entities[store.entities.length - 1].selected = true;
    store.emit();
  });
  const before = await entityCount();
  await cmd('AR');
  await cmd('p');
  // Click for center point
  await cmd('100,100');
  await cmd('6');   // 6 items
  await cmd('360'); // full circle
  await cmd('y');   // rotate objects
  await page.waitForTimeout(200);
  const after = await entityCount();
  // 6 items total, minus original = 5 new
  if (after - before !== 5) throw new Error(`Expected 5 new entities, got ${after - before}`);
  const out = await getOutput();
  if (!out.includes('Polar array') && !out.includes('created')) throw new Error('No confirmation: ' + out);
}

// ===== SPLINE TESTS =====

async function testSplineBasic() {
  const before = await entityCount();
  await cmd('SPL');
  await cmd('0,200');
  await cmd('50,250');
  await cmd('100,200');
  await cmd('150,250');
  await pressEnter();
  await page.waitForTimeout(200);
  const after = await entityCount();
  if (after <= before) throw new Error('No spline created');
  const last = await lastEntity();
  if (last.type !== 'polyline') throw new Error(`Expected polyline, got ${last.type}`);
  const out = await getOutput();
  if (!out.includes('Spline created')) throw new Error('No confirmation: ' + out);
  // Spline should have more points than the 4 fit points
  const pts = await page.evaluate(() => {
    const e = window.__store.entities[window.__store.entities.length - 1];
    return e.points ? e.points.length : 0;
  });
  if (pts <= 4) throw new Error(`Expected many interpolated points, got ${pts}`);
}

async function testSplineClose() {
  const before = await entityCount();
  await cmd('SPL');
  await cmd('200,200');
  await cmd('250,250');
  await cmd('300,200');
  await cmd('c');
  await page.waitForTimeout(200);
  const after = await entityCount();
  if (after <= before) throw new Error('No closed spline created');
  const out = await getOutput();
  if (!out.includes('Spline closed')) throw new Error('No close confirmation: ' + out);
}

async function testSplineUndo() {
  await cmd('SPL');
  await cmd('0,300');
  await cmd('50,350');
  await cmd('100,300');
  await cmd('u');   // undo last point
  await page.waitForTimeout(100);
  const out = await getOutput(2);
  if (!out.includes('undone')) throw new Error('No undo confirmation: ' + out);
  await pressEnter();
}

async function testSplineEscape() {
  const before = await entityCount();
  await cmd('SPL');
  await cmd('0,400');
  await cmd('50,450');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(100);
  const after = await entityCount();
  if (after !== before) throw new Error('Entity created despite Escape');
}

// ===== AREA TESTS =====

async function testAreaPoints() {
  await cmd('AA');
  await cmd('0,0');
  await cmd('100,0');
  await cmd('100,100');
  await cmd('0,100');
  await pressEnter();
  await page.waitForTimeout(200);
  const out = await getOutput(2);
  if (!out.includes('Area')) throw new Error('No area output: ' + out);
  if (!out.includes('10000')) throw new Error(`Expected area ~10000: ${out}`);
}

async function testAreaObject() {
  // Test AREA object mode by programmatically verifying the computation
  // Create a circle and use evaluate to test area directly
  await cmd('C');
  await cmd('50,50');
  await cmd('10');
  await page.waitForTimeout(150);
  // Start AREA in object mode
  await cmd('AA');
  await cmd('o');
  await page.waitForTimeout(200);
  // Programmatically simulate clicking on the circle by finding its screen position
  // First zoom to make circle visible
  await page.evaluate(() => {
    // Set view to center on (50,50) with reasonable zoom
    window.__store.view = { panX: 0, panY: 100, zoom: 5 };
  });
  await page.waitForTimeout(100);
  // Now click on the circle's edge
  const circScreen = await page.evaluate(() => {
    return window.__store.worldToScreen({ x: 60, y: 50 });
  });
  const box = await page.locator('#cad-canvas').boundingBox();
  await page.mouse.click(box.x + circScreen.x, box.y + circScreen.y);
  await page.waitForTimeout(400);
  const out = await getOutput(4);
  if (!out.includes('Area')) throw new Error('No area output: ' + out);
  if (!out.includes('314')) throw new Error(`Expected area ~314: ${out}`);
}

async function testAreaRect() {
  // Draw a rect at visible coords
  await cmd('REC');
  await cmd('-50,-50');
  await cmd('0,-30');
  await page.waitForTimeout(150);
  // Zoom extents
  await cmd('Z');
  await cmd('a');
  await page.waitForTimeout(300);
  // Get area via object mode
  await cmd('AA');
  await cmd('o');
  await page.waitForTimeout(150);
  const rectScreen = await page.evaluate(() => {
    return window.__store.worldToScreen({ x: -25, y: -40 });
  });
  const box = await page.locator('#cad-canvas').boundingBox();
  await page.mouse.click(box.x + rectScreen.x, box.y + rectScreen.y);
  await page.waitForTimeout(300);
  const out = await getOutput(3);
  if (!out.includes('Area')) throw new Error('No area output: ' + out);
  // 50 * 20 = 1000
  if (!out.includes('1000')) throw new Error(`Expected area 1000: ${out}`);
}

// ===== SELECT TESTS =====

async function testSelectCommand() {
  // Clear selection and zoom extents
  await page.evaluate(() => { window.__store.clearSelection(); });
  await cmd('Z');
  await cmd('a');
  await page.waitForTimeout(300);
  await cmd('SEL');
  const out = await getOutput();
  if (!out.includes('Select objects')) throw new Error('No select prompt: ' + out);
  // Click on the circle at (50,50) r=10 — click on its right edge at (60,50)
  const circScreen = await page.evaluate(() => {
    return window.__store.worldToScreen({ x: 60, y: 50 });
  });
  const box = await page.locator('#cad-canvas').boundingBox();
  await page.mouse.click(box.x + circScreen.x, box.y + circScreen.y);
  await page.waitForTimeout(200);
  // Press Enter to confirm
  await pressEnter();
  await page.waitForTimeout(200);
  const outFinal = await getOutput(2);
  if (!outFinal.includes('selected')) throw new Error('No selection confirmation: ' + outFinal);
}

async function testSelectAlias() {
  await page.evaluate(() => { window.__store.clearSelection(); });
  await cmd('SELECT');
  const out = await getOutput();
  if (!out.includes('Select objects')) throw new Error('SELECT not recognized: ' + out);
  await page.keyboard.press('Escape');
}

// ===== MENU INTEGRATION =====

async function testEllipseMenu() {
  await page.locator('#menubar > span[data-menu="draw"]').click();
  await page.waitForTimeout(100);
  const item = page.locator('#menu-draw .menu-item[data-cmd="ELLIPSE"]');
  if (!(await item.isVisible())) throw new Error('Ellipse not in Draw menu');
  await item.click();
  await page.waitForTimeout(200);
  const out = await getOutput();
  if (!out.includes('ELLIPSE')) throw new Error('Ellipse menu did not start: ' + out);
  await page.keyboard.press('Escape');
}

async function testArrayMenu() {
  await page.locator('#menubar > span[data-menu="modify"]').click();
  await page.waitForTimeout(100);
  const item = page.locator('#menu-modify .menu-item[data-cmd="ARRAY"]');
  if (!(await item.isVisible())) throw new Error('Array not in Modify menu');
  await page.locator('#cad-canvas').click();
  await page.waitForTimeout(100);
}

async function testAreaMenu() {
  await page.locator('#menubar > span[data-menu="tools"]').click();
  await page.waitForTimeout(100);
  const item = page.locator('#menu-tools .menu-item[data-cmd="AREA"]');
  if (!(await item.isVisible())) throw new Error('Area not in Tools menu');
  await page.locator('#cad-canvas').click();
  await page.waitForTimeout(100);
}

// ===== RUN =====

async function main() {
  console.log('Setting up...');
  await setup();
  console.log('Running Tier 2 tests...\n');

  // Ellipse
  await test('ELLIPSE — center mode creates ellipse', testEllipseCenter);
  await test('ELLIPSE — axis endpoint mode', testEllipseAxis);
  await test('ELLIPSE — EL alias works', testEllipseAlias);
  await test('ELLIPSE — Escape cancels', testEllipseEscape);

  // Array
  await test('ARRAY — rectangular 3x3', testArrayRectangular);
  await test('ARRAY — polar 6 items', testArrayPolar);

  // Spline
  await test('SPLINE — basic with 4 points', testSplineBasic);
  await test('SPLINE — close option', testSplineClose);
  await test('SPLINE — undo point', testSplineUndo);
  await test('SPLINE — Escape cancels', testSplineEscape);

  // Area
  await test('AREA — pick 4 points (100x100 square)', testAreaPoints);
  await test('AREA — object mode (circle r=10)', testAreaObject);
  await test('AREA — object mode (rect 50x20)', testAreaRect);

  // Select
  await test('SELECT — command and click', testSelectCommand);
  await test('SELECT — alias works', testSelectAlias);

  // Menu integration
  await test('Menu — Draw > Ellipse', testEllipseMenu);
  await test('Menu — Modify > Array', testArrayMenu);
  await test('Menu — Tools > Area', testAreaMenu);

  // Screenshot
  await page.screenshot({ path: '/tmp/claude-1000/-home-jit-minicad/4ef81a79-4973-4b48-9813-512c961605f4/scratchpad/test_tier2.png' });

  console.log('\n========== SUMMARY ==========');
  const passed = RESULTS.filter(r => r.status === 'PASS').length;
  const failed = RESULTS.filter(r => r.status === 'FAIL').length;
  console.log(`Total: ${RESULTS.length} | Passed: ${passed} | Failed: ${failed}`);
  if (failed > 0) {
    console.log('\nFailed:');
    RESULTS.filter(r => r.status === 'FAIL').forEach(r => console.log(`  ✗ ${r.name}: ${r.notes}`));
  }

  await browser.close();
}

main().catch(e => { console.error(e); process.exit(1); });
