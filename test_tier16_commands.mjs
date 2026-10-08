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

async function resetStore() {
  await page.evaluate(() => {
    const s = window.__store;
    s.entities = [];
    s.layers = [{ name: '0', color: '#ffffff', visible: true, locked: false, frozen: false, current: true, lineweight: 1 }];
    s.hiddenEntityIds.clear();
    s.isolatedLayers = [];
    s.currentColor = 'bylayer';
    s.emit();
  });
}

// ============================================================
// LAYOFF
// ============================================================
async function testLAYOFF() {
  console.log('\n=== LAYOFF ===');
  await resetStore();
  await pressEsc();

  const hasCmd = await page.evaluate(() => window.__engine.commands.has('LAYOFF'));
  test('LAYOFF registered', hasCmd);

  // Create a second layer and add entity to it
  await page.evaluate(() => {
    const s = window.__store;
    s.layers.push({ name: 'Test', color: '#ff0000', visible: true, locked: false, frozen: false, current: false, lineweight: 1 });
    s.entities.push({
      id: 'lo1', type: 'line', layer: 'Test', color: 'bylayer',
      lineweight: 1, linetype: 'continuous', visible: true, selected: false,
      start: { x: 0, y: 0 }, end: { x: 10, y: 10 },
    });
    s.emit();
  });

  // Turn off the Test layer
  await cmd('LAYOFF');
  await page.waitForTimeout(100);
  await cmd('Test');
  await page.waitForTimeout(200);

  const result = await page.evaluate(() => {
    const layer = window.__store.layers.find(l => l.name === 'Test');
    return { visible: layer?.visible };
  });
  test('LAYOFF turns off layer', result.visible === false);

  const output = await getOutput(3);
  test('LAYOFF shows message', output.includes('turned off'), output.split('\n').pop());

  // Cannot turn off current layer
  await cmd('LAYOFF');
  await page.waitForTimeout(100);
  await cmd('0');
  await page.waitForTimeout(200);
  const output2 = await getOutput(3);
  test('LAYOFF prevents current layer', output2.includes('Cannot turn off current layer'));

  // Undo not applicable for visibility toggle (no pushUndo), but test it doesn't crash
  await pressEsc();
}

// ============================================================
// LAYON
// ============================================================
async function testLAYON() {
  console.log('\n=== LAYON ===');
  await pressEsc();

  const hasCmd = await page.evaluate(() => window.__engine.commands.has('LAYON'));
  test('LAYON registered', hasCmd);

  // Ensure Test layer is still off from previous test
  await page.evaluate(() => {
    const s = window.__store;
    // Make sure we have a hidden layer
    const test = s.layers.find(l => l.name === 'Test');
    if (test) test.visible = false;
    else s.layers.push({ name: 'Test', color: '#ff0000', visible: false, locked: false, frozen: false, current: false, lineweight: 1 });
    s.emit();
  });

  await cmd('LAYON');
  await page.waitForTimeout(200);

  const result = await page.evaluate(() => {
    return window.__store.layers.every(l => l.visible);
  });
  test('LAYON turns on all layers', result);

  const output = await getOutput(3);
  test('LAYON shows count', output.includes('layer(s) turned on'), output.split('\n').pop());
}

// ============================================================
// LAYFRZ
// ============================================================
async function testLAYFRZ() {
  console.log('\n=== LAYFRZ ===');
  await resetStore();
  await pressEsc();

  const hasCmd = await page.evaluate(() => window.__engine.commands.has('LAYFRZ'));
  test('LAYFRZ registered', hasCmd);

  // Create a second layer
  await page.evaluate(() => {
    const s = window.__store;
    s.layers.push({ name: 'Frozen', color: '#00ff00', visible: true, locked: false, frozen: false, current: false, lineweight: 1 });
    s.emit();
  });

  await cmd('LAYFRZ');
  await page.waitForTimeout(100);
  await cmd('Frozen');
  await page.waitForTimeout(200);

  const result = await page.evaluate(() => {
    const layer = window.__store.layers.find(l => l.name === 'Frozen');
    return { frozen: layer?.frozen };
  });
  test('LAYFRZ freezes layer', result.frozen === true);

  const output = await getOutput(3);
  test('LAYFRZ shows message', output.includes('frozen'), output.split('\n').pop());

  // Cannot freeze current layer
  await cmd('LAYFRZ');
  await page.waitForTimeout(100);
  await cmd('0');
  await page.waitForTimeout(200);
  const output2 = await getOutput(3);
  test('LAYFRZ prevents current layer', output2.includes('Cannot freeze current layer'));
}

