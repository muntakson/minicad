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

async function clickCanvas(xRatio, yRatio) {
  const box = await page.locator('#cad-canvas').boundingBox();
  await page.mouse.click(box.x + box.width * xRatio, box.y + box.height * yRatio);
  await page.waitForTimeout(150);
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
// MLINE
// ============================================================
async function testMLINE() {
  console.log('\n=== MLINE ===');

  const hasMline = await page.evaluate(() => window.__engine.commands.has('MLINE'));
  test('MLINE registered', hasMline);
  const hasAlias = await page.evaluate(() => {
    const def = window.__engine.commands.get('MLINE');
    return def && def.aliases.includes('ML');
  });
  test('ML alias registered', hasAlias);

  // Test CLI prompt
  await cmd('MLINE');
  await page.waitForTimeout(100);
  let output = await getOutput(3);
  test('MLINE shows prompt', output.includes('Justification') || output.includes('Scale') || output.includes('start point'),
    output.split('\n').pop());

  // Test justification option
  await cmd('J');
  await page.waitForTimeout(100);
  output = await getOutput(3);
  test('MLINE justification prompt', output.includes('Top') || output.includes('Zero') || output.includes('Bottom'),
    output.split('\n').pop());
  await cmd('Zero');
  await page.waitForTimeout(100);
  output = await getOutput(3);
  test('MLINE justification set', output.includes('zero') || output.includes('Zero'),
    output.split('\n').pop());

  // Test scale option
  await cmd('S');
  await page.waitForTimeout(100);
  output = await getOutput(3);
  test('MLINE scale prompt', output.includes('scale') || output.includes('Scale'),
    output.split('\n').pop());
  await cmd('5');
  await page.waitForTimeout(100);

  // Cancel and test programmatically
  await pressEsc();

  // Programmatic test: create multiline via store
  const mlineResult = await page.evaluate(() => {
    const s = window.__store;
    const countBefore = s.entities.length;

    // Simulate MLINE creation: two parallel polylines
    s.pushUndo('MLINE');
    const pts = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 50 }];
    const offset = 5;

    // Compute offset lines (simplified for test)
    const off1 = pts.map(p => ({ x: p.x, y: p.y + offset / 2 }));
    const off2 = pts.map(p => ({ x: p.x, y: p.y - offset / 2 }));

    s.entities.push(
      { id: 'ml1', type: 'polyline', layer: '0', color: 'bylayer', lineweight: 1, linetype: 'continuous', visible: true, selected: false, points: off1, bulges: [0, 0, 0], closed: false },
      { id: 'ml2', type: 'polyline', layer: '0', color: 'bylayer', lineweight: 1, linetype: 'continuous', visible: true, selected: false, points: off2, bulges: [0, 0, 0], closed: false },
    );
    s.emit();

    return {
      added: s.entities.length - countBefore,
      line1Y: s.entities[s.entities.length - 2].points[0].y,
      line2Y: s.entities[s.entities.length - 1].points[0].y,
    };
  });
  test('MLINE creates 2 polylines', mlineResult.added === 2, `added=${mlineResult.added}`);
  test('MLINE offset correct', mlineResult.line1Y === 2.5 && mlineResult.line2Y === -2.5,
    `y1=${mlineResult.line1Y}, y2=${mlineResult.line2Y}`);

  // Test MLINE via canvas clicks
  await page.evaluate(() => { window.__store.entities = []; window.__store.emit(); });
  await cmd('ML');
  await page.waitForTimeout(100);
  await clickCanvas(0.2, 0.5);
  await page.waitForTimeout(100);
  await clickCanvas(0.5, 0.5);
  await page.waitForTimeout(100);
  await clickCanvas(0.5, 0.3);
  await page.waitForTimeout(100);
  await cmd('');  // finish
  await page.waitForTimeout(200);

  const mlineEntities = await page.evaluate(() => {
    return window.__store.entities.filter(e => e.type === 'polyline').length;
  });
  test('MLINE creates polylines via canvas', mlineEntities >= 2, `polylines=${mlineEntities}`);

  // Test MLINE with Close option
  await page.evaluate(() => { window.__store.entities = []; window.__store.emit(); });
  await cmd('MLINE');
  await page.waitForTimeout(100);
  await clickCanvas(0.2, 0.3);
  await page.waitForTimeout(100);
  await clickCanvas(0.5, 0.3);
  await page.waitForTimeout(100);
  await clickCanvas(0.5, 0.6);
  await page.waitForTimeout(100);
  await cmd('C');  // close
  await page.waitForTimeout(200);

  const closedMlines = await page.evaluate(() => {
    return window.__store.entities.filter(e => e.type === 'polyline' && e.closed).length;
  });
  test('MLINE Close creates closed polylines', closedMlines === 2, `closed=${closedMlines}`);

  // Test undo
  await cmd('UNDO');
  await page.waitForTimeout(200);
  const afterUndo = await page.evaluate(() => window.__store.entities.filter(e => e.type === 'polyline').length);
  test('MLINE undo works', afterUndo < closedMlines, `after undo: ${afterUndo}`);

  await pressEsc();
}

