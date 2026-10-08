import { chromium } from 'playwright';

const URL = 'http://localhost:3010/';
const RESULTS = [];
let page, browser;

async function setup() {
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  page = await context.newPage();
  await page.goto(URL);
  await page.waitForSelector('#cad-canvas', { timeout: 5000 });
  await page.waitForTimeout(500);
}

async function teardown() { await browser.close(); }

async function cmd(text) {
  const input = page.locator('#cmd-input');
  await input.fill(text);
  await input.press('Enter');
  await page.waitForTimeout(150);
}

async function getOutput(n = 5) {
  return await page.evaluate((count) => {
    const hist = document.getElementById('cmd-history');
    if (!hist) return '';
    const lines = hist.innerText.split('\n').filter(l => l.trim());
    return lines.slice(-count).join('\n');
  }, n);
}

async function pressEsc() {
  await page.keyboard.press('Escape');
  await page.waitForTimeout(100);
}

function test(name, passed, detail = '') {
  RESULTS.push({ name, passed, detail });
  console.log(`  [${passed ? 'PASS' : 'FAIL'}] ${name}${detail ? ' — ' + detail : ''}`);
}

// ============================================================
// ARRAYPOLAR
// ============================================================
async function testARRAYPOLAR() {
  console.log('\n=== ARRAYPOLAR ===');

  const hasCmd = await page.evaluate(() => window.__engine.commands.has('ARRAYPOLAR'));
  test('ARRAYPOLAR registered', hasCmd);

  await page.evaluate(() => {
    const s = window.__store;
    s.entities = [];
    s.entities.push(
      { id: 'ap1', type: 'line', layer: '0', color: 'bylayer', lineweight: 1, linetype: 'continuous', visible: true, selected: true, start: { x: 100, y: 0 }, end: { x: 120, y: 0 } },
    );
    s.emit();
  });

  await cmd('ARRAYPOLAR');
  await page.waitForTimeout(100);
  await cmd('0,0');      // center
  await page.waitForTimeout(100);
  await cmd('4');        // items
  await page.waitForTimeout(100);
  await cmd('360');      // fill angle
  await page.waitForTimeout(300);

  const result = await page.evaluate(() => ({
    total: window.__store.entities.length,
    lineCount: window.__store.entities.filter(e => e.type === 'line').length,
  }));
  test('ARRAYPOLAR creates copies', result.total === 4, `total=${result.total}`);
  test('ARRAYPOLAR all lines', result.lineCount === 4, `lines=${result.lineCount}`);

  const output = await getOutput(3);
  test('ARRAYPOLAR message', output.includes('3') || output.includes('array') || output.includes('ARRAYPOLAR'),
    output.split('\n').pop());

  await page.evaluate(() => { window.__store.entities = []; window.__store.emit(); });
  await pressEsc();
}

// ============================================================
// ARRAYRECT
// ============================================================
async function testARRAYRECT() {
  console.log('\n=== ARRAYRECT ===');

  const hasCmd = await page.evaluate(() => window.__engine.commands.has('ARRAYRECT'));
  test('ARRAYRECT registered', hasCmd);

  await page.evaluate(() => {
    const s = window.__store;
    s.entities = [];
    s.entities.push(
      { id: 'ar1', type: 'circle', layer: '0', color: 'bylayer', lineweight: 1, linetype: 'continuous', visible: true, selected: true, center: { x: 0, y: 0 }, radius: 5 },
    );
    s.emit();
  });

  await cmd('ARRAYRECT');
  await page.waitForTimeout(100);
  await cmd('3');      // cols
  await page.waitForTimeout(100);
  await cmd('2');      // rows
  await page.waitForTimeout(100);
  await cmd('20');     // col spacing
  await page.waitForTimeout(100);
  await cmd('30');     // row spacing
  await page.waitForTimeout(300);

  const result = await page.evaluate(() => ({
    total: window.__store.entities.length,
    circleCount: window.__store.entities.filter(e => e.type === 'circle').length,
  }));
  // 3 cols * 2 rows = 6 total (original + 5 copies)
  test('ARRAYRECT creates 3x2', result.total === 6, `total=${result.total}`);
  test('ARRAYRECT all circles', result.circleCount === 6, `circles=${result.circleCount}`);

  // Verify positions
  const centers = await page.evaluate(() =>
    window.__store.entities.filter(e => e.type === 'circle').map(e => ({ x: Math.round(e.center.x), y: Math.round(e.center.y) }))
  );
  const hasOrigin = centers.some(c => c.x === 0 && c.y === 0);
  const hasOffset = centers.some(c => c.x === 20 && c.y === 0);
  test('ARRAYRECT origin preserved', hasOrigin);
  test('ARRAYRECT offset correct', hasOffset, JSON.stringify(centers.slice(0, 3)));

  await page.evaluate(() => { window.__store.entities = []; window.__store.emit(); });
  await pressEsc();
}