// ============================================================
// LAYTHW
// ============================================================
async function testLAYTHW() {
  console.log('\n=== LAYTHW ===');
  await pressEsc();

  const hasCmd = await page.evaluate(() => window.__engine.commands.has('LAYTHW'));
  test('LAYTHW registered', hasCmd);

  // Freeze a layer first
  await page.evaluate(() => {
    const s = window.__store;
    const layer = s.layers.find(l => l.name === 'Frozen');
    if (layer) layer.frozen = true;
    s.emit();
  });

  await cmd('LAYTHW');
  await page.waitForTimeout(200);

  const result = await page.evaluate(() => {
    return window.__store.layers.every(l => !l.frozen);
  });
  test('LAYTHW thaws all layers', result);

  const output = await getOutput(3);
  test('LAYTHW shows count', output.includes('layer(s) thawed'), output.split('\n').pop());
}

// ============================================================
// LAYLCK
// ============================================================
async function testLAYLCK() {
  console.log('\n=== LAYLCK ===');
  await resetStore();
  await pressEsc();

  const hasCmd = await page.evaluate(() => window.__engine.commands.has('LAYLCK'));
  test('LAYLCK registered', hasCmd);

  // Create layer to lock
  await page.evaluate(() => {
    const s = window.__store;
    s.layers.push({ name: 'LockMe', color: '#0000ff', visible: true, locked: false, frozen: false, current: false, lineweight: 1 });
    s.emit();
  });

  await cmd('LAYLCK');
  await page.waitForTimeout(100);
  await cmd('LockMe');
  await page.waitForTimeout(200);

  const result = await page.evaluate(() => {
    const layer = window.__store.layers.find(l => l.name === 'LockMe');
    return { locked: layer?.locked };
  });
  test('LAYLCK locks layer', result.locked === true);

  const output = await getOutput(3);
  test('LAYLCK shows message', output.includes('locked'), output.split('\n').pop());
}

// ============================================================
// LAYULK
// ============================================================
async function testLAYULK() {
  console.log('\n=== LAYULK ===');
  await pressEsc();

  const hasCmd = await page.evaluate(() => window.__engine.commands.has('LAYULK'));
  test('LAYULK registered', hasCmd);

  // Lock a layer first
  await page.evaluate(() => {
    const s = window.__store;
    const layer = s.layers.find(l => l.name === 'LockMe');
    if (layer) layer.locked = true;
    s.emit();
  });

  await cmd('LAYULK');
  await page.waitForTimeout(100);
  await cmd('LockMe');
  await page.waitForTimeout(200);

  const result = await page.evaluate(() => {
    const layer = window.__store.layers.find(l => l.name === 'LockMe');
    return { locked: layer?.locked };
  });
  test('LAYULK unlocks layer', result.locked === false);

  const output = await getOutput(3);
  test('LAYULK shows message', output.includes('unlocked'), output.split('\n').pop());
}

// ============================================================
// LAYDEL
// ============================================================
async function testLAYDEL() {
  console.log('\n=== LAYDEL ===');
  await resetStore();
  await pressEsc();

  const hasCmd = await page.evaluate(() => window.__engine.commands.has('LAYDEL'));
  test('LAYDEL registered', hasCmd);

  // Create layer with entities
  await page.evaluate(() => {
    const s = window.__store;
    s.layers.push({ name: 'DeleteMe', color: '#ff00ff', visible: true, locked: false, frozen: false, current: false, lineweight: 1 });
    s.entities.push(
      { id: 'del1', type: 'line', layer: 'DeleteMe', color: 'bylayer', lineweight: 1, linetype: 'continuous', visible: true, selected: false, start: { x: 0, y: 0 }, end: { x: 5, y: 5 } },
      { id: 'del2', type: 'line', layer: 'DeleteMe', color: 'bylayer', lineweight: 1, linetype: 'continuous', visible: true, selected: false, start: { x: 5, y: 5 }, end: { x: 10, y: 0 } },
      { id: 'keep1', type: 'line', layer: '0', color: 'bylayer', lineweight: 1, linetype: 'continuous', visible: true, selected: false, start: { x: 0, y: 0 }, end: { x: 20, y: 20 } },
    );
    s.emit();
  });

  await cmd('LAYDEL');
  await page.waitForTimeout(100);
  await cmd('DeleteMe');
  await page.waitForTimeout(300);

  const result = await page.evaluate(() => {
    const s = window.__store;
    return {
      entityCount: s.entities.length,
      layerExists: s.layers.some(l => l.name === 'DeleteMe'),
      keepExists: s.entities.some(e => e.id === 'keep1'),
    };
  });
  test('LAYDEL removes entities', result.entityCount === 1, `count=${result.entityCount}`);
  test('LAYDEL removes layer', !result.layerExists);
  test('LAYDEL keeps other entities', result.keepExists);

  const output = await getOutput(3);
  test('LAYDEL shows message', output.includes('deleted'), output.split('\n').pop());

  // Cannot delete layer 0
  await cmd('LAYDEL');
  await page.waitForTimeout(100);
  await cmd('0');
  await page.waitForTimeout(200);
  const output2 = await getOutput(3);
  test('LAYDEL prevents layer 0', output2.includes('Cannot delete layer 0'));

  // Undo restores
  await cmd('UNDO');
  await page.waitForTimeout(200);
  const undoResult = await page.evaluate(() => {
    const s = window.__store;
    return {
      entityCount: s.entities.length,
      layerExists: s.layers.some(l => l.name === 'DeleteMe'),
    };
  });
  test('LAYDEL undo restores entities', undoResult.entityCount === 3, `count=${undoResult.entityCount}`);
}

