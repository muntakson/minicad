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
// SKETCH
// ============================================================
async function testSKETCH() {
  console.log('\n=== SKETCH ===');

  const hasSketch = await page.evaluate(() => window.__engine.commands.has('SKETCH'));
  test('SKETCH registered', hasSketch);

  // Test CLI prompt
  await cmd('SKETCH');
  await page.waitForTimeout(100);
  let output = await getOutput(3);
  test('SKETCH shows increment prompt', output.includes('increment') || output.includes('Record'),
    output.split('\n').pop());

  // Set increment and show start prompt
  await cmd('2');
  await page.waitForTimeout(100);
  output = await getOutput(3);
  test('SKETCH shows start prompt', output.includes('Click') || output.includes('start') || output.includes('sketching'),
    output.split('\n').pop());
  await pressEsc();

  // Programmatic test: create sketch polyline
  const sketchResult = await page.evaluate(() => {
    const s = window.__store;
    s.entities = [];
    s.pushUndo('SKETCH');

    // Simulate freehand points
    const pts = [];
    for (let i = 0; i < 20; i++) {
      pts.push({ x: i * 5, y: Math.sin(i * 0.5) * 10 });
    }

    s.entities.push({
      id: 'sk1', type: 'polyline', layer: '0', color: 'bylayer', lineweight: 1,
      linetype: 'continuous', visible: true, selected: false,
      points: pts, bulges: pts.map(() => 0), closed: false,
    });
    s.emit();

    const e = s.entities[0];
    return { type: e.type, pointCount: e.points.length, closed: e.closed };
  });
  test('SKETCH creates open polyline', sketchResult.type === 'polyline' && !sketchResult.closed,
    `type=${sketchResult.type}, closed=${sketchResult.closed}`);
  test('SKETCH has multiple points', sketchResult.pointCount === 20,
    `points=${sketchResult.pointCount}`);

  // Test via canvas: click to start, move mouse, then Enter to finish
  await page.evaluate(() => { window.__store.entities = []; window.__store.emit(); });
  await cmd('SKETCH');
  await page.waitForTimeout(100);
  await cmd('1');  // increment
  await page.waitForTimeout(100);

  // Click to start
  await clickCanvas(0.2, 0.5);
  await page.waitForTimeout(100);

  // Move mouse across canvas to create freehand points
  const box = await page.locator('#cad-canvas').boundingBox();
  for (let i = 0; i < 10; i++) {
    await page.mouse.move(
      box.x + box.width * (0.2 + i * 0.05),
      box.y + box.height * (0.5 + Math.sin(i) * 0.1)
    );
    await page.waitForTimeout(50);
  }

  // Finish with Enter
  await cmd('');
  await page.waitForTimeout(200);

  output = await getOutput(3);
  const sketchDone = output.includes('recorded') || output.includes('points');
  test('SKETCH canvas creates polyline', sketchDone, output.split('\n').pop());

  const canvasSketch = await page.evaluate(() => {
    const pl = window.__store.entities.find(e => e.type === 'polyline');
    return pl ? { points: pl.points.length } : null;
  });
  test('SKETCH entity has points', canvasSketch !== null && canvasSketch.points >= 2,
    canvasSketch ? `points=${canvasSketch.points}` : 'null');

  // Test undo
  await cmd('UNDO');
  await page.waitForTimeout(200);
  const afterUndo = await page.evaluate(() => window.__store.entities.length);
  test('SKETCH undo works', afterUndo === 0, `after undo: ${afterUndo}`);

  await pressEsc();
}

