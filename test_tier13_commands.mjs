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
// DTEXT
// ============================================================
async function testDTEXT() {
  console.log('\n=== DTEXT ===');

  const hasCmd = await page.evaluate(() => window.__engine.commands.has('DTEXT'));
  test('DTEXT registered', hasCmd);

  // Clean slate
  await page.evaluate(() => { window.__store.entities = []; window.__store.emit(); });

  await cmd('DTEXT');
  await page.waitForTimeout(100);
  await cmd('10,20');
  await page.waitForTimeout(100);
  await cmd('5');  // height
  await page.waitForTimeout(100);
  await cmd('0');  // rotation
  await page.waitForTimeout(100);
  await cmd('Hello');
  await page.waitForTimeout(100);
  await cmd('World');
  await page.waitForTimeout(100);
  await cmd('');   // end
  await page.waitForTimeout(200);

  const result = await page.evaluate(() => {
    const texts = window.__store.entities.filter(e => e.type === 'text');
    return {
      count: texts.length,
      first: texts[0] ? { text: texts[0].text, x: texts[0].position.x, y: texts[0].position.y, h: texts[0].height } : null,
      second: texts[1] ? { text: texts[1].text, x: texts[1].position.x, y: texts[1].position.y } : null,
    };
  });
  test('DTEXT creates 2 texts', result.count === 2, `count=${result.count}`);
  test('DTEXT first text "Hello"', result.first?.text === 'Hello');
  test('DTEXT position (10,20)', result.first?.x === 10 && result.first?.y === 20);
  test('DTEXT height=5', result.first?.h === 5);
  test('DTEXT second text "World"', result.second?.text === 'World');
  test('DTEXT Y advances down', result.second && result.second.y < result.first.y,
    result.second ? `y2=${result.second.y}` : 'no second');

  // Cleanup
  await page.evaluate(() => { window.__store.entities = []; window.__store.emit(); });
  await pressEsc();
}

// ============================================================
// BHATCH
// ============================================================
async function testBHATCH() {
  console.log('\n=== BHATCH ===');

  const hasCmd = await page.evaluate(() => window.__engine.commands.has('BHATCH'));
  test('BHATCH registered', hasCmd);

  const hasAliasBH = await page.evaluate(() => {
    const def = window.__engine.commands.get('BHATCH');
    return def && def.aliases.includes('BH');
  });
  test('BH alias', hasAliasBH);

  // H alias belongs to HATCH, not BHATCH

  // Setup a polyline boundary
  await page.evaluate(() => {
    const s = window.__store;
    s.entities = [];
    s.entities.push({
      id: 'bh1', type: 'polyline', layer: '0', color: 'bylayer', lineweight: 1,
      linetype: 'continuous', visible: true, selected: true, closed: true,
      points: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }],
      bulges: [0, 0, 0, 0],
    });
    s.emit();
  });

  await cmd('BHATCH');
  await page.waitForTimeout(100);
  await cmd('LINE');   // pattern
  await page.waitForTimeout(100);
  await cmd('1');      // scale
  await page.waitForTimeout(100);
  await cmd('0');      // angle
  await page.waitForTimeout(300);

  const result = await page.evaluate(() => {
    const hatches = window.__store.entities.filter(e => e.type === 'hatch');
    return {
      hatchCount: hatches.length,
      pattern: hatches[0]?.patternName,
      boundaries: hatches[0]?.boundaries?.length,
      pointCount: hatches[0]?.boundaries?.[0]?.length,
    };
  });
  test('BHATCH creates hatch', result.hatchCount >= 1, `count=${result.hatchCount}`);
  test('BHATCH patternName=LINE', result.pattern === 'LINE');
  test('BHATCH has boundary', result.boundaries >= 1, `boundaries=${result.boundaries}`);
  test('BHATCH boundary has points', result.pointCount >= 3, `points=${result.pointCount}`);

  // Cleanup
  await page.evaluate(() => { window.__store.entities = []; window.__store.emit(); });
  await pressEsc();
}

