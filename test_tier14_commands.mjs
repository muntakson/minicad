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
// QDIM
// ============================================================
async function testQDIM() {
  console.log('\n=== QDIM ===');

  const hasCmd = await page.evaluate(() => window.__engine.commands.has('QDIM'));
  test('QDIM registered', hasCmd);

  // Setup lines and circles
  await page.evaluate(() => {
    const s = window.__store;
    s.entities = [];
    s.entities.push(
      { id: 'qd1', type: 'line', layer: '0', color: 'bylayer', lineweight: 1, linetype: 'continuous', visible: true, selected: true, start: { x: 0, y: 0 }, end: { x: 100, y: 0 } },
      { id: 'qd2', type: 'circle', layer: '0', color: 'bylayer', lineweight: 1, linetype: 'continuous', visible: true, selected: true, center: { x: 200, y: 200 }, radius: 25 },
      { id: 'qd3', type: 'line', layer: '0', color: 'bylayer', lineweight: 1, linetype: 'continuous', visible: true, selected: true, start: { x: 50, y: 50 }, end: { x: 50, y: 150 } },
    );
    s.emit();
  });

  await cmd('QDIM');
  await page.waitForTimeout(300);

  const result = await page.evaluate(() => {
    const dims = window.__store.entities.filter(e => e.type === 'dimension');
    return {
      dimCount: dims.length,
      types: dims.map(d => d.dimType),
    };
  });
  test('QDIM creates dimensions', result.dimCount >= 3, `dims=${result.dimCount}`);
  test('QDIM has linear dims', result.types.includes('linear'), `types=${result.types.join(',')}`);
  test('QDIM has diameter dim', result.types.includes('diameter'), `types=${result.types.join(',')}`);

  const output = await getOutput(3);
  test('QDIM message', output.includes('dimension') || output.includes('QDIM'),
    output.split('\n').pop());

  // Cleanup
  await page.evaluate(() => { window.__store.entities = []; window.__store.emit(); });
  await pressEsc();
}

// ============================================================
// TEXTALIGN
// ============================================================
async function testTEXTALIGN() {
  console.log('\n=== TEXTALIGN ===');

  const hasCmd = await page.evaluate(() => window.__engine.commands.has('TEXTALIGN'));
  test('TEXTALIGN registered', hasCmd);

  const hasAlias = await page.evaluate(() => {
    const def = window.__engine.commands.get('TEXTALIGN');
    return def && def.aliases.includes('TA');
  });
  test('TA alias', hasAlias);

  // Setup text entities at different positions
  await page.evaluate(() => {
    const s = window.__store;
    s.entities = [];
    s.entities.push(
      { id: 'ta1', type: 'text', layer: '0', color: 'bylayer', lineweight: 1, linetype: 'continuous', visible: true, selected: true, position: { x: 10, y: 100 }, text: 'First', height: 5, rotation: 0 },
      { id: 'ta2', type: 'text', layer: '0', color: 'bylayer', lineweight: 1, linetype: 'continuous', visible: true, selected: true, position: { x: 30, y: 80 }, text: 'Second', height: 5, rotation: 0 },
      { id: 'ta3', type: 'text', layer: '0', color: 'bylayer', lineweight: 1, linetype: 'continuous', visible: true, selected: true, position: { x: 50, y: 60 }, text: 'Third', height: 5, rotation: 0 },
    );
    s.emit();
  });

  // Test Left alignment
  await cmd('TEXTALIGN');
  await page.waitForTimeout(100);
  await cmd('Left');
  await page.waitForTimeout(300);

  let positions = await page.evaluate(() =>
    window.__store.entities.filter(e => e.type === 'text').map(e => ({ x: e.position.x, y: e.position.y }))
  );
  const allSameX = positions.every(p => p.x === positions[0].x);
  test('TEXTALIGN Left aligns X', allSameX, `xs=${positions.map(p => p.x).join(',')}`);
  test('TEXTALIGN Left uses min X', positions[0].x === 10, `x=${positions[0].x}`);

  // Reset positions for top test
  await page.evaluate(() => {
    const texts = window.__store.entities.filter(e => e.type === 'text');
    texts[0].position = { x: 10, y: 100 }; texts[0].selected = true;
    texts[1].position = { x: 30, y: 80 }; texts[1].selected = true;
    texts[2].position = { x: 50, y: 60 }; texts[2].selected = true;
    window.__store.emit();
  });

  await cmd('TA');
  await page.waitForTimeout(100);
  await cmd('Top');
  await page.waitForTimeout(300);

  positions = await page.evaluate(() =>
    window.__store.entities.filter(e => e.type === 'text').map(e => ({ x: e.position.x, y: e.position.y }))
  );
  const allSameY = positions.every(p => p.y === positions[0].y);
  test('TEXTALIGN Top aligns Y', allSameY, `ys=${positions.map(p => p.y).join(',')}`);
  test('TEXTALIGN Top uses max Y', positions[0].y === 100, `y=${positions[0].y}`);

  const output = await getOutput(3);
  test('TEXTALIGN message', output.includes('aligned') || output.includes('TEXTALIGN'),
    output.split('\n').pop());

  // Cleanup
  await page.evaluate(() => { window.__store.entities = []; window.__store.emit(); });
  await pressEsc();
}