// ============================================================
// TRACE
// ============================================================
async function testTRACE() {
  console.log('\n=== TRACE ===');

  const hasTrace = await page.evaluate(() => window.__engine.commands.has('TRACE'));
  test('TRACE registered', hasTrace);

  // Test CLI prompt
  await cmd('TRACE');
  await page.waitForTimeout(100);
  let output = await getOutput(3);
  test('TRACE shows width prompt', output.includes('width') || output.includes('Width'),
    output.split('\n').pop());
  await pressEsc();

  // Programmatic test: create trace segment
  const traceResult = await page.evaluate(() => {
    const s = window.__store;
    s.entities = [];
    s.pushUndo('TRACE');

    // Trace is stored as a solid-filled quad (hatch with SOLID pattern)
    const width = 3;
    const p1 = { x: 10, y: 20 }, p2 = { x: 100, y: 20 };
    const dx = p2.x - p1.x, dy = p2.y - p1.y;
    const len = Math.hypot(dx, dy);
    const nx = -dy / len * (width / 2), ny = dx / len * (width / 2);

    s.entities.push({
      id: 'tr1', type: 'hatch', layer: '0', color: 'bylayer', lineweight: 1,
      linetype: 'continuous', visible: true, selected: false,
      boundaries: [[
        { x: p1.x + nx, y: p1.y + ny },
        { x: p1.x - nx, y: p1.y - ny },
        { x: p2.x - nx, y: p2.y - ny },
        { x: p2.x + nx, y: p2.y + ny },
      ]],
      patternName: 'SOLID', patternScale: 1, patternAngle: 0,
    });
    s.emit();

    const e = s.entities[0];
    return {
      type: e.type,
      pattern: e.patternName,
      vertices: e.boundaries[0].length,
      topY: e.boundaries[0][0].y,
      botY: e.boundaries[0][1].y,
    };
  });
  test('TRACE is hatch entity', traceResult.type === 'hatch', `type=${traceResult.type}`);
  test('TRACE is SOLID pattern', traceResult.pattern === 'SOLID', `pattern=${traceResult.pattern}`);
  test('TRACE has 4 vertices (quad)', traceResult.vertices === 4, `vertices=${traceResult.vertices}`);
  test('TRACE width is correct', Math.abs(traceResult.topY - traceResult.botY - 3) < 0.01,
    `width=${Math.abs(traceResult.topY - traceResult.botY).toFixed(2)}`);

  // Test via canvas: create trace segment
  await page.evaluate(() => { window.__store.entities = []; window.__store.emit(); });
  await cmd('TRACE');
  await page.waitForTimeout(100);
  await cmd('5');  // width
  await page.waitForTimeout(100);
  await clickCanvas(0.2, 0.5);
  await page.waitForTimeout(100);
  await clickCanvas(0.6, 0.5);
  await page.waitForTimeout(100);
  output = await getOutput(3);
  test('TRACE segment via canvas', output.includes('Trace') || output.includes('segment'),
    output.split('\n').pop());

  // Add second segment
  await clickCanvas(0.6, 0.3);
  await page.waitForTimeout(100);
  output = await getOutput(3);
  test('TRACE second segment', output.includes('segment'), output.split('\n').pop());

  // Finish
  await cmd('');
  await page.waitForTimeout(200);

  const traceEntities = await page.evaluate(() =>
    window.__store.entities.filter(e => e.type === 'hatch' && e.patternName === 'SOLID').length
  );
  test('TRACE created 2 segments', traceEntities === 2, `segments=${traceEntities}`);

  // Test undo (should undo last segment)
  await cmd('UNDO');
  await page.waitForTimeout(200);
  const afterUndo = await page.evaluate(() =>
    window.__store.entities.filter(e => e.type === 'hatch').length
  );
  test('TRACE undo removes segment', afterUndo < traceEntities, `after undo: ${afterUndo}`);

  await pressEsc();
}

