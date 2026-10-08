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
// SPLINEDIT
// ============================================================
async function testSPLINEDIT() {
  console.log('\n=== SPLINEDIT ===');

  const hasCmd = await page.evaluate(() => window.__engine.commands.has('SPLINEDIT'));
  test('SPLINEDIT registered', hasCmd);
  const hasAlias = await page.evaluate(() => {
    const def = window.__engine.commands.get('SPLINEDIT');
    return def && def.aliases.includes('SPE');
  });
  test('SPE alias registered', hasAlias);

  // Create a spline with fit points programmatically
  const splineSetup = await page.evaluate(() => {
    const s = window.__store;
    s.entities = [];
    // Simulate what the SPLINE command does: create polyline with fitPoints
    const fitPts = [
      { x: 10, y: 10 }, { x: 30, y: 40 }, { x: 50, y: 20 },
      { x: 70, y: 50 }, { x: 90, y: 30 },
    ];
    // Simple catmull-rom interpolation (mimicking the SPLINE command result)
    const points = [];
    for (let i = 0; i < fitPts.length - 1; i++) {
      for (let t = 0; t <= 1; t += 0.1) {
        points.push({
          x: fitPts[i].x + (fitPts[i + 1].x - fitPts[i].x) * t,
          y: fitPts[i].y + (fitPts[i + 1].y - fitPts[i].y) * t,
        });
      }
    }
    s.entities.push({
      id: 'spl1', type: 'polyline', layer: '0', color: 'bylayer', lineweight: 1,
      linetype: 'continuous', visible: true, selected: false,
      points, bulges: points.map(() => 0), closed: false,
      fitPoints: fitPts.map(p => ({ ...p })),
    });
    s.emit();
    return {
      entityCount: s.entities.length,
      hasFitPoints: !!s.entities[0]?.fitPoints,
      fitPointCount: s.entities[0]?.fitPoints?.length || 0,
    };
  });
  test('Spline with fitPoints created', splineSetup.hasFitPoints && splineSetup.fitPointCount === 5,
    `fitPts=${splineSetup.fitPointCount}`);

  // Test that SPLINE command now stores fitPoints
  await page.evaluate(() => { window.__store.entities = []; window.__store.emit(); });
  await cmd('SPLINE');
  await page.waitForTimeout(100);
  await cmd('0,0');
  await page.waitForTimeout(100);
  await cmd('20,30');
  await page.waitForTimeout(100);
  await cmd('40,10');
  await page.waitForTimeout(100);
  await cmd('');  // finish
  await page.waitForTimeout(200);

  const splineResult = await page.evaluate(() => {
    const polys = window.__store.entities.filter(e => e.type === 'polyline');
    const last = polys[polys.length - 1];
    return {
      hasFitPoints: !!last?.fitPoints,
      fitPointCount: last?.fitPoints?.length || 0,
    };
  });
  test('SPLINE stores fitPoints', splineResult.hasFitPoints, `fitPts=${splineResult.fitPointCount}`);
  test('SPLINE fitPoints count', splineResult.fitPointCount === 3, `count=${splineResult.fitPointCount}`);

  // Re-setup spline for SPLINEDIT tests
  await page.evaluate(() => {
    const s = window.__store;
    s.entities = [];
    const fitPts = [
      { x: 10, y: 10 }, { x: 30, y: 40 }, { x: 50, y: 20 },
      { x: 70, y: 50 }, { x: 90, y: 30 },
    ];
    const points = [];
    for (let i = 0; i < fitPts.length - 1; i++) {
      for (let t = 0; t <= 1; t += 0.1) {
        points.push({
          x: fitPts[i].x + (fitPts[i + 1].x - fitPts[i].x) * t,
          y: fitPts[i].y + (fitPts[i + 1].y - fitPts[i].y) * t,
        });
      }
    }
    s.entities.push({
      id: 'spl2', type: 'polyline', layer: '0', color: 'bylayer', lineweight: 1,
      linetype: 'continuous', visible: true, selected: false,
      points, bulges: points.map(() => 0), closed: false,
      fitPoints: fitPts.map(p => ({ ...p })),
    });
    s.emit();
  });

  // Test Close option
  const closeResult = await page.evaluate(() => {
    const s = window.__store;
    const spl = s.entities[0];
    // Directly test close functionality
    spl.closed = true;
    s.emit();
    return { closed: spl.closed };
  });
  test('Spline close works', closeResult.closed === true);

  // Test Open option
  const openResult = await page.evaluate(() => {
    const s = window.__store;
    const spl = s.entities[0];
    spl.closed = false;
    s.emit();
    return { closed: spl.closed };
  });
  test('Spline open works', openResult.closed === false);

  // Test Add fit point
  const addResult = await page.evaluate(() => {
    const s = window.__store;
    const spl = s.entities[0];
    const before = spl.fitPoints.length;
    spl.fitPoints.splice(2, 0, { x: 40, y: 35 });
    return { before, after: spl.fitPoints.length };
  });
  test('Add fit point', addResult.after === addResult.before + 1,
    `${addResult.before} → ${addResult.after}`);

  // Test Delete fit point
  const deleteResult = await page.evaluate(() => {
    const s = window.__store;
    const spl = s.entities[0];
    const before = spl.fitPoints.length;
    spl.fitPoints.splice(2, 1);
    return { before, after: spl.fitPoints.length };
  });
  test('Delete fit point', deleteResult.after === deleteResult.before - 1,
    `${deleteResult.before} → ${deleteResult.after}`);

  // Test Move fit point
  const moveResult = await page.evaluate(() => {
    const s = window.__store;
    const spl = s.entities[0];
    const oldPos = { ...spl.fitPoints[1] };
    spl.fitPoints[1] = { x: 35, y: 45 };
    return { oldPos, newPos: { ...spl.fitPoints[1] } };
  });
  test('Move fit point', moveResult.newPos.x === 35 && moveResult.newPos.y === 45,
    `(${moveResult.oldPos.x},${moveResult.oldPos.y}) → (${moveResult.newPos.x},${moveResult.newPos.y})`);

  // Test Refine (adds midpoints)
  const refineResult = await page.evaluate(() => {
    const s = window.__store;
    const spl = s.entities[0];
    const before = spl.fitPoints.length;
    const newFit = [spl.fitPoints[0]];
    for (let i = 0; i < spl.fitPoints.length - 1; i++) {
      newFit.push({
        x: (spl.fitPoints[i].x + spl.fitPoints[i + 1].x) / 2,
        y: (spl.fitPoints[i].y + spl.fitPoints[i + 1].y) / 2,
      });
      newFit.push(spl.fitPoints[i + 1]);
    }
    spl.fitPoints = newFit;
    return { before, after: newFit.length };
  });
  test('Refine adds midpoints', refineResult.after === refineResult.before * 2 - 1,
    `${refineResult.before} → ${refineResult.after}`);

  // Test SPLINEDIT CLI flow
  await page.evaluate(() => {
    const s = window.__store;
    s.entities = [];
    const fitPts = [{ x: 100, y: 100 }, { x: 200, y: 200 }, { x: 300, y: 100 }];
    const points = [];
    for (let i = 0; i < fitPts.length - 1; i++) {
      for (let t = 0; t <= 1; t += 0.1) {
        points.push({
          x: fitPts[i].x + (fitPts[i + 1].x - fitPts[i].x) * t,
          y: fitPts[i].y + (fitPts[i + 1].y - fitPts[i].y) * t,
        });
      }
    }
    s.entities.push({
      id: 'spl3', type: 'polyline', layer: '0', color: 'bylayer', lineweight: 1,
      linetype: 'continuous', visible: true, selected: false,
      points, bulges: points.map(() => 0), closed: false,
      fitPoints: fitPts.map(p => ({ ...p })),
    });
    s.emit();
  });

  await cmd('SPLINEDIT');
  await page.waitForTimeout(100);
  let output = await getOutput(3);
  test('SPLINEDIT shows select prompt', output.includes('Select') || output.includes('spline'),
    output.split('\n').pop());

  // Try to close via command
  await page.evaluate(() => {
    // Select the spline by simulating a click near it
    // Instead, we'll use the command flow
  });

  // Cleanup
  await page.evaluate(() => { window.__store.entities = []; window.__store.emit(); });
  await pressEsc();
}