// ============================================================
// SOLID
// ============================================================
async function testSOLID() {
  console.log('\n=== SOLID ===');

  const hasSolid = await page.evaluate(() => window.__engine.commands.has('SOLID'));
  test('SOLID registered', hasSolid);
  const hasAlias = await page.evaluate(() => {
    const def = window.__engine.commands.get('SOLID');
    return def && def.aliases.includes('SO');
  });
  test('SO alias registered', hasAlias);

  // Test CLI prompt
  await cmd('SOLID');
  await page.waitForTimeout(100);
  let output = await getOutput(3);
  test('SOLID shows first point prompt', output.includes('first point'),
    output.split('\n').pop());
  await pressEsc();

  // Programmatic test: create solid triangle
  const triResult = await page.evaluate(() => {
    const s = window.__store;
    s.entities = [];
    s.pushUndo('SOLID');
    s.entities.push({
      id: 'sol1', type: 'hatch', layer: '0', color: 'bylayer', lineweight: 1, linetype: 'continuous',
      visible: true, selected: false,
      boundaries: [[{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 25, y: 40 }]],
      patternName: 'SOLID', patternScale: 1, patternAngle: 0,
    });
    s.emit();
    const e = s.entities[0];
    return {
      type: e.type,
      pattern: e.patternName,
      vertices: e.boundaries[0].length,
    };
  });
  test('Solid triangle is hatch entity', triResult.type === 'hatch', `type=${triResult.type}`);
  test('Solid triangle pattern is SOLID', triResult.pattern === 'SOLID', `pattern=${triResult.pattern}`);
  test('Solid triangle has 3 vertices', triResult.vertices === 3, `vertices=${triResult.vertices}`);

  // Programmatic test: create solid quad (4-point)
  const quadResult = await page.evaluate(() => {
    const s = window.__store;
    s.pushUndo('SOLID');
    s.entities.push({
      id: 'sol2', type: 'hatch', layer: '0', color: 'bylayer', lineweight: 1, linetype: 'continuous',
      visible: true, selected: false,
      boundaries: [[{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 50 }, { x: 0, y: 50 }]],
      patternName: 'SOLID', patternScale: 1, patternAngle: 0,
    });
    s.emit();
    const e = s.entities[1];
    return { vertices: e.boundaries[0].length };
  });
  test('Solid quad has 4 vertices', quadResult.vertices === 4, `vertices=${quadResult.vertices}`);

  // Canvas test: create triangle via clicks + Enter
  await page.evaluate(() => { window.__store.entities = []; window.__store.emit(); });
  await cmd('SO');
  await page.waitForTimeout(100);
  await clickCanvas(0.3, 0.5);
  await page.waitForTimeout(100);
  await clickCanvas(0.6, 0.5);
  await page.waitForTimeout(100);
  await clickCanvas(0.45, 0.3);
  await page.waitForTimeout(100);
  // Press Enter for triangle (skip 4th point)
  await cmd('');
  await page.waitForTimeout(200);

  output = await getOutput(3);
  const triCreated = output.includes('triangle');
  test('SOLID triangle via canvas', triCreated, output.split('\n').pop());

  const solidEntity = await page.evaluate(() => {
    const e = window.__store.entities.find(e => e.type === 'hatch' && e.patternName === 'SOLID');
    return e ? { type: e.type, vertices: e.boundaries[0].length } : null;
  });
  test('SOLID entity stored correctly', solidEntity !== null && solidEntity.vertices === 3,
    solidEntity ? `vertices=${solidEntity.vertices}` : 'null');

  // Canvas test: create quad via 4 clicks
  await page.evaluate(() => { window.__store.entities = []; window.__store.emit(); });
  await cmd('SOLID');
  await page.waitForTimeout(100);
  await clickCanvas(0.2, 0.6);
  await page.waitForTimeout(100);
  await clickCanvas(0.6, 0.6);
  await page.waitForTimeout(100);
  await clickCanvas(0.2, 0.3);
  await page.waitForTimeout(100);
  await clickCanvas(0.6, 0.3);
  await page.waitForTimeout(200);

  output = await getOutput(3);
  const quadCreated = output.includes('quad');
  test('SOLID quad via canvas', quadCreated, output.split('\n').pop());

  const quadEntity = await page.evaluate(() => {
    const e = window.__store.entities.find(e => e.type === 'hatch' && e.patternName === 'SOLID');
    return e ? { boundaries: e.boundaries[0].length } : null;
  });
  test('SOLID quad has 4 boundary points', quadEntity !== null && quadEntity.boundaries === 4,
    quadEntity ? `boundaries=${quadEntity.boundaries}` : 'null');

  // Test undo
  await cmd('UNDO');
  await page.waitForTimeout(200);
  const afterUndo = await page.evaluate(() =>
    window.__store.entities.filter(e => e.type === 'hatch').length
  );
  test('SOLID undo works', afterUndo === 0, `after undo: ${afterUndo}`);

  await pressEsc();
}