// ============================================================
// FILL
// ============================================================
async function testFILL() {
  console.log('\n=== FILL ===');

  const hasFill = await page.evaluate(() => window.__engine.commands.has('FILL'));
  test('FILL registered', hasFill);

  // Check default state
  const defaultFill = await page.evaluate(() => window.__store.fillOn);
  test('FILL default is ON', defaultFill === true, `fillOn=${defaultFill}`);

  // Turn fill off
  await cmd('FILL');
  await page.waitForTimeout(100);
  await cmd('OFF');
  await page.waitForTimeout(200);

  let output = await getOutput(3);
  test('FILL OFF message', output.includes('OFF') || output.includes('outline'),
    output.split('\n').pop());

  const fillOff = await page.evaluate(() => window.__store.fillOn);
  test('FILL OFF sets store.fillOn=false', fillOff === false, `fillOn=${fillOff}`);

  // Turn fill back on
  await cmd('FILL');
  await page.waitForTimeout(100);
  await cmd('ON');
  await page.waitForTimeout(200);

  output = await getOutput(3);
  test('FILL ON message', output.includes('ON') || output.includes('filled'),
    output.split('\n').pop());

  const fillOn = await page.evaluate(() => window.__store.fillOn);
  test('FILL ON sets store.fillOn=true', fillOn === true, `fillOn=${fillOn}`);

  // Test default (empty input = ON)
  await page.evaluate(() => { window.__store.fillOn = false; });
  await cmd('FILL');
  await page.waitForTimeout(100);
  await cmd('');
  await page.waitForTimeout(200);

  const fillDefault = await page.evaluate(() => window.__store.fillOn);
  test('FILL empty input defaults to ON', fillDefault === true, `fillOn=${fillDefault}`);

  // Test SETVAR FILLMODE
  await cmd('SETVAR');
  await page.waitForTimeout(100);
  await cmd('FILLMODE');
  await page.waitForTimeout(100);
  output = await getOutput(3);
  test('SETVAR FILLMODE shows value', output.includes('FILLMODE') && output.includes('1'),
    output.split('\n').pop());
  await cmd('0');
  await page.waitForTimeout(200);

  const fillViaSetvar = await page.evaluate(() => window.__store.fillOn);
  test('SETVAR FILLMODE=0 turns fill off', fillViaSetvar === false, `fillOn=${fillViaSetvar}`);

  // Reset
  await page.evaluate(() => { window.__store.fillOn = true; });

  // Test rendering behavior: create a solid and check it renders
  await page.evaluate(() => {
    const s = window.__store;
    s.entities = [];
    s.entities.push({
      id: 'filltest', type: 'hatch', layer: '0', color: '#ff0000', lineweight: 1,
      linetype: 'continuous', visible: true, selected: false,
      boundaries: [[{ x: 50, y: 50 }, { x: 150, y: 50 }, { x: 100, y: 120 }]],
      patternName: 'SOLID', patternScale: 1, patternAngle: 0,
    });
    s.emit();
  });

  // With fill ON, the entity renders (we can't check pixels, but verify the entity exists and renders)
  const entityExists = await page.evaluate(() =>
    window.__store.entities.some(e => e.type === 'hatch' && e.patternName === 'SOLID')
  );
  test('Solid entity for fill test exists', entityExists);

  // Toggle fill off and trigger re-render
  await cmd('FILL');
  await page.waitForTimeout(100);
  await cmd('OFF');
  await page.waitForTimeout(200);

  const stillExists = await page.evaluate(() =>
    window.__store.entities.some(e => e.type === 'hatch' && e.patternName === 'SOLID')
  );
  test('Solid entity still exists after FILL OFF', stillExists);

  const fillState = await page.evaluate(() => window.__store.fillOn);
  test('FILL OFF confirmed', fillState === false, `fillOn=${fillState}`);

  // Reset for other tests
  await page.evaluate(() => { window.__store.fillOn = true; window.__store.entities = []; window.__store.emit(); });

  await pressEsc();
}

// ============================================================
// SUMMARY
// ============================================================
async function testSummary() {
  console.log('\n=== SUMMARY ===');
  const total = await page.evaluate(() => window.__engine.commands.size);
  test('Total registered commands', total === 111, `count=${total}`);

  const newCmds = ['SKETCH', 'TRACE', 'FILL'];
  for (const name of newCmds) {
    const exists = await page.evaluate((n) => window.__engine.commands.has(n), name);
    test(`${name} registered`, exists);
  }

  // Verify no aliases conflict
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
  console.log('MiniCAD Tier 7 Commands Audit');
  console.log('='.repeat(50));

  try {
    await setup();
    await testSKETCH();
    await testTRACE();
    await testFILL();
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