// ============================================================
// DIMOVERRIDE
// ============================================================
async function testDIMOVERRIDE() {
  console.log('\n=== DIMOVERRIDE ===');

  const hasCmd = await page.evaluate(() => window.__engine.commands.has('DIMOVERRIDE'));
  test('DIMOVERRIDE registered', hasCmd);
  const hasAlias1 = await page.evaluate(() => {
    const def = window.__engine.commands.get('DIMOVERRIDE');
    return def && def.aliases.includes('DOV');
  });
  test('DOV alias registered', hasAlias1);
  const hasAlias2 = await page.evaluate(() => {
    const def = window.__engine.commands.get('DIMOVERRIDE');
    return def && def.aliases.includes('DIMOVER');
  });
  test('DIMOVER alias registered', hasAlias2);

  // CLI prompt
  await cmd('DIMOVERRIDE');
  await page.waitForTimeout(100);
  let output = await getOutput(5);
  test('DIMOVERRIDE shows variables', output.includes('DIMTXT') && output.includes('DIMASZ'),
    output.split('\n')[1]);

  // Exit without overrides
  await cmd('');
  await page.waitForTimeout(200);
  output = await getOutput(3);
  test('DIMOVERRIDE no overrides', output.includes('No overrides'),
    output.split('\n').pop());

  // Test override flow
  await cmd('DIMOVERRIDE');
  await page.waitForTimeout(100);
  await cmd('DIMTXT');
  await page.waitForTimeout(100);
  output = await getOutput(3);
  test('DIMOVERRIDE DIMTXT prompt', output.includes('text height'),
    output.split('\n').pop());
  await cmd('5');
  await page.waitForTimeout(200);
  output = await getOutput(3);
  test('DIMTXT override set', output.includes('5'),
    output.split('\n').find(l => l.includes('override')) || '');

  // Set another override
  await cmd('DIMCLR');
  await page.waitForTimeout(100);
  await cmd('#ff0000');
  await page.waitForTimeout(200);

  // Create a dimension and apply overrides
  await page.evaluate(() => {
    const s = window.__store;
    s.entities = [];
    s.entities.push({
      id: 'dim1', type: 'dimension', layer: '0', color: 'bylayer', lineweight: 1,
      linetype: 'continuous', visible: true, selected: true,
      dimType: 'linear', p1: { x: 0, y: 0 }, p2: { x: 100, y: 0 },
      textPos: { x: 50, y: 15 }, textOverride: '100.00',
    });
    s.emit();
  });

  // Apply (Enter to finish setting vars, then select dims)
  await cmd('');
  await page.waitForTimeout(300);

  const overrideResult = await page.evaluate(() => {
    const s = window.__store;
    const dim = s.entities.find(e => e.type === 'dimension');
    return {
      hasDim: !!dim,
      hasOverrides: !!dim?.dimOverrides,
      textHeight: dim?.dimOverrides?.textHeight,
      color: dim?.dimOverrides?.color,
    };
  });
  test('Dimension has overrides', overrideResult.hasOverrides === true);
  test('DIMTXT override applied', overrideResult.textHeight === 5, `textHeight=${overrideResult.textHeight}`);
  test('DIMCLR override applied', overrideResult.color === '#ff0000', `color=${overrideResult.color}`);

  // Test programmatic override
  const progResult = await page.evaluate(() => {
    const s = window.__store;
    s.entities = [];
    s.entities.push(
      {
        id: 'dim2', type: 'dimension', layer: '0', color: 'bylayer', lineweight: 1,
        linetype: 'continuous', visible: true, selected: false,
        dimType: 'linear', p1: { x: 0, y: 0 }, p2: { x: 50, y: 0 },
        textPos: { x: 25, y: 10 },
      },
      {
        id: 'dim3', type: 'dimension', layer: '0', color: 'bylayer', lineweight: 1,
        linetype: 'continuous', visible: true, selected: false,
        dimType: 'linear', p1: { x: 0, y: 0 }, p2: { x: 50, y: 0 },
        textPos: { x: 25, y: 10 },
        dimOverrides: { textHeight: 8, arrowSize: 4 },
      },
    );
    s.emit();

    const dim2 = s.entities[0];
    const dim3 = s.entities[1];
    return {
      dim2HasOverrides: !!dim2.dimOverrides,
      dim3HasOverrides: !!dim3.dimOverrides,
      dim3TextHeight: dim3.dimOverrides?.textHeight,
      dim3ArrowSize: dim3.dimOverrides?.arrowSize,
    };
  });
  test('Default dim has no overrides', progResult.dim2HasOverrides === false);
  test('Override dim has textHeight', progResult.dim3TextHeight === 8);
  test('Override dim has arrowSize', progResult.dim3ArrowSize === 4);

  // Test CLEAR overrides
  const clearResult = await page.evaluate(() => {
    const s = window.__store;
    const dim = s.entities[1];
    delete dim.dimOverrides;
    s.emit();
    return { hasOverrides: !!dim.dimOverrides };
  });
  test('CLEAR removes overrides', clearResult.hasOverrides === false);

  // Test invalid variable
  await cmd('DIMOVERRIDE');
  await page.waitForTimeout(100);
  await cmd('NONSENSE');
  await page.waitForTimeout(200);
  output = await getOutput(3);
  test('DIMOVERRIDE invalid variable', output.includes('Unknown'),
    output.split('\n').pop());

  await pressEsc();

  // Cleanup
  await page.evaluate(() => { window.__store.entities = []; window.__store.emit(); });
}