// ============================================================
// SCALETEXT
// ============================================================
async function testSCALETEXT() {
  console.log('\n=== SCALETEXT ===');

  const hasCmd = await page.evaluate(() => window.__engine.commands.has('SCALETEXT'));
  test('SCALETEXT registered', hasCmd);

  // Setup
  await page.evaluate(() => {
    const s = window.__store;
    s.entities = [];
    s.entities.push(
      { id: 'st1', type: 'text', layer: '0', color: 'bylayer', lineweight: 1, linetype: 'continuous', visible: true, selected: true, position: { x: 10, y: 10 }, text: 'ABC', height: 5, rotation: 0 },
      { id: 'st2', type: 'text', layer: '0', color: 'bylayer', lineweight: 1, linetype: 'continuous', visible: true, selected: true, position: { x: 10, y: 20 }, text: 'DEF', height: 8, rotation: 0 },
    );
    s.emit();
  });

  // Scale by factor
  await cmd('SCALETEXT');
  await page.waitForTimeout(100);
  // Default is Scale mode
  await cmd('');
  await page.waitForTimeout(100);
  await cmd('2');
  await page.waitForTimeout(300);

  let heights = await page.evaluate(() =>
    window.__store.entities.filter(e => e.type === 'text').map(e => e.height)
  );
  test('SCALETEXT factor 2x', heights[0] === 10 && heights[1] === 16,
    `heights=${heights.join(',')}`);

  // Test Height mode
  await page.evaluate(() => {
    window.__store.entities.forEach(e => { if (e.type === 'text') e.selected = true; });
    window.__store.emit();
  });

  await cmd('SCALETEXT');
  await page.waitForTimeout(100);
  await cmd('Height');
  await page.waitForTimeout(100);
  await cmd('3');
  await page.waitForTimeout(300);

  heights = await page.evaluate(() =>
    window.__store.entities.filter(e => e.type === 'text').map(e => e.height)
  );
  test('SCALETEXT height=3', heights[0] === 3 && heights[1] === 3,
    `heights=${heights.join(',')}`);

  const output = await getOutput(3);
  test('SCALETEXT message', output.includes('scaled') || output.includes('SCALETEXT'),
    output.split('\n').pop());

  // Cleanup
  await page.evaluate(() => { window.__store.entities = []; window.__store.emit(); });
  await pressEsc();
}

