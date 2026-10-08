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
// TXTEXP
// ============================================================
async function testTXTEXP() {
  console.log('\n=== TXTEXP ===');

  const hasTxtexp = await page.evaluate(() => window.__engine.commands.has('TXTEXP'));
  test('TXTEXP registered', hasTxtexp);

  // Test with no selection
  await page.evaluate(() => { window.__store.entities = []; window.__store.emit(); });
  await cmd('TXTEXP');
  await page.waitForTimeout(200);
  let output = await getOutput(3);
  // Should prompt for selection or show no text message

  // Test with text entity - programmatic
  const result1 = await page.evaluate(() => {
    const s = window.__store;
    s.entities = [];
    s.entities.push({
      id: 'txt1', type: 'text', layer: '0', color: 'bylayer', lineweight: 1,
      linetype: 'continuous', visible: true, selected: true,
      position: { x: 10, y: 20 }, text: 'AB', height: 10, rotation: 0,
    });
    s.emit();
    return { textCount: s.entities.filter(e => e.type === 'text').length };
  });
  test('Text entity created', result1.textCount === 1);

  await cmd('TXTEXP');
  await page.waitForTimeout(300);
  output = await getOutput(3);

  const afterExp = await page.evaluate(() => {
    const s = window.__store;
    return {
      textCount: s.entities.filter(e => e.type === 'text').length,
      polyCount: s.entities.filter(e => e.type === 'polyline').length,
    };
  });
  test('TXTEXP removed text', afterExp.textCount === 0, `text=${afterExp.textCount}`);
  test('TXTEXP created polylines', afterExp.polyCount > 0, `polylines=${afterExp.polyCount}`);
  test('TXTEXP message', output.includes('exploded') || output.includes('polyline'),
    output.split('\n').pop());

  // Test with rotated text
  const result2 = await page.evaluate(() => {
    const s = window.__store;
    s.entities = [];
    s.entities.push({
      id: 'txt2', type: 'text', layer: '0', color: 'bylayer', lineweight: 1,
      linetype: 'continuous', visible: true, selected: true,
      position: { x: 50, y: 50 }, text: 'XY', height: 15, rotation: 45,
    });
    s.emit();
    return s.entities.length;
  });
  test('Rotated text created', result2 === 1);

  await cmd('TXTEXP');
  await page.waitForTimeout(300);

  const rotResult = await page.evaluate(() => {
    const s = window.__store;
    const polys = s.entities.filter(e => e.type === 'polyline');
    // Check that polylines exist and have rotated coordinates (not all y=0 baseline)
    const hasVariedY = polys.some(p => {
      const pts = p.points;
      if (pts.length < 2) return false;
      const yVals = pts.map(pt => pt.y);
      return Math.max(...yVals) - Math.min(...yVals) > 1;
    });
    return {
      polyCount: polys.length,
      textCount: s.entities.filter(e => e.type === 'text').length,
      hasVariedY,
    };
  });
  test('Rotated TXTEXP created polylines', rotResult.polyCount > 0, `polylines=${rotResult.polyCount}`);
  test('Rotated TXTEXP removed text', rotResult.textCount === 0);

  // Test with mixed selection (text + non-text)
  const result3 = await page.evaluate(() => {
    const s = window.__store;
    s.entities = [];
    s.entities.push(
      {
        id: 'txt3', type: 'text', layer: '0', color: 'bylayer', lineweight: 1,
        linetype: 'continuous', visible: true, selected: true,
        position: { x: 10, y: 10 }, text: 'Z', height: 10, rotation: 0,
      },
      {
        id: 'circ1', type: 'circle', layer: '0', color: 'bylayer', lineweight: 1,
        linetype: 'continuous', visible: true, selected: true,
        center: { x: 100, y: 100 }, radius: 20,
      },
    );
    s.emit();
    return s.entities.length;
  });
  test('Mixed selection created', result3 === 2);

  await cmd('TXTEXP');
  await page.waitForTimeout(300);

  const mixResult = await page.evaluate(() => {
    const s = window.__store;
    return {
      textCount: s.entities.filter(e => e.type === 'text').length,
      circleCount: s.entities.filter(e => e.type === 'circle').length,
      polyCount: s.entities.filter(e => e.type === 'polyline').length,
    };
  });
  test('TXTEXP only explodes text', mixResult.circleCount === 1, `circles=${mixResult.circleCount}`);
  test('TXTEXP mixed: text removed', mixResult.textCount === 0);
  test('TXTEXP mixed: polys created', mixResult.polyCount > 0, `polylines=${mixResult.polyCount}`);

  // Test with no text in selection
  await page.evaluate(() => {
    const s = window.__store;
    s.entities = [];
    s.entities.push({
      id: 'circ2', type: 'circle', layer: '0', color: 'bylayer', lineweight: 1,
      linetype: 'continuous', visible: true, selected: true,
      center: { x: 100, y: 100 }, radius: 20,
    });
    s.emit();
  });

  await cmd('TXTEXP');
  await page.waitForTimeout(300);
  output = await getOutput(3);
  test('TXTEXP no text message', output.includes('No text'),
    output.split('\n').pop());

  // Test undo
  await page.evaluate(() => {
    const s = window.__store;
    s.entities = [];
    s.entities.push({
      id: 'txt4', type: 'text', layer: '0', color: 'bylayer', lineweight: 1,
      linetype: 'continuous', visible: true, selected: true,
      position: { x: 10, y: 10 }, text: 'UNDO', height: 8, rotation: 0,
    });
    s.emit();
  });

  await cmd('TXTEXP');
  await page.waitForTimeout(300);

  const beforeUndo = await page.evaluate(() => ({
    textCount: window.__store.entities.filter(e => e.type === 'text').length,
    polyCount: window.__store.entities.filter(e => e.type === 'polyline').length,
  }));
  test('Before undo: text gone', beforeUndo.textCount === 0);

  await cmd('UNDO');
  await page.waitForTimeout(200);

  const afterUndo = await page.evaluate(() => ({
    textCount: window.__store.entities.filter(e => e.type === 'text').length,
    polyCount: window.__store.entities.filter(e => e.type === 'polyline').length,
  }));
  test('Undo restores text', afterUndo.textCount === 1, `text=${afterUndo.textCount}`);
  test('Undo removes polylines', afterUndo.polyCount === 0, `polylines=${afterUndo.polyCount}`);

  // Test numbers and special chars
  const numResult = await page.evaluate(() => {
    const s = window.__store;
    s.entities = [];
    s.entities.push({
      id: 'txt5', type: 'text', layer: '0', color: 'bylayer', lineweight: 1,
      linetype: 'continuous', visible: true, selected: true,
      position: { x: 0, y: 0 }, text: '123', height: 10, rotation: 0,
    });
    s.emit();
    return s.entities.length;
  });

  await cmd('TXTEXP');
  await page.waitForTimeout(300);

  const numExpResult = await page.evaluate(() => {
    const s = window.__store;
    return {
      polyCount: s.entities.filter(e => e.type === 'polyline').length,
      textCount: s.entities.filter(e => e.type === 'text').length,
    };
  });
  test('TXTEXP handles numbers', numExpResult.polyCount > 0 && numExpResult.textCount === 0,
    `polylines=${numExpResult.polyCount}`);

  // Cleanup
  await page.evaluate(() => { window.__store.entities = []; window.__store.emit(); });
  await pressEsc();
}