// ============================================================
// LAYMRG
// ============================================================
async function testLAYMRG() {
  console.log('\n=== LAYMRG ===');
  await resetStore();
  await pressEsc();

  const hasCmd = await page.evaluate(() => window.__engine.commands.has('LAYMRG'));
  test('LAYMRG registered', hasCmd);

  // Create two layers with entities
  await page.evaluate(() => {
    const s = window.__store;
    s.layers.push(
      { name: 'Source', color: '#ff0000', visible: true, locked: false, frozen: false, current: false, lineweight: 1 },
      { name: 'Target', color: '#00ff00', visible: true, locked: false, frozen: false, current: false, lineweight: 1 },
    );
    s.entities.push(
      { id: 'mrg1', type: 'line', layer: 'Source', color: 'bylayer', lineweight: 1, linetype: 'continuous', visible: true, selected: false, start: { x: 0, y: 0 }, end: { x: 5, y: 5 } },
      { id: 'mrg2', type: 'line', layer: 'Source', color: 'bylayer', lineweight: 1, linetype: 'continuous', visible: true, selected: false, start: { x: 5, y: 5 }, end: { x: 10, y: 0 } },
      { id: 'mrg3', type: 'line', layer: 'Target', color: 'bylayer', lineweight: 1, linetype: 'continuous', visible: true, selected: false, start: { x: 20, y: 20 }, end: { x: 30, y: 30 } },
    );
    s.emit();
  });

  await cmd('LAYMRG');
  await page.waitForTimeout(100);
  await cmd('Source');
  await page.waitForTimeout(200);
  await cmd('Target');
  await page.waitForTimeout(300);

  const result = await page.evaluate(() => {
    const s = window.__store;
    return {
      entityCount: s.entities.length,
      sourceExists: s.layers.some(l => l.name === 'Source'),
      targetEntities: s.entities.filter(e => e.layer === 'Target').length,
    };
  });
  test('LAYMRG keeps all entities', result.entityCount === 3, `count=${result.entityCount}`);
  test('LAYMRG removes source layer', !result.sourceExists);
  test('LAYMRG moves entities to target', result.targetEntities === 3, `on target=${result.targetEntities}`);

  const output = await getOutput(3);
  test('LAYMRG shows message', output.includes('Merged'), output.split('\n').pop());

  // Cannot merge layer 0
  await pressEsc();
  await cmd('LAYMRG');
  await page.waitForTimeout(100);
  await cmd('0');
  await page.waitForTimeout(200);
  const output2 = await getOutput(3);
  test('LAYMRG prevents layer 0', output2.includes('Cannot merge layer 0'));

  // Undo restores entities (undo only snapshots entities, not layers)
  await pressEsc();
  await cmd('UNDO');
  await page.waitForTimeout(200);
  const undoResult = await page.evaluate(() => {
    const s = window.__store;
    return {
      sourceEntities: s.entities.filter(e => e.layer === 'Source').length,
      targetEntities: s.entities.filter(e => e.layer === 'Target').length,
    };
  });
  test('LAYMRG undo restores entities', undoResult.sourceEntities === 2, `source=${undoResult.sourceEntities}, target=${undoResult.targetEntities}`);
}