// ============================================================
// GRADIENT
// ============================================================
async function testGRADIENT() {
  console.log('\n=== GRADIENT ===');

  const hasCmd = await page.evaluate(() => window.__engine.commands.has('GRADIENT'));
  test('GRADIENT registered', hasCmd);

  const hasAlias = await page.evaluate(() => {
    const def = window.__engine.commands.get('GRADIENT');
    return def && def.aliases.includes('GD');
  });
  test('GD alias', hasAlias);

  // Setup boundary
  await page.evaluate(() => {
    const s = window.__store;
    s.entities = [];
    s.entities.push({
      id: 'gr1', type: 'polyline', layer: '0', color: 'bylayer', lineweight: 1,
      linetype: 'continuous', visible: true, selected: true, closed: true,
      points: [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 50 }, { x: 0, y: 50 }],
      bulges: [0, 0, 0, 0],
    });
    s.emit();
  });

  await cmd('GRADIENT');
  await page.waitForTimeout(100);
  await cmd('LINEAR');
  await page.waitForTimeout(100);
  await cmd('#ff0000');
  await page.waitForTimeout(100);
  await cmd('#0000ff');
  await page.waitForTimeout(300);

  const result = await page.evaluate(() => {
    const hatches = window.__store.entities.filter(e => e.type === 'hatch');
    return {
      count: hatches.length,
      pattern: hatches[0]?.patternName,
      boundaries: hatches[0]?.boundaries?.length,
    };
  });
  test('GRADIENT creates hatch', result.count >= 1, `count=${result.count}`);
  test('GRADIENT pattern contains GRADIENT', result.pattern?.includes('GRADIENT'), `pattern=${result.pattern}`);
  test('GRADIENT has boundary', result.boundaries >= 1);

  const output = await getOutput(3);
  test('GRADIENT message', output.includes('radient') || output.includes('hatch') || output.includes('created'),
    output.split('\n').pop());

  // Cleanup
  await page.evaluate(() => { window.__store.entities = []; window.__store.emit(); });
  await pressEsc();
}

// ============================================================
// ISOLATEOBJECTS / HIDEOBJECTS / UNISOLATEOBJECTS
// ============================================================
async function testObjectVisibility() {
  console.log('\n=== ISOLATEOBJECTS / HIDEOBJECTS / UNISOLATEOBJECTS ===');

  const hasIsolate = await page.evaluate(() => window.__engine.commands.has('ISOLATEOBJECTS'));
  test('ISOLATEOBJECTS registered', hasIsolate);
  const hasHide = await page.evaluate(() => window.__engine.commands.has('HIDEOBJECTS'));
  test('HIDEOBJECTS registered', hasHide);
  const hasUnisolate = await page.evaluate(() => window.__engine.commands.has('UNISOLATEOBJECTS'));
  test('UNISOLATEOBJECTS registered', hasUnisolate);

  const hasIsolateAlias = await page.evaluate(() => {
    const def = window.__engine.commands.get('ISOLATEOBJECTS');
    return def && def.aliases.includes('ISOLATE');
  });
  test('ISOLATE alias', hasIsolateAlias);

  const hasUnisolateAlias = await page.evaluate(() => {
    const def = window.__engine.commands.get('UNISOLATEOBJECTS');
    return def && def.aliases.includes('UNISOLATE');
  });
  test('UNISOLATE alias', hasUnisolateAlias);

  // Setup
  await page.evaluate(() => {
    const s = window.__store;
    s.entities = [];
    s.hiddenEntityIds.clear();
    s.entities.push(
      { id: 'io1', type: 'line', layer: '0', color: 'bylayer', lineweight: 1, linetype: 'continuous', visible: true, selected: true, start: { x: 0, y: 0 }, end: { x: 10, y: 10 } },
      { id: 'io2', type: 'circle', layer: '0', color: 'bylayer', lineweight: 1, linetype: 'continuous', visible: true, selected: false, center: { x: 50, y: 50 }, radius: 10 },
      { id: 'io3', type: 'line', layer: '0', color: 'bylayer', lineweight: 1, linetype: 'continuous', visible: true, selected: false, start: { x: 20, y: 20 }, end: { x: 30, y: 30 } },
    );
    s.emit();
  });

  // Test ISOLATEOBJECTS — only io1 is selected
  await cmd('ISOLATEOBJECTS');
  await page.waitForTimeout(300);

  let visResult = await page.evaluate(() => ({
    visibleCount: window.__store.entities.filter(e => e.visible).length,
    hiddenCount: window.__store.hiddenEntityIds.size,
  }));
  test('ISOLATEOBJECTS hides unselected', visResult.visibleCount === 1, `visible=${visResult.visibleCount}`);
  test('ISOLATEOBJECTS tracks hidden', visResult.hiddenCount === 2, `hidden=${visResult.hiddenCount}`);

  // UNISOLATEOBJECTS
  await cmd('UNISOLATEOBJECTS');
  await page.waitForTimeout(300);

  visResult = await page.evaluate(() => ({
    visibleCount: window.__store.entities.filter(e => e.visible).length,
    hiddenCount: window.__store.hiddenEntityIds.size,
  }));
  test('UNISOLATEOBJECTS shows all', visResult.visibleCount === 3, `visible=${visResult.visibleCount}`);
  test('UNISOLATEOBJECTS clears set', visResult.hiddenCount === 0);

  // Test HIDEOBJECTS
  await page.evaluate(() => {
    window.__store.entities.forEach(e => e.selected = (e.id === 'io2'));
    window.__store.emit();
  });
  await cmd('HIDEOBJECTS');
  await page.waitForTimeout(300);

  visResult = await page.evaluate(() => ({
    visibleCount: window.__store.entities.filter(e => e.visible).length,
    io2visible: window.__store.entities.find(e => e.id === 'io2')?.visible,
    hiddenCount: window.__store.hiddenEntityIds.size,
  }));
  test('HIDEOBJECTS hides selected', visResult.io2visible === false);
  test('HIDEOBJECTS others visible', visResult.visibleCount === 2, `visible=${visResult.visibleCount}`);
  test('HIDEOBJECTS tracks hidden', visResult.hiddenCount === 1);

  // UNISOLATEOBJECTS again
  await cmd('UNISOLATE');
  await page.waitForTimeout(200);
  visResult = await page.evaluate(() => ({
    visibleCount: window.__store.entities.filter(e => e.visible).length,
  }));
  test('UNISOLATE alias restores', visResult.visibleCount === 3);

  // Test UNISOLATE with nothing hidden
  await cmd('UNISOLATEOBJECTS');
  await page.waitForTimeout(200);
  const output = await getOutput(3);
  test('UNISOLATE nothing hidden', output.includes('No') || output.includes('no') || output.includes('All'),
    output.split('\n').pop());

  // Cleanup
  await page.evaluate(() => {
    window.__store.entities = [];
    window.__store.hiddenEntityIds.clear();
    window.__store.emit();
  });
  await pressEsc();
}