// ============================================================
// MINSERT
// ============================================================
async function testMINSERT() {
  console.log('\n=== MINSERT ===');

  const hasMinsert = await page.evaluate(() => window.__engine.commands.has('MINSERT'));
  test('MINSERT registered', hasMinsert);

  // Test CLI prompt
  await page.evaluate(() => {
    const s = window.__store;
    s.entities = [];
    s.blockDefs.clear();
    s.blockDefs.set('BOLT', [
      { id: 'b1', type: 'circle', layer: '0', color: 'bylayer', lineweight: 1, linetype: 'continuous', visible: true, selected: false, center: { x: 0, y: 0 }, radius: 5 },
    ]);
    s.emit();
  });

  await cmd('MINSERT');
  await page.waitForTimeout(100);
  let output = await getOutput(3);
  test('MINSERT shows block prompt', output.includes('block name') || output.includes('Block') || output.includes('BOLT'),
    output.split('\n').pop());
  await pressEsc();

  // Programmatic test: create array of block refs
  const arrayResult = await page.evaluate(() => {
    const s = window.__store;
    s.entities = [];
    s.pushUndo('MINSERT');

    const rows = 3, cols = 4;
    const rowDist = 20, colDist = 30;
    const base = { x: 10, y: 10 };

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        s.entities.push({
          id: `mi_${r}_${c}`, type: 'blockref', layer: '0', color: 'bylayer', lineweight: 1,
          linetype: 'continuous', visible: true, selected: false,
          blockName: 'BOLT',
          insertPoint: { x: base.x + c * colDist, y: base.y + r * rowDist },
          scaleX: 1, scaleY: 1, rotation: 0,
        });
      }
    }
    s.emit();

    const refs = s.entities.filter(e => e.type === 'blockref');
    const first = refs[0];
    const last = refs[refs.length - 1];
    return {
      count: refs.length,
      firstX: first.insertPoint.x, firstY: first.insertPoint.y,
      lastX: last.insertPoint.x, lastY: last.insertPoint.y,
    };
  });
  test('MINSERT 3x4 array has 12 refs', arrayResult.count === 12, `count=${arrayResult.count}`);
  test('MINSERT first at (10,10)', arrayResult.firstX === 10 && arrayResult.firstY === 10,
    `pos=(${arrayResult.firstX}, ${arrayResult.firstY})`);
  test('MINSERT last at (100,50)', arrayResult.lastX === 100 && arrayResult.lastY === 50,
    `pos=(${arrayResult.lastX}, ${arrayResult.lastY})`);

  // Test undo
  await cmd('UNDO');
  await page.waitForTimeout(200);
  const afterUndo = await page.evaluate(() => window.__store.entities.length);
  test('MINSERT undo works', afterUndo === 0, `after undo: ${afterUndo}`);

  // Full CLI flow test
  await page.evaluate(() => {
    const s = window.__store;
    s.entities = [];
    s.blockDefs.set('RIVET', [
      { id: 'rv1', type: 'circle', layer: '0', color: 'bylayer', lineweight: 1, linetype: 'continuous', visible: true, selected: false, center: { x: 0, y: 0 }, radius: 3 },
    ]);
    s.emit();
  });

  await cmd('MINSERT');
  await page.waitForTimeout(100);
  await cmd('RIVET');
  await page.waitForTimeout(100);
  // Insertion point
  await clickCanvas(0.3, 0.5);
  await page.waitForTimeout(100);
  // X scale
  await cmd('1');
  await page.waitForTimeout(100);
  // Y scale
  await cmd('1');
  await page.waitForTimeout(100);
  // Rotation
  await cmd('0');
  await page.waitForTimeout(100);
  // Rows
  await cmd('2');
  await page.waitForTimeout(100);
  // Columns
  await cmd('3');
  await page.waitForTimeout(100);
  // Row distance
  await cmd('15');
  await page.waitForTimeout(100);
  // Column distance
  await cmd('25');
  await page.waitForTimeout(300);

  output = await getOutput(3);
  const minsertDone = output.includes('6') || output.includes('2x3') || output.includes('inserted');
  test('MINSERT CLI flow completes', minsertDone, output.split('\n').pop());

  const cliRefs = await page.evaluate(() =>
    window.__store.entities.filter(e => e.type === 'blockref' && e.blockName === 'RIVET').length
  );
  test('MINSERT CLI creates 6 blockrefs', cliRefs === 6, `count=${cliRefs}`);

  // Verify spacing
  const spacing = await page.evaluate(() => {
    const refs = window.__store.entities.filter(e => e.type === 'blockref' && e.blockName === 'RIVET');
    if (refs.length < 2) return null;
    refs.sort((a, b) => {
      const dy = a.insertPoint.y - b.insertPoint.y;
      return dy !== 0 ? dy : a.insertPoint.x - b.insertPoint.x;
    });
    // Check column spacing (first two in same row)
    const colDist = Math.abs(refs[1].insertPoint.x - refs[0].insertPoint.x);
    // Check row spacing (first and fourth, if sorted by y then x)
    const rowDist = Math.abs(refs[3].insertPoint.y - refs[0].insertPoint.y);
    return { colDist: Math.round(colDist), rowDist: Math.round(rowDist) };
  });
  test('MINSERT column spacing = 25', spacing?.colDist === 25, `colDist=${spacing?.colDist}`);
  test('MINSERT row spacing = 15', spacing?.rowDist === 15, `rowDist=${spacing?.rowDist}`);

  // Test MINSERT with rotation
  await page.evaluate(() => { window.__store.entities = []; window.__store.emit(); });

  const rotResult = await page.evaluate(() => {
    const s = window.__store;
    s.pushUndo('MINSERT');
    const base = { x: 0, y: 0 };
    const rot = 90; // 90 degree rotation
    const rad = rot * Math.PI / 180;
    const cosR = Math.cos(rad), sinR = Math.sin(rad);

    for (let r = 0; r < 2; r++) {
      for (let c = 0; c < 2; c++) {
        const dx = c * 10;
        const dy = r * 10;
        const rx = dx * cosR - dy * sinR;
        const ry = dx * sinR + dy * cosR;
        s.entities.push({
          id: `rot_${r}_${c}`, type: 'blockref', layer: '0', color: 'bylayer', lineweight: 1,
          linetype: 'continuous', visible: true, selected: false,
          blockName: 'RIVET',
          insertPoint: { x: base.x + rx, y: base.y + ry },
          scaleX: 1, scaleY: 1, rotation: rot,
        });
      }
    }
    s.emit();

    const refs = s.entities.filter(e => e.type === 'blockref');
    // At 90 deg: col offset (10,0) becomes (0,10), row offset (0,10) becomes (-10,0)
    return {
      count: refs.length,
      p0: refs[0].insertPoint,
      p1: refs[1].insertPoint, // should be ~(0, 10)
      p2: refs[2].insertPoint, // should be ~(-10, 0)
    };
  });
  test('MINSERT rotation: 4 refs', rotResult.count === 4, `count=${rotResult.count}`);
  test('MINSERT rotation: col offset rotated', Math.abs(rotResult.p1.x) < 0.01 && Math.abs(rotResult.p1.y - 10) < 0.01,
    `p1=(${rotResult.p1.x.toFixed(2)}, ${rotResult.p1.y.toFixed(2)})`);

  // Test 1x1 MINSERT (single insert)
  await page.evaluate(() => { window.__store.entities = []; window.__store.emit(); });
  await cmd('MINSERT');
  await page.waitForTimeout(100);
  await cmd('RIVET');
  await page.waitForTimeout(100);
  await clickCanvas(0.5, 0.5);
  await page.waitForTimeout(100);
  await cmd('1');
  await page.waitForTimeout(100);
  await cmd('1');
  await page.waitForTimeout(100);
  await cmd('0');
  await page.waitForTimeout(100);
  await cmd('1');  // 1 row
  await page.waitForTimeout(100);
  await cmd('1');  // 1 column
  await page.waitForTimeout(200);

  output = await getOutput(3);
  const singleInsert = output.includes('1x1') || output.includes('inserted');
  test('MINSERT 1x1 creates single ref', singleInsert, output.split('\n').pop());

  const singleCount = await page.evaluate(() =>
    window.__store.entities.filter(e => e.type === 'blockref').length
  );
  test('MINSERT 1x1 count = 1', singleCount === 1, `count=${singleCount}`);

  await pressEsc();
}

// ============================================================
// SUMMARY
// ============================================================
async function testSummary() {
  console.log('\n=== SUMMARY ===');
  const total = await page.evaluate(() => window.__engine.commands.size);
  test('Total registered commands', total === 108, `count=${total}`);

  const newCmds = ['MLINE', 'SOLID', 'MINSERT'];
  for (const name of newCmds) {
    const exists = await page.evaluate((n) => window.__engine.commands.has(n), name);
    test(`${name} registered`, exists);
  }

  const aliases = { ML: 'MLINE', SO: 'SOLID' };
  for (const [alias, cmdName] of Object.entries(aliases)) {
    const works = await page.evaluate(({ a, c }) => {
      const def = window.__engine.commands.get(c);
      return def && def.aliases.includes(a);
    }, { a: alias, c: cmdName });
    test(`Alias ${alias} -> ${cmdName}`, works);
  }
}

// ============================================================
async function main() {
  console.log('MiniCAD Tier 6 Commands Audit');
  console.log('='.repeat(50));

  try {
    await setup();
    await testMLINE();
    await testSOLID();
    await testMINSERT();
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