// ============================================================
// CONVERTPOLY
// ============================================================
async function testCONVERTPOLY() {
  console.log('\n=== CONVERTPOLY ===');

  const hasCmd = await page.evaluate(() => window.__engine.commands.has('CONVERTPOLY'));
  test('CONVERTPOLY registered', hasCmd);

  // Setup: 2 lines and 1 arc
  await page.evaluate(() => {
    const s = window.__store;
    s.entities = [];
    s.entities.push(
      { id: 'cv1', type: 'line', layer: '0', color: 'bylayer', lineweight: 1, linetype: 'continuous', visible: true, selected: true, start: { x: 0, y: 0 }, end: { x: 10, y: 10 } },
      { id: 'cv2', type: 'arc', layer: '0', color: 'bylayer', lineweight: 1, linetype: 'continuous', visible: true, selected: true, center: { x: 50, y: 50 }, radius: 20, startAngle: 0, endAngle: 90 },
      { id: 'cv3', type: 'circle', layer: '0', color: 'bylayer', lineweight: 1, linetype: 'continuous', visible: true, selected: true, center: { x: 100, y: 100 }, radius: 10 },
    );
    s.emit();
  });

  await cmd('CONVERTPOLY');
  await page.waitForTimeout(300);

  const result = await page.evaluate(() => {
    const s = window.__store;
    return {
      total: s.entities.length,
      lineCount: s.entities.filter(e => e.type === 'line').length,
      arcCount: s.entities.filter(e => e.type === 'arc').length,
      polyCount: s.entities.filter(e => e.type === 'polyline').length,
      circleCount: s.entities.filter(e => e.type === 'circle').length,
    };
  });
  test('CONVERTPOLY converts lines', result.lineCount === 0, `lines=${result.lineCount}`);
  test('CONVERTPOLY converts arcs', result.arcCount === 0, `arcs=${result.arcCount}`);
  test('CONVERTPOLY creates polylines', result.polyCount >= 2, `polylines=${result.polyCount}`);
  test('CONVERTPOLY skips circles', result.circleCount === 1, `circles=${result.circleCount}`);

  const output = await getOutput(3);
  test('CONVERTPOLY message', output.includes('converted') || output.includes('CONVERTPOLY'),
    output.split('\n').pop());

  await page.evaluate(() => { window.__store.entities = []; window.__store.emit(); });
  await pressEsc();
}

// ============================================================
// TEXTFIT
// ============================================================
async function testTEXTFIT() {
  console.log('\n=== TEXTFIT ===');

  const hasCmd = await page.evaluate(() => window.__engine.commands.has('TEXTFIT'));
  test('TEXTFIT registered', hasCmd);

  await page.evaluate(() => {
    const s = window.__store;
    s.entities = [];
    s.entities.push(
      { id: 'tf1', type: 'text', layer: '0', color: 'bylayer', lineweight: 1, linetype: 'continuous', visible: true, selected: true, position: { x: 10, y: 10 }, text: 'Hello', height: 5, rotation: 0 },
    );
    s.emit();
  });

  await cmd('TEXTFIT');
  await page.waitForTimeout(100);
  await cmd('0,0');     // first point
  await page.waitForTimeout(100);
  await cmd('100,0');   // second point
  await page.waitForTimeout(300);

  const result = await page.evaluate(() => {
    const t = window.__store.entities.find(e => e.type === 'text');
    return t ? { x: t.position.x, y: t.position.y, text: t.text } : null;
  });
  test('TEXTFIT repositions text', result?.x === 0 && result?.y === 0, result ? `pos=(${result.x},${result.y})` : 'not found');

  const output = await getOutput(3);
  test('TEXTFIT message', output.includes('fit') || output.includes('TEXTFIT') || output.includes('text'),
    output.split('\n').pop());

  await page.evaluate(() => { window.__store.entities = []; window.__store.emit(); });
  await pressEsc();
}