// ============================================================
// NCOPY
// ============================================================
async function testNCOPY() {
  console.log('\n=== NCOPY ===');

  const hasCmd = await page.evaluate(() => window.__engine.commands.has('NCOPY'));
  test('NCOPY registered', hasCmd);

  // Setup block and blockref
  await page.evaluate(() => {
    const s = window.__store;
    s.entities = [];
    s.blockDefs.set('WIDGET', [
      { id: 'wd1', type: 'line', layer: '0', color: 'bylayer', lineweight: 1, linetype: 'continuous', visible: true, selected: false, start: { x: 0, y: 0 }, end: { x: 10, y: 10 } },
      { id: 'wd2', type: 'circle', layer: '0', color: 'bylayer', lineweight: 1, linetype: 'continuous', visible: true, selected: false, center: { x: 5, y: 5 }, radius: 3 },
    ]);
    s.entities.push({
      id: 'nc1', type: 'blockref', layer: '0', color: 'bylayer', lineweight: 1,
      linetype: 'continuous', visible: true, selected: true,
      blockName: 'WIDGET', insertPoint: { x: 50, y: 50 },
      scaleX: 1, scaleY: 1, rotation: 0, attributes: [],
    });
    s.emit();
  });

  await cmd('NCOPY');
  await page.waitForTimeout(300);

  const result = await page.evaluate(() => {
    const s = window.__store;
    return {
      total: s.entities.length,
      lineCount: s.entities.filter(e => e.type === 'line').length,
      circleCount: s.entities.filter(e => e.type === 'circle').length,
      blockrefCount: s.entities.filter(e => e.type === 'blockref').length,
    };
  });
  test('NCOPY extracts entities', result.total >= 3, `total=${result.total}`);
  test('NCOPY creates line', result.lineCount >= 1, `lines=${result.lineCount}`);
  test('NCOPY creates circle', result.circleCount >= 1, `circles=${result.circleCount}`);
  test('NCOPY keeps blockref', result.blockrefCount === 1);

  const output = await getOutput(3);
  test('NCOPY message', output.includes('NCOPY') || output.includes('extracted'),
    output.split('\n').pop());

  // Cleanup
  await page.evaluate(() => {
    window.__store.entities = [];
    window.__store.blockDefs.delete('WIDGET');
    window.__store.emit();
  });
  await pressEsc();
}