// ============================================================
// SELECTALL / DESELECTALL
// ============================================================
async function testSelectAllDeselect() {
  console.log('\n=== SELECTALL / DESELECTALL ===');

  const hasSA = await page.evaluate(() => window.__engine.commands.has('SELECTALL'));
  test('SELECTALL registered', hasSA);
  const hasDSA = await page.evaluate(() => window.__engine.commands.has('DESELECTALL'));
  test('DESELECTALL registered', hasDSA);

  // Setup
  await page.evaluate(() => {
    const s = window.__store;
    s.entities = [];
    s.layers = [
      { name: '0', color: '#ffffff', visible: true, locked: false, current: true, lineweight: 1 },
      { name: 'LOCKED', color: '#ff0000', visible: true, locked: true, current: false, lineweight: 1 },
      { name: 'HIDDEN', color: '#00ff00', visible: false, locked: false, current: false, lineweight: 1 },
    ];
    s.entities.push(
      { id: 'sa1', type: 'line', layer: '0', color: 'bylayer', lineweight: 1, linetype: 'continuous', visible: true, selected: false, start: { x: 0, y: 0 }, end: { x: 10, y: 10 } },
      { id: 'sa2', type: 'circle', layer: '0', color: 'bylayer', lineweight: 1, linetype: 'continuous', visible: true, selected: false, center: { x: 50, y: 50 }, radius: 10 },
      { id: 'sa3', type: 'line', layer: 'LOCKED', color: 'bylayer', lineweight: 1, linetype: 'continuous', visible: true, selected: false, start: { x: 20, y: 20 }, end: { x: 30, y: 30 } },
      { id: 'sa4', type: 'line', layer: 'HIDDEN', color: 'bylayer', lineweight: 1, linetype: 'continuous', visible: true, selected: false, start: { x: 40, y: 40 }, end: { x: 50, y: 50 } },
    );
    s.emit();
  });

  await cmd('SELECTALL');
  await page.waitForTimeout(200);

  let selCount = await page.evaluate(() => window.__store.entities.filter(e => e.selected).length);
  test('SELECTALL selects visible unlocked', selCount === 2, `selected=${selCount}`);

  let output = await getOutput(3);
  test('SELECTALL message', output.includes('selected'), output.split('\n').pop());

  // Now DESELECTALL
  await cmd('DESELECTALL');
  await page.waitForTimeout(200);

  selCount = await page.evaluate(() => window.__store.entities.filter(e => e.selected).length);
  test('DESELECTALL clears selection', selCount === 0, `selected=${selCount}`);

  output = await getOutput(3);
  test('DESELECTALL message', output.includes('deselect') || output.includes('Deselect'),
    output.split('\n').pop());

  // Cleanup
  await page.evaluate(() => {
    window.__store.entities = [];
    window.__store.layers = [{ name: '0', color: '#ffffff', visible: true, locked: false, current: true, lineweight: 1 }];
    window.__store.emit();
  });
  await pressEsc();
}

// ============================================================
// SELECTPREVIOUS
// ============================================================
async function testSELECTPREVIOUS() {
  console.log('\n=== SELECTPREVIOUS ===');

  const hasCmd = await page.evaluate(() => window.__engine.commands.has('SELECTPREVIOUS'));
  test('SELECTPREVIOUS registered', hasCmd);

  const hasAlias = await page.evaluate(() => {
    const def = window.__engine.commands.get('SELECTPREVIOUS');
    return def && def.aliases.includes('SELECTP');
  });
  test('SELECTP alias', hasAlias);

  // Setup
  await page.evaluate(() => {
    const s = window.__store;
    s.entities = [];
    s.entities.push(
      { id: 'sp1', type: 'line', layer: '0', color: 'bylayer', lineweight: 1, linetype: 'continuous', visible: true, selected: true, start: { x: 0, y: 0 }, end: { x: 10, y: 10 } },
      { id: 'sp2', type: 'circle', layer: '0', color: 'bylayer', lineweight: 1, linetype: 'continuous', visible: true, selected: true, center: { x: 50, y: 50 }, radius: 10 },
      { id: 'sp3', type: 'line', layer: '0', color: 'bylayer', lineweight: 1, linetype: 'continuous', visible: true, selected: false, start: { x: 20, y: 20 }, end: { x: 30, y: 30 } },
    );
    s.emit();
  });

  // Clear selection (stores previous)
  await page.evaluate(() => { window.__store.clearSelection(); });

  let selCount = await page.evaluate(() => window.__store.entities.filter(e => e.selected).length);
  test('Cleared to 0', selCount === 0);

  let prevCount = await page.evaluate(() => window.__store.previousSelection.length);
  test('Previous stored', prevCount === 2, `prev=${prevCount}`);

  // Reselect previous
  await cmd('SELECTPREVIOUS');
  await page.waitForTimeout(200);

  selCount = await page.evaluate(() => window.__store.entities.filter(e => e.selected).length);
  test('SELECTPREVIOUS restores 2', selCount === 2, `selected=${selCount}`);

  const output = await getOutput(3);
  test('SELECTPREVIOUS message', output.includes('2') && output.includes('select'),
    output.split('\n').pop());

  // Test with no previous
  await page.evaluate(() => { window.__store.previousSelection = []; });
  await cmd('SELECTP');
  await page.waitForTimeout(200);
  const output2 = await getOutput(3);
  test('SELECTP no previous', output2.includes('No') || output2.includes('no'),
    output2.split('\n').pop());

  // Cleanup
  await page.evaluate(() => { window.__store.entities = []; window.__store.emit(); });
  await pressEsc();
}