// ============================================================
// XPLODE
// ============================================================
async function testXPLODE() {
  console.log('\n=== XPLODE ===');
  await resetStore();
  await pressEsc();

  const hasCmd = await page.evaluate(() => window.__engine.commands.has('XPLODE'));
  test('XPLODE registered', hasCmd);

  const hasAlias = await page.evaluate(() => {
    const def = window.__engine.commands.get('XPLODE');
    return def && def.aliases.includes('XP');
  });
  test('XP alias', hasAlias);

  // Test with a polyline (3 segments)
  await page.evaluate(() => {
    const s = window.__store;
    s.entities = [];
    s.entities.push({
      id: 'xp1', type: 'polyline', layer: '0', color: '#ff0000',
      lineweight: 2, linetype: 'continuous', visible: true, selected: true,
      points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }],
      closed: false,
    });
    s.emit();
  });

  // XPLODE with Color inheritance
  await cmd('XPLODE');
  await page.waitForTimeout(200);
  await cmd('c');
  await page.waitForTimeout(300);

  const result = await page.evaluate(() => {
    const s = window.__store;
    const lines = s.entities.filter(e => e.type === 'line');
    return {
      total: s.entities.length,
      lineCount: lines.length,
      hasPolyline: s.entities.some(e => e.type === 'polyline'),
      firstColor: lines[0]?.color,
    };
  });
  test('XPLODE creates lines from polyline', result.lineCount === 3, `lines=${result.lineCount}`);
  test('XPLODE removes original', !result.hasPolyline);
  test('XPLODE inherits color', result.firstColor === '#ff0000', `color=${result.firstColor}`);

  const output = await getOutput(3);
  test('XPLODE shows message', output.includes('exploded'), output.split('\n').pop());

  // Test with a rect
  await page.evaluate(() => {
    const s = window.__store;
    s.entities = [];
    s.entities.push({
      id: 'xp2', type: 'rect', layer: '0', color: 'bylayer',
      lineweight: 1, linetype: 'continuous', visible: true, selected: true,
      corner1: { x: 0, y: 0 }, corner2: { x: 10, y: 10 },
    });
    s.emit();
  });

  await cmd('XPLODE');
  await page.waitForTimeout(200);
  await cmd('a');
  await page.waitForTimeout(300);

  const rectResult = await page.evaluate(() => {
    const s = window.__store;
    return {
      lineCount: s.entities.filter(e => e.type === 'line').length,
      hasRect: s.entities.some(e => e.type === 'rect'),
    };
  });
  test('XPLODE rect to 4 lines', rectResult.lineCount === 4, `lines=${rectResult.lineCount}`);
  test('XPLODE removes rect', !rectResult.hasRect);

  // Undo
  await cmd('UNDO');
  await page.waitForTimeout(200);
  const undoResult = await page.evaluate(() => {
    return {
      hasRect: window.__store.entities.some(e => e.type === 'rect'),
      lineCount: window.__store.entities.filter(e => e.type === 'line').length,
    };
  });
  test('XPLODE undo restores', undoResult.hasRect && undoResult.lineCount === 0);

  // No explodable objects
  await page.evaluate(() => {
    const s = window.__store;
    s.entities = [];
    s.entities.push({
      id: 'xp3', type: 'line', layer: '0', color: 'bylayer',
      lineweight: 1, linetype: 'continuous', visible: true, selected: true,
      start: { x: 0, y: 0 }, end: { x: 10, y: 10 },
    });
    s.emit();
  });
  await cmd('XPLODE');
  await page.waitForTimeout(300);
  const noOutput = await getOutput(3);
  test('XPLODE no explodable message', noOutput.includes('No explodable'));
}