// ============================================================
// DIMSPACE
// ============================================================
async function testDIMSPACE() {
  console.log('\n=== DIMSPACE ===');

  const hasCmd = await page.evaluate(() => window.__engine.commands.has('DIMSPACE'));
  test('DIMSPACE registered', hasCmd);

  // Setup 3 dimensions at different Y positions
  await page.evaluate(() => {
    const s = window.__store;
    s.entities = [];
    s.entities.push(
      { id: 'ds1', type: 'dimension', layer: '0', color: 'bylayer', lineweight: 1, linetype: 'continuous', visible: true, selected: true, dimType: 'linear', p1: { x: 0, y: 0 }, p2: { x: 10, y: 0 }, textPos: { x: 5, y: 10 }, textOverride: '10.00' },
      { id: 'ds2', type: 'dimension', layer: '0', color: 'bylayer', lineweight: 1, linetype: 'continuous', visible: true, selected: true, dimType: 'linear', p1: { x: 20, y: 0 }, p2: { x: 30, y: 0 }, textPos: { x: 25, y: 35 }, textOverride: '10.00' },
      { id: 'ds3', type: 'dimension', layer: '0', color: 'bylayer', lineweight: 1, linetype: 'continuous', visible: true, selected: true, dimType: 'linear', p1: { x: 40, y: 0 }, p2: { x: 50, y: 0 }, textPos: { x: 45, y: 60 }, textOverride: '10.00' },
    );
    s.emit();
  });

  await cmd('DIMSPACE');
  await page.waitForTimeout(100);
  await cmd('20');   // spacing
  await page.waitForTimeout(300);

  const yPositions = await page.evaluate(() =>
    window.__store.entities.filter(e => e.type === 'dimension').map(e => e.textPos.y).sort((a, b) => a - b)
  );
  test('DIMSPACE evens spacing', yPositions.length === 3, `dims=${yPositions.length}`);
  // Check spacing is uniform
  if (yPositions.length === 3) {
    const gap1 = Math.round(yPositions[1] - yPositions[0]);
    const gap2 = Math.round(yPositions[2] - yPositions[1]);
    test('DIMSPACE uniform gaps', gap1 === gap2, `gaps=${gap1},${gap2}`);
  }

  const output = await getOutput(3);
  test('DIMSPACE message', output.includes('spaced') || output.includes('DIMSPACE'),
    output.split('\n').pop());

  await page.evaluate(() => { window.__store.entities = []; window.__store.emit(); });
  await pressEsc();
}

// ============================================================
// DIMBREAK
// ============================================================
async function testDIMBREAK() {
  console.log('\n=== DIMBREAK ===');

  const hasCmd = await page.evaluate(() => window.__engine.commands.has('DIMBREAK'));
  test('DIMBREAK registered', hasCmd);

  await page.evaluate(() => {
    const s = window.__store;
    s.entities = [];
    s.entities.push(
      { id: 'db1', type: 'dimension', layer: '0', color: 'bylayer', lineweight: 1, linetype: 'continuous', visible: true, selected: true, dimType: 'linear', p1: { x: 0, y: 0 }, p2: { x: 10, y: 0 }, textPos: { x: 5, y: 10 }, textOverride: '10.00' },
    );
    s.emit();
  });

  await cmd('DIMBREAK');
  await page.waitForTimeout(300);

  const hasBrk = await page.evaluate(() => {
    const d = window.__store.entities.find(e => e.type === 'dimension');
    return d?.dimBreak === true;
  });
  test('DIMBREAK toggles flag', hasBrk);

  const output = await getOutput(3);
  test('DIMBREAK message', output.includes('toggled') || output.includes('DIMBREAK'),
    output.split('\n').pop());

  // Toggle back
  await page.evaluate(() => { window.__store.entities.forEach(e => e.selected = true); window.__store.emit(); });
  await cmd('DIMBREAK');
  await page.waitForTimeout(200);
  const hasBrk2 = await page.evaluate(() => {
    const d = window.__store.entities.find(e => e.type === 'dimension');
    return d?.dimBreak;
  });
  test('DIMBREAK toggles off', hasBrk2 === false);

  await page.evaluate(() => { window.__store.entities = []; window.__store.emit(); });
  await pressEsc();
}