// ============================================================
// SELECTSIMILAR
// ============================================================
async function testSELECTSIMILAR() {
  console.log('\n=== SELECTSIMILAR ===');

  const hasCmd = await page.evaluate(() => window.__engine.commands.has('SELECTSIMILAR'));
  test('SELECTSIMILAR registered', hasCmd);

  const hasAlias = await page.evaluate(() => {
    const def = window.__engine.commands.get('SELECTSIMILAR');
    return def && def.aliases.includes('SELSIM');
  });
  test('SELSIM alias', hasAlias);

  // Setup
  await page.evaluate(() => {
    const s = window.__store;
    s.entities = [];
    s.entities.push(
      { id: 'ss1', type: 'line', layer: '0', color: 'bylayer', lineweight: 1, linetype: 'continuous', visible: true, selected: true, start: { x: 0, y: 0 }, end: { x: 10, y: 10 } },
      { id: 'ss2', type: 'line', layer: '0', color: 'bylayer', lineweight: 1, linetype: 'continuous', visible: true, selected: false, start: { x: 20, y: 20 }, end: { x: 30, y: 30 } },
      { id: 'ss3', type: 'line', layer: '0', color: 'bylayer', lineweight: 1, linetype: 'continuous', visible: true, selected: false, start: { x: 40, y: 40 }, end: { x: 50, y: 50 } },
      { id: 'ss4', type: 'circle', layer: '0', color: 'bylayer', lineweight: 1, linetype: 'continuous', visible: true, selected: false, center: { x: 60, y: 60 }, radius: 5 },
    );
    s.emit();
  });

  await cmd('SELECTSIMILAR');
  await page.waitForTimeout(200);

  const selResult = await page.evaluate(() => {
    const sel = window.__store.entities.filter(e => e.selected);
    return {
      selCount: sel.length,
      allLines: sel.every(e => e.type === 'line'),
    };
  });
  test('SELECTSIMILAR selects 3 lines', selResult.selCount === 3, `selected=${selResult.selCount}`);
  test('SELECTSIMILAR all lines', selResult.allLines);

  const output = await getOutput(3);
  test('SELECTSIMILAR message', output.includes('3') || output.includes('selected'),
    output.split('\n').pop());

  // Cleanup
  await page.evaluate(() => { window.__store.entities = []; window.__store.emit(); });
  await pressEsc();
}