// ============================================================
// ARRAYPATH
// ============================================================
async function testARRAYPATH() {
  console.log('\n=== ARRAYPATH ===');
  await resetStore();
  await pressEsc();

  const hasCmd = await page.evaluate(() => window.__engine.commands.has('ARRAYPATH'));
  test('ARRAYPATH registered', hasCmd);

  // Create a small circle to array and a line as path
  await page.evaluate(() => {
    const s = window.__store;
    s.entities = [];
    s.entities.push(
      {
        id: 'apc1', type: 'circle', layer: '0', color: 'bylayer',
        lineweight: 1, linetype: 'continuous', visible: true, selected: true,
        center: { x: 0, y: 0 }, radius: 2,
      },
      {
        id: 'path1', type: 'line', layer: '0', color: 'bylayer',
        lineweight: 1, linetype: 'continuous', visible: true, selected: false,
        start: { x: 0, y: 0 }, end: { x: 100, y: 0 },
      },
    );
    s.emit();
  });

  // Run ARRAYPATH: select path at midpoint of line, then 5 items
  await cmd('ARRAYPATH');
  await page.waitForTimeout(200);
  // Click on the path line (coordinate on the line)
  await cmd('50,0');
  await page.waitForTimeout(200);
  // Enter count
  await cmd('5');
  await page.waitForTimeout(300);

  const result = await page.evaluate(() => {
    const s = window.__store;
    const circles = s.entities.filter(e => e.type === 'circle');
    return {
      totalEntities: s.entities.length,
      circleCount: circles.length,
    };
  });
  // 5 copies of the circle + original path line + original circle still there?
  // Actually ARRAYPATH creates count copies (including first position), the original is kept
  // So: 1 original circle + 1 path line + 5 array copies = 7
  test('ARRAYPATH creates copies', result.circleCount >= 5, `circles=${result.circleCount}`);

  const output = await getOutput(3);
  test('ARRAYPATH shows message', output.includes('entities created along path'), output.split('\n').pop());

  // Undo
  await cmd('UNDO');
  await page.waitForTimeout(200);
  const undoResult = await page.evaluate(() => {
    return { circleCount: window.__store.entities.filter(e => e.type === 'circle').length };
  });
  test('ARRAYPATH undo restores', undoResult.circleCount <= 2, `circles=${undoResult.circleCount}`);

  // Test with invalid count
  await page.evaluate(() => {
    const s = window.__store;
    s.entities = [];
    s.entities.push(
      { id: 'apc2', type: 'circle', layer: '0', color: 'bylayer', lineweight: 1, linetype: 'continuous', visible: true, selected: true, center: { x: 0, y: 0 }, radius: 2 },
      { id: 'path2', type: 'line', layer: '0', color: 'bylayer', lineweight: 1, linetype: 'continuous', visible: true, selected: false, start: { x: 0, y: 0 }, end: { x: 50, y: 0 } },
    );
    s.emit();
  });
  await cmd('ARRAYPATH');
  await page.waitForTimeout(200);
  await cmd('25,0');
  await page.waitForTimeout(200);
  await cmd('1');
  await page.waitForTimeout(200);
  const invalidOutput = await getOutput(3);
  test('ARRAYPATH rejects count < 2', invalidOutput.includes('Requires integer'));
}

// ============================================================
// SUMMARY
// ============================================================
async function testSummary() {
  console.log('\n=== SUMMARY ===');

  const total = await page.evaluate(() => window.__engine.commands.size);
  test('Total registered commands', total >= 173, `count=${total}`);

  const newCmds = ['LAYOFF', 'LAYON', 'LAYFRZ', 'LAYTHW', 'LAYLCK', 'LAYULK', 'LAYDEL', 'LAYMRG', 'XPLODE', 'ARRAYPATH'];
  for (const name of newCmds) {
    const exists = await page.evaluate((n) => window.__engine.commands.has(n), name);
    test(`${name} registered`, exists);
  }

  // Alias conflict check
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

  // Frozen field exists on layers
  const hasFrozen = await page.evaluate(() => {
    return 'frozen' in window.__store.layers[0];
  });
  test('Layer has frozen field', hasFrozen);
}

// ============================================================
// MAIN
// ============================================================
async function main() {
  console.log('Tier 16 Commands Test Suite');
  console.log('Commands: LAYOFF, LAYON, LAYFRZ, LAYTHW, LAYLCK, LAYULK, LAYDEL, LAYMRG, XPLODE, ARRAYPATH');

  await setup();

  try {
    await testLAYOFF();
    await testLAYON();
    await testLAYFRZ();
    await testLAYTHW();
    await testLAYLCK();
    await testLAYULK();
    await testLAYDEL();
    await testLAYMRG();
    await testXPLODE();
    await testARRAYPATH();
    await testSummary();
  } catch (e) {
    console.error('Test error:', e);
  }

  await teardown();

  console.log('\n========================================');
  const passed = RESULTS.filter(r => r.passed).length;
  const failed = RESULTS.filter(r => !r.passed).length;
  console.log(`Results: ${passed} passed, ${failed} failed out of ${RESULTS.length}`);
  if (failed > 0) {
    console.log('Failures:');
    RESULTS.filter(r => !r.passed).forEach(r => console.log(`  FAIL: ${r.name} — ${r.detail}`));
  }
  console.log('========================================');
  process.exit(failed > 0 ? 1 : 0);
}

main();