// ============================================================
// WIPEOUT
// ============================================================
async function testWIPEOUT() {
  console.log('\n=== WIPEOUT ===');

  const hasCmd = await page.evaluate(() => window.__engine.commands.has('WIPEOUT'));
  test('WIPEOUT registered', hasCmd);

  await page.evaluate(() => { window.__store.entities = []; window.__store.emit(); });

  await cmd('WIPEOUT');
  await page.waitForTimeout(100);
  await cmd('0,0');
  await page.waitForTimeout(100);
  await cmd('50,30');
  await page.waitForTimeout(300);

  const result = await page.evaluate(() => {
    const rects = window.__store.entities.filter(e => e.type === 'rect');
    const wipeout = rects.find(e => e.wipeout === true);
    return {
      total: window.__store.entities.length,
      rectCount: rects.length,
      isWipeout: !!wipeout,
    };
  });
  test('WIPEOUT creates entity', result.total >= 1, `total=${result.total}`);
  test('WIPEOUT marked', result.isWipeout);

  const output = await getOutput(3);
  test('WIPEOUT message', output.includes('ipeout') || output.includes('created'),
    output.split('\n').pop());

  await page.evaluate(() => { window.__store.entities = []; window.__store.emit(); });
  await pressEsc();
}

// ============================================================
// DBLIST
// ============================================================
async function testDBLIST() {
  console.log('\n=== DBLIST ===');

  const hasCmd = await page.evaluate(() => window.__engine.commands.has('DBLIST'));
  test('DBLIST registered', hasCmd);

  await page.evaluate(() => {
    const s = window.__store;
    s.entities = [];
    s.entities.push(
      { id: 'dl1', type: 'line', layer: '0', color: 'bylayer', lineweight: 1, linetype: 'continuous', visible: true, selected: false, start: { x: 0, y: 0 }, end: { x: 10, y: 10 } },
      { id: 'dl2', type: 'line', layer: '0', color: 'bylayer', lineweight: 1, linetype: 'continuous', visible: true, selected: false, start: { x: 20, y: 20 }, end: { x: 30, y: 30 } },
      { id: 'dl3', type: 'circle', layer: '0', color: 'bylayer', lineweight: 1, linetype: 'continuous', visible: true, selected: false, center: { x: 50, y: 50 }, radius: 10 },
    );
    s.emit();
  });

  await cmd('DBLIST');
  await page.waitForTimeout(300);

  const output = await getOutput(10);
  test('DBLIST shows line count', output.includes('line') || output.includes('LINE'), output.split('\n')[1]);
  test('DBLIST shows circle count', output.includes('circle') || output.includes('CIRCLE'));
  test('DBLIST shows total', output.includes('3') || output.includes('Total'),
    output.split('\n').pop());

  await page.evaluate(() => { window.__store.entities = []; window.__store.emit(); });
  await pressEsc();
}

// ============================================================
// MASSPROP
// ============================================================
async function testMASSPROP() {
  console.log('\n=== MASSPROP ===');

  const hasCmd = await page.evaluate(() => window.__engine.commands.has('MASSPROP'));
  test('MASSPROP registered', hasCmd);

  await page.evaluate(() => {
    const s = window.__store;
    s.entities = [];
    s.entities.push(
      { id: 'mp1', type: 'circle', layer: '0', color: 'bylayer', lineweight: 1, linetype: 'continuous', visible: true, selected: true, center: { x: 0, y: 0 }, radius: 10 },
      { id: 'mp2', type: 'line', layer: '0', color: 'bylayer', lineweight: 1, linetype: 'continuous', visible: true, selected: true, start: { x: 0, y: 0 }, end: { x: 30, y: 40 } },
    );
    s.emit();
  });

  await cmd('MASSPROP');
  await page.waitForTimeout(300);

  const output = await getOutput(10);
  test('MASSPROP shows area', output.includes('area') || output.includes('Area'),
    output.split('\n').find(l => l.toLowerCase().includes('area')) || '');
  test('MASSPROP shows length', output.includes('length') || output.includes('Length'),
    output.split('\n').find(l => l.toLowerCase().includes('length')) || '');

  await page.evaluate(() => { window.__store.entities = []; window.__store.emit(); });
  await pressEsc();
}