// ============================================================
// ADDSELECTED
// ============================================================
async function testADDSELECTED() {
  console.log('\n=== ADDSELECTED ===');

  const hasCmd = await page.evaluate(() => window.__engine.commands.has('ADDSELECTED'));
  test('ADDSELECTED registered', hasCmd);

  // Setup: select a circle on a specific layer
  await page.evaluate(() => {
    const s = window.__store;
    s.entities = [];
    s.layers = [
      { name: '0', color: '#ffffff', visible: true, locked: false, current: true, lineweight: 1 },
      { name: 'CUT', color: '#ff0000', visible: true, locked: false, current: false, lineweight: 1 },
    ];
    s.entities.push({
      id: 'as1', type: 'circle', layer: 'CUT', color: '#ff0000', lineweight: 1,
      linetype: 'continuous', visible: true, selected: true,
      center: { x: 50, y: 50 }, radius: 10,
    });
    s.emit();
  });

  await cmd('ADDSELECTED');
  await page.waitForTimeout(200);

  // Check that it set the layer and color
  const result = await page.evaluate(() => {
    const s = window.__store;
    return {
      currentLayer: s.currentLayer().name,
      currentColor: s.currentColor,
      activeCmd: window.__engine.activeCommand,
    };
  });
  test('ADDSELECTED sets layer CUT', result.currentLayer === 'CUT', `layer=${result.currentLayer}`);
  test('ADDSELECTED sets color', result.currentColor === '#ff0000', `color=${result.currentColor}`);
  test('ADDSELECTED starts CIRCLE', result.activeCmd === 'CIRCLE', `cmd=${result.activeCmd}`);

  // Cancel the started command
  await pressEsc();

  // Reset
  await page.evaluate(() => {
    window.__store.entities = [];
    window.__store.layers = [{ name: '0', color: '#ffffff', visible: true, locked: false, current: true, lineweight: 1 }];
    window.__store.currentColor = 'bylayer';
    window.__store.emit();
  });
}

// ============================================================
// OVERKILL
// ============================================================
async function testOVERKILL() {
  console.log('\n=== OVERKILL ===');

  const hasCmd = await page.evaluate(() => window.__engine.commands.has('OVERKILL'));
  test('OVERKILL registered', hasCmd);

  const hasAlias = await page.evaluate(() => {
    const def = window.__engine.commands.get('OVERKILL');
    return def && def.aliases.includes('OVK');
  });
  test('OVK alias', hasAlias);

  // Setup with duplicates
  await page.evaluate(() => {
    const s = window.__store;
    s.entities = [];
    s.entities.push(
      { id: 'ok1', type: 'line', layer: '0', color: 'bylayer', lineweight: 1, linetype: 'continuous', visible: true, selected: true, start: { x: 0, y: 0 }, end: { x: 10, y: 10 } },
      { id: 'ok2', type: 'line', layer: '0', color: 'bylayer', lineweight: 1, linetype: 'continuous', visible: true, selected: true, start: { x: 0, y: 0 }, end: { x: 10, y: 10 } },
      { id: 'ok3', type: 'line', layer: '0', color: 'bylayer', lineweight: 1, linetype: 'continuous', visible: true, selected: true, start: { x: 10, y: 10 }, end: { x: 0, y: 0 } },
      { id: 'ok4', type: 'circle', layer: '0', color: 'bylayer', lineweight: 1, linetype: 'continuous', visible: true, selected: true, center: { x: 50, y: 50 }, radius: 10 },
      { id: 'ok5', type: 'circle', layer: '0', color: 'bylayer', lineweight: 1, linetype: 'continuous', visible: true, selected: true, center: { x: 50, y: 50 }, radius: 10 },
      { id: 'ok6', type: 'line', layer: '0', color: 'bylayer', lineweight: 1, linetype: 'continuous', visible: true, selected: true, start: { x: 20, y: 20 }, end: { x: 30, y: 30 } },
    );
    s.emit();
  });

  await cmd('OVERKILL');
  await page.waitForTimeout(300);

  const result = await page.evaluate(() => ({
    entityCount: window.__store.entities.length,
    lineCount: window.__store.entities.filter(e => e.type === 'line').length,
    circleCount: window.__store.entities.filter(e => e.type === 'circle').length,
  }));
  test('OVERKILL removes duplicates', result.entityCount === 3, `total=${result.entityCount}`);
  test('OVERKILL keeps 2 unique lines', result.lineCount === 2, `lines=${result.lineCount}`);
  test('OVERKILL keeps 1 circle', result.circleCount === 1, `circles=${result.circleCount}`);

  const output = await getOutput(3);
  test('OVERKILL message', output.includes('3') && output.includes('duplicate'),
    output.split('\n').pop());

  // Test undo
  await cmd('UNDO');
  await page.waitForTimeout(200);
  const undoCount = await page.evaluate(() => window.__store.entities.length);
  test('OVERKILL undo restores', undoCount === 6, `count=${undoCount}`);

  // Cleanup
  await page.evaluate(() => { window.__store.entities = []; window.__store.emit(); });
  await pressEsc();
}