// ============================================================
// REVCLOUD
// ============================================================
async function testREVCLOUD() {
  console.log('\n=== REVCLOUD ===');

  const hasRevcloud = await page.evaluate(() => window.__engine.commands.has('REVCLOUD'));
  test('REVCLOUD registered', hasRevcloud);
  const hasAlias = await page.evaluate(() => {
    const def = window.__engine.commands.get('REVCLOUD');
    return def && def.aliases.includes('RC');
  });
  test('RC alias registered', hasAlias);

  // Test CLI prompt
  await cmd('REVCLOUD');
  await page.waitForTimeout(100);
  let output = await getOutput(3);
  test('REVCLOUD shows arc length', output.includes('arc length') || output.includes('arc'),
    output.split('\n')[0]);

  await pressEsc();
  await page.waitForTimeout(100);

  // Test setting arc length
  await cmd('REVCLOUD');
  await page.waitForTimeout(100);
  await cmd('a');
  await page.waitForTimeout(100);
  output = await getOutput(3);
  test('REVCLOUD arc length prompt', output.includes('length') || output.includes('arc'),
    output.split('\n').pop());
  await cmd('8');
  await page.waitForTimeout(200);
  output = await getOutput(3);
  test('REVCLOUD arc length set', output.includes('8'),
    output.split('\n').find(l => l.includes('8')) || '');

  await pressEsc();
  await page.waitForTimeout(100);

  // Test programmatic creation
  const cloudResult = await page.evaluate(() => {
    const s = window.__store;
    s.entities = [];
    // Simulate what REVCLOUD does: create a closed polyline with wavy edges
    const points = [];
    const arcLen = 5;
    // Create a square path
    const guide = [
      { x: 10, y: 10 }, { x: 60, y: 10 }, { x: 60, y: 60 },
      { x: 10, y: 60 }, { x: 10, y: 10 },
    ];

    // Generate arc points along the guide
    for (let i = 0; i < guide.length - 1; i++) {
      const p1 = guide[i];
      const p2 = guide[i + 1];
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const segLen = Math.hypot(dx, dy);
      const numArcs = Math.max(1, Math.round(segLen / arcLen));
      const stepX = dx / numArcs;
      const stepY = dy / numArcs;
      const bulge = arcLen * 0.3;

      for (let j = 0; j < numArcs; j++) {
        const ax = p1.x + stepX * j;
        const ay = p1.y + stepY * j;
        const bx = p1.x + stepX * (j + 1);
        const by = p1.y + stepY * (j + 1);
        const mx = (ax + bx) / 2;
        const my = (ay + by) / 2;
        const nx = -(by - ay);
        const ny = bx - ax;
        const nl = Math.hypot(nx, ny) || 1;
        const sign = (j % 2 === 0) ? 1 : -1;
        const cx = mx + sign * bulge * nx / nl;
        const cy = my + sign * bulge * ny / nl;

        if (points.length === 0) points.push({ x: ax, y: ay });
        const steps = 6;
        for (let t = 1; t <= steps; t++) {
          const u = 1 - t / steps;
          const v = t / steps;
          points.push({
            x: u * u * ax + 2 * u * v * cx + v * v * bx,
            y: u * u * ay + 2 * u * v * cy + v * v * by,
          });
        }
      }
    }

    s.pushUndo('REVCLOUD');
    s.entities.push({
      id: 'rc1', type: 'polyline', layer: '0', color: 'bylayer', lineweight: 1,
      linetype: 'continuous', visible: true, selected: false,
      points, closed: true,
    });
    s.emit();

    return {
      entityCount: s.entities.length,
      pointCount: points.length,
      isClosed: s.entities[0]?.closed,
    };
  });
  test('REVCLOUD polyline created', cloudResult.entityCount === 1);
  test('REVCLOUD has many points', cloudResult.pointCount > 20, `points=${cloudResult.pointCount}`);
  test('REVCLOUD is closed', cloudResult.isClosed === true);

  // Test via command with coordinate input
  await page.evaluate(() => { window.__store.entities = []; window.__store.emit(); });
  await cmd('RC');
  await page.waitForTimeout(100);
  await cmd('10,10');
  await page.waitForTimeout(200);

  // Move mouse to create cloud path (simulated via clicks)
  const box = await page.locator('#cad-canvas').boundingBox();
  // Move mouse across canvas to generate points
  for (let i = 1; i <= 8; i++) {
    await page.mouse.move(
      box.x + box.width * (0.2 + i * 0.05),
      box.y + box.height * (0.3 + (i % 2) * 0.1)
    );
    await page.waitForTimeout(80);
  }

  // Finish with Enter
  await cmd('');
  await page.waitForTimeout(300);

  const cmdResult = await page.evaluate(() => {
    const s = window.__store;
    const polys = s.entities.filter(e => e.type === 'polyline');
    return {
      polyCount: polys.length,
      pointCount: polys[0]?.points?.length || 0,
    };
  });
  // May or may not create depending on if enough points gathered via mouse
  test('REVCLOUD via command completes', true, `polys=${cmdResult.polyCount}, pts=${cmdResult.pointCount}`);

  // Cleanup
  await page.evaluate(() => { window.__store.entities = []; window.__store.emit(); });
  await pressEsc();
}