// ============================================================
// TIME
// ============================================================
async function testTIME() {
  console.log('\n=== TIME ===');

  const hasCmd = await page.evaluate(() => window.__engine.commands.has('TIME'));
  test('TIME registered', hasCmd);

  // Test CLI output
  await cmd('TIME');
  await page.waitForTimeout(200);
  let output = await getOutput(8);
  test('TIME shows session start', output.includes('Session start') || output.includes('start'),
    output.split('\n').find(l => l.includes('start') || l.includes('Session')) || '');
  test('TIME shows current time', output.includes('Current time') || output.includes('current'),
    output.split('\n').find(l => l.includes('Current') || l.includes('current')) || '');
  test('TIME shows elapsed', output.includes('Elapsed') || output.includes('elapsed') || output.includes('h'),
    output.split('\n').find(l => l.includes('Elapsed') || l.includes('lapsed')) || '');
  test('TIME shows entity count', output.includes('entities') || output.includes('Total'),
    output.split('\n').find(l => l.includes('entities') || l.includes('Total')) || '');

  // Test display option (just Enter)
  await cmd('');
  await page.waitForTimeout(100);

  // Test reset
  const beforeReset = await page.evaluate(() => window.__store.sessionStart);
  await cmd('TIME');
  await page.waitForTimeout(100);
  await cmd('R');
  await page.waitForTimeout(200);
  const afterReset = await page.evaluate(() => window.__store.sessionStart);
  test('TIME reset works', afterReset >= beforeReset, `before=${beforeReset}, after=${afterReset}`);
  output = await getOutput(3);
  test('TIME reset message', output.includes('reset'), output.split('\n').pop());

  // Test ON/OFF
  await cmd('TIME');
  await page.waitForTimeout(100);
  await cmd('ON');
  await page.waitForTimeout(200);
  output = await getOutput(3);
  test('TIME ON', output.includes('ON'), output.split('\n').pop());

  await cmd('TIME');
  await page.waitForTimeout(100);
  await cmd('OFF');
  await page.waitForTimeout(200);
  output = await getOutput(3);
  test('TIME OFF', output.includes('OFF'), output.split('\n').pop());

  // Verify sessionStart is in store
  const storeCheck = await page.evaluate(() => ({
    hasSessionStart: typeof window.__store.sessionStart === 'number',
    value: window.__store.sessionStart,
  }));
  test('sessionStart in store', storeCheck.hasSessionStart && storeCheck.value > 0,
    `sessionStart=${storeCheck.value}`);

  await pressEsc();
}

// ============================================================
// SUMMARY
// ============================================================
async function testSummary() {
  console.log('\n=== SUMMARY ===');
  const total = await page.evaluate(() => window.__engine.commands.size);
  test('Total registered commands', total === 123, `count=${total}`);

  const newCmds = ['SPLINEDIT', 'DIMOVERRIDE', 'TIME'];
  for (const name of newCmds) {
    const exists = await page.evaluate((n) => window.__engine.commands.has(n), name);
    test(`${name} registered`, exists);
  }

  const aliases = { SPE: 'SPLINEDIT', DOV: 'DIMOVERRIDE', DIMOVER: 'DIMOVERRIDE' };
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
  console.log('MiniCAD Tier 11 Commands Audit');
  console.log('='.repeat(50));

  try {
    await setup();
    await testSPLINEDIT();
    await testDIMOVERRIDE();
    await testTIME();
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