// ============================================================
// FLATTEN
// ============================================================
async function testFLATTEN() {
  console.log('\n=== FLATTEN ===');

  const hasCmd = await page.evaluate(() => window.__engine.commands.has('FLATTEN'));
  test('FLATTEN registered', hasCmd);

  // Setup with polylines having duplicate consecutive points
  await page.evaluate(() => {
    const s = window.__store;
    s.entities = [];
    s.entities.push(
      {
        id: 'fl1', type: 'polyline', layer: '0', color: 'bylayer', lineweight: 1,
        linetype: 'continuous', visible: true, selected: true, closed: false,
        points: [{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 10, y: 10 }, { x: 10, y: 10 }, { x: 20, y: 20 }],
        bulges: [0, 0, 0, 0, 0],
      },
      {
        id: 'fl2', type: 'line', layer: '0', color: 'bylayer', lineweight: 1,
        linetype: 'continuous', visible: true, selected: true,
        start: { x: 30, y: 30 }, end: { x: 40, y: 40 },
      },
    );
    s.emit();
  });

  await cmd('FLATTEN');
  await page.waitForTimeout(300);

  const result = await page.evaluate(() => {
    const pl = window.__store.entities.find(e => e.type === 'polyline');
    return {
      entityCount: window.__store.entities.length,
      polylinePoints: pl?.points?.length,
    };
  });
  test('FLATTEN preserves entities', result.entityCount === 2, `count=${result.entityCount}`);
  test('FLATTEN removes dup points', result.polylinePoints === 3, `points=${result.polylinePoints}`);

  const output = await getOutput(3);
  test('FLATTEN message', output.includes('FLATTEN') || output.includes('flatten') || output.includes('processed'),
    output.split('\n').pop());

  // Cleanup
  await page.evaluate(() => { window.__store.entities = []; window.__store.emit(); });
  await pressEsc();
}

// ============================================================
// REGENALL
// ============================================================
async function testREGENALL() {
  console.log('\n=== REGENALL ===');

  const hasCmd = await page.evaluate(() => window.__engine.commands.has('REGENALL'));
  test('REGENALL registered', hasCmd);

  const hasAlias = await page.evaluate(() => {
    const def = window.__engine.commands.get('REGENALL');
    return def && def.aliases.includes('REA');
  });
  test('REA alias', hasAlias);

  await cmd('REGENALL');
  await page.waitForTimeout(200);

  const output = await getOutput(3);
  test('REGENALL message', output.includes('regenerat') || output.includes('REGENALL'),
    output.split('\n').pop());

  await pressEsc();
}

// ============================================================
// SUMMARY
// ============================================================
async function testSummary() {
  console.log('\n=== SUMMARY ===');
  const total = await page.evaluate(() => window.__engine.commands.size);
  test('Total registered commands', total === 143, `count=${total}`);

  const newCmds = ['DTEXT', 'BHATCH', 'SELECTALL', 'DESELECTALL', 'SELECTPREVIOUS', 'SELECTSIMILAR', 'ADDSELECTED', 'OVERKILL', 'FLATTEN', 'REGENALL'];
  for (const name of newCmds) {
    const exists = await page.evaluate((n) => window.__engine.commands.has(n), name);
    test(`${name} registered`, exists);
  }

  const aliases = { BH: 'BHATCH', DSA: 'DESELECTALL', SELECTP: 'SELECTPREVIOUS', SELSIM: 'SELECTSIMILAR', OVK: 'OVERKILL', REA: 'REGENALL' };
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
  console.log('MiniCAD Tier 13 Commands Audit');
  console.log('='.repeat(50));

  try {
    await setup();
    await testDTEXT();
    await testBHATCH();
    await testSelectAllDeselect();
    await testSELECTPREVIOUS();
    await testSELECTSIMILAR();
    await testADDSELECTED();
    await testOVERKILL();
    await testFLATTEN();
    await testREGENALL();
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