// ============================================================
// FILTER
// ============================================================
async function testFILTER() {
  console.log('\n=== FILTER ===');

  const hasCmd = await page.evaluate(() => window.__engine.commands.has('FILTER'));
  test('FILTER registered', hasCmd);

  // Setup entities
  await page.evaluate(() => {
    const s = window.__store;
    s.entities = [];
    s.layers = [
      { name: '0', color: '#ffffff', visible: true, locked: false, current: true, lineweight: 1 },
      { name: 'CUT', color: '#ff0000', visible: true, locked: false, current: false, lineweight: 1 },
    ];
    s.entities.push(
      { id: 'fi1', type: 'line', layer: '0', color: 'bylayer', lineweight: 1, linetype: 'continuous', visible: true, selected: false, start: { x: 0, y: 0 }, end: { x: 10, y: 10 } },
      { id: 'fi2', type: 'line', layer: 'CUT', color: 'bylayer', lineweight: 1, linetype: 'continuous', visible: true, selected: false, start: { x: 20, y: 20 }, end: { x: 30, y: 30 } },
      { id: 'fi3', type: 'circle', layer: '0', color: 'bylayer', lineweight: 1, linetype: 'continuous', visible: true, selected: false, center: { x: 50, y: 50 }, radius: 10 },
      { id: 'fi4', type: 'circle', layer: 'CUT', color: '#ff0000', lineweight: 1, linetype: 'continuous', visible: true, selected: false, center: { x: 70, y: 70 }, radius: 5 },
    );
    s.emit();
  });

  // Filter by type
  await cmd('FILTER');
  await page.waitForTimeout(100);
  await cmd('Type');
  await page.waitForTimeout(100);
  await cmd('circle');
  await page.waitForTimeout(300);

  let selCount = await page.evaluate(() => window.__store.entities.filter(e => e.selected).length);
  test('FILTER by type circle', selCount === 2, `selected=${selCount}`);

  // Reset
  await page.evaluate(() => { window.__store.entities.forEach(e => e.selected = false); window.__store.emit(); });

  // Filter by layer
  await cmd('FILTER');
  await page.waitForTimeout(100);
  await cmd('Layer');
  await page.waitForTimeout(100);
  await cmd('CUT');
  await page.waitForTimeout(300);

  selCount = await page.evaluate(() => window.__store.entities.filter(e => e.selected).length);
  test('FILTER by layer CUT', selCount === 2, `selected=${selCount}`);

  const output = await getOutput(3);
  test('FILTER message', output.includes('selected') || output.includes('FILTER'),
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
// ABOUT
// ============================================================
async function testABOUT() {
  console.log('\n=== ABOUT ===');

  const hasCmd = await page.evaluate(() => window.__engine.commands.has('ABOUT'));
  test('ABOUT registered', hasCmd);

  await cmd('ABOUT');
  await page.waitForTimeout(200);

  const output = await getOutput(8);
  test('ABOUT shows MiniCAD', output.includes('MiniCAD'), output.split('\n')[0]);
  test('ABOUT shows info', output.includes('CAD') || output.includes('laser') || output.includes('2D'),
    output.split('\n').pop());

  await pressEsc();
}

// ============================================================
// SUMMARY
// ============================================================
async function testSummary() {
  console.log('\n=== SUMMARY ===');
  const total = await page.evaluate(() => window.__engine.commands.size);
  test('Total registered commands', total === 153, `count=${total}`);

  const newCmds = ['QDIM', 'TEXTALIGN', 'SCALETEXT', 'GRADIENT', 'ISOLATEOBJECTS', 'HIDEOBJECTS', 'UNISOLATEOBJECTS', 'NCOPY', 'FILTER', 'ABOUT'];
  for (const name of newCmds) {
    const exists = await page.evaluate((n) => window.__engine.commands.has(n), name);
    test(`${name} registered`, exists);
  }

  const aliases = { TA: 'TEXTALIGN', GD: 'GRADIENT', ISOLATE: 'ISOLATEOBJECTS', UNISOLATE: 'UNISOLATEOBJECTS' };
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
  console.log('MiniCAD Tier 14 Commands Audit');
  console.log('='.repeat(50));

  try {
    await setup();
    await testQDIM();
    await testTEXTALIGN();
    await testSCALETEXT();
    await testGRADIENT();
    await testObjectVisibility();
    await testNCOPY();
    await testFILTER();
    await testABOUT();
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