// ============================================================
// EXIT
// ============================================================
async function testEXIT() {
  console.log('\n=== EXIT ===');

  const hasCmd = await page.evaluate(() => window.__engine.commands.has('EXIT'));
  test('EXIT registered', hasCmd);

  const hasClose = await page.evaluate(() => {
    const def = window.__engine.commands.get('EXIT');
    return def && def.aliases.includes('CLOSE');
  });
  test('CLOSE alias', hasClose);

  const hasQuit = await page.evaluate(() => {
    const def = window.__engine.commands.get('EXIT');
    return def && def.aliases.includes('QUIT');
  });
  test('QUIT alias', hasQuit);

  // Test cancel path
  await cmd('EXIT');
  await page.waitForTimeout(100);
  await cmd('Cancel');
  await page.waitForTimeout(200);

  const output = await getOutput(3);
  test('EXIT cancel', !output.includes('error'), output.split('\n').pop());

  await pressEsc();
}

// ============================================================
// SUMMARY
// ============================================================
async function testSummary() {
  console.log('\n=== SUMMARY ===');
  const total = await page.evaluate(() => window.__engine.commands.size);
  test('Total registered commands', total === 163, `count=${total}`);

  const newCmds = ['ARRAYPOLAR', 'ARRAYRECT', 'CONVERTPOLY', 'TEXTFIT', 'DIMSPACE', 'DIMBREAK', 'WIPEOUT', 'DBLIST', 'MASSPROP', 'EXIT'];
  for (const name of newCmds) {
    const exists = await page.evaluate((n) => window.__engine.commands.has(n), name);
    test(`${name} registered`, exists);
  }

  const aliases = { CONVERTPLINE: 'CONVERTPOLY', CLOSE: 'EXIT', QUIT: 'EXIT' };
  for (const [alias, cmdName] of Object.entries(aliases)) {
    const works = await page.evaluate(({ a, c }) => {
      const def = window.__engine.commands.get(c);
      return def && def.aliases.includes(a);
    }, { a: alias, c: cmdName });
    test(`Alias ${alias} -> ${cmdName}`, works);
  }

  // No alias conflicts
  const aliasCheck = await page.evaluate(() => {
    const allAliases = new Map();
    let conflicts = [];
    for (const [name, def] of window.__engine.commands) {
      for (const alias of def.aliases) {
        if (allAliases.has(alias)) {
          conflicts.push(`${alias} used by ${allAliases.get(alias)} and ${name}`);
        }
        allAliases.set(alias, name);
      }
    }
    return { conflicts, totalAliases: allAliases.size };
  });
  test('No alias conflicts', aliasCheck.conflicts.length === 0,
    aliasCheck.conflicts.length > 0 ? aliasCheck.conflicts.join('; ') : `${aliasCheck.totalAliases} total aliases`);
}

// ============================================================
async function main() {
  console.log('MiniCAD Tier 15 Commands Audit');
  console.log('='.repeat(50));

  try {
    await setup();
    await testARRAYPOLAR();
    await testARRAYRECT();
    await testCONVERTPOLY();
    await testTEXTFIT();
    await testDIMSPACE();
    await testDIMBREAK();
    await testWIPEOUT();
    await testDBLIST();
    await testMASSPROP();
    await testEXIT();
    await testSummary();

    console.log('\n' + '='.repeat(50));
    const passed = RESULTS.filter(r => r.passed).length;
    const failed = RESULTS.filter(r => !r.passed).length;
    console.log(`Results: ${passed}/${RESULTS.length} passed, ${failed} failed`);
    if (failed > 0) {
      console.log('\nFailed tests:');
      for (const r of RESULTS.filter(r => !r.passed)) {
        console.log(`  FAIL: ${r.name} — ${r.detail}`);
      }
    }
  } catch (err) {
    console.error('Test error:', err);
  } finally {
    await teardown();
  }
}

main();