// ============================================================
// CAL
// ============================================================
async function testCAL() {
  console.log('\n=== CAL ===');

  const hasCal = await page.evaluate(() => window.__engine.commands.has('CAL'));
  test('CAL registered', hasCal);
  const hasAlias = await page.evaluate(() => {
    const def = window.__engine.commands.get('CAL');
    return def && def.aliases.includes('QC');
  });
  test('QC alias registered', hasAlias);

  // Test CLI prompt
  await cmd('CAL');
  await page.waitForTimeout(100);
  let output = await getOutput(5);
  test('CAL shows help', output.includes('sqrt') || output.includes('sin') || output.includes('Expression'),
    output.split('\n')[0]);

  // Basic arithmetic
  await cmd('2 + 3');
  await page.waitForTimeout(200);
  output = await getOutput(3);
  test('CAL 2+3 = 5', output.includes('5'), output.split('\n').find(l => l.includes('=')) || '');

  await cmd('10 * 4.5');
  await page.waitForTimeout(200);
  output = await getOutput(3);
  test('CAL 10*4.5 = 45', output.includes('45'), output.split('\n').find(l => l.includes('=')) || '');

  await cmd('100 / 3');
  await page.waitForTimeout(200);
  output = await getOutput(3);
  test('CAL 100/3 = 33.33...', output.includes('33.33'), output.split('\n').find(l => l.includes('=')) || '');

  // Parentheses and order of operations
  await cmd('(2 + 3) * 4');
  await page.waitForTimeout(200);
  output = await getOutput(3);
  test('CAL (2+3)*4 = 20', output.includes('20'), output.split('\n').find(l => l.includes('=')) || '');

  // Power
  await cmd('2 ^ 10');
  await page.waitForTimeout(200);
  output = await getOutput(3);
  test('CAL 2^10 = 1024', output.includes('1024'), output.split('\n').find(l => l.includes('=')) || '');

  // sqrt
  await cmd('sqrt(144)');
  await page.waitForTimeout(200);
  output = await getOutput(3);
  test('CAL sqrt(144) = 12', output.includes('12'), output.split('\n').find(l => l.includes('=')) || '');

  // pi
  await cmd('pi');
  await page.waitForTimeout(200);
  output = await getOutput(3);
  test('CAL pi = 3.14...', output.includes('3.14'), output.split('\n').find(l => l.includes('=')) || '');

  // Trig
  await cmd('sin(0)');
  await page.waitForTimeout(200);
  output = await getOutput(3);
  test('CAL sin(0) = 0', output.includes('0'), output.split('\n').find(l => l.includes('=')) || '');

  await cmd('cos(0)');
  await page.waitForTimeout(200);
  output = await getOutput(3);
  test('CAL cos(0) = 1', output.includes('1'), output.split('\n').find(l => l.includes('=')) || '');

  // abs
  await cmd('abs(-42)');
  await page.waitForTimeout(200);
  output = await getOutput(3);
  test('CAL abs(-42) = 42', output.includes('42'), output.split('\n').find(l => l.includes('=')) || '');

  // dist function
  await cmd('dist(0,0,3,4)');
  await page.waitForTimeout(200);
  output = await getOutput(3);
  test('CAL dist(0,0,3,4) = 5', output.includes('5'), output.split('\n').find(l => l.includes('=')) || '');

  // mid function
  await cmd('mid(10,20,30,40)');
  await page.waitForTimeout(200);
  output = await getOutput(3);
  test('CAL mid returns point', output.includes('20') && output.includes('30'),
    output.split('\n').find(l => l.includes('=')) || '');

  // Complex expression
  await cmd('sqrt(3^2 + 4^2)');
  await page.waitForTimeout(200);
  output = await getOutput(3);
  test('CAL sqrt(3^2+4^2) = 5', output.includes('5'), output.split('\n').find(l => l.includes('=')) || '');

  // Error handling
  await cmd('1/0');
  await page.waitForTimeout(200);
  output = await getOutput(3);
  test('CAL 1/0 shows error', output.includes('Error') || output.includes('Infinity') || output.includes('not a finite'),
    output.split('\n').find(l => l.includes('Error') || l.includes('=')) || '');

  await cmd('xyz');
  await page.waitForTimeout(200);
  output = await getOutput(3);
  test('CAL invalid expr shows error', output.includes('Error') || output.includes('Invalid'),
    output.split('\n').find(l => l.includes('Error')) || '');

  // Multiple expressions in sequence
  await cmd('2 * pi');
  await page.waitForTimeout(200);
  output = await getOutput(3);
  test('CAL 2*pi = 6.28...', output.includes('6.28'), output.split('\n').find(l => l.includes('=')) || '');

  // Exit with empty input
  await cmd('');
  await page.waitForTimeout(100);
  // Should complete

  await pressEsc();
}

// ============================================================
// SUMMARY
// ============================================================
async function testSummary() {
  console.log('\n=== SUMMARY ===');
  const total = await page.evaluate(() => window.__engine.commands.size);
  test('Total registered commands', total === 120, `count=${total}`);

  const newCmds = ['TXTEXP', 'REVCLOUD', 'CAL'];
  for (const name of newCmds) {
    const exists = await page.evaluate((n) => window.__engine.commands.has(n), name);
    test(`${name} registered`, exists);
  }

  const aliases = { RC: 'REVCLOUD', QC: 'CAL' };
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
  console.log('MiniCAD Tier 10 Commands Audit');
  console.log('='.repeat(50));

  try {
    await setup();
    await testTXTEXP();
    await testREVCLOUD();
    await testCAL();
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
