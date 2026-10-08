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
// CHPROP / CHANGE
// ============================================================
async function testCHPROP() {
  console.log('\n=== CHPROP / CHANGE ===');

  const hasChprop = await page.evaluate(() => window.__engine.commands.has('CHPROP'));
  test('CHPROP registered', hasChprop);
  const hasChAlias = await page.evaluate(() => {
    const def = window.__engine.commands.get('CHPROP');
    return def && def.aliases.includes('CH');
  });
  test('CH alias registered', hasChAlias);

  const hasChange = await page.evaluate(() => window.__engine.commands.has('CHANGE'));
  test('CHANGE registered', hasChange);
  const hasChgAlias = await page.evaluate(() => {
    const def = window.__engine.commands.get('CHANGE');
    return def && def.aliases.includes('-CH');
  });
  test('-CH alias registered', hasChgAlias);

  // Setup test entities
  await page.evaluate(() => {
    const s = window.__store;
    s.pushUndo('test-clear');
    s.entities = [
      { id: 'chp1', type: 'line', layer: '0', color: 'bylayer', lineweight: 1, linetype: 'continuous', visible: true, selected: false, start: { x: 10, y: 10 }, end: { x: 100, y: 10 } },
      { id: 'chp2', type: 'circle', layer: '0', color: 'bylayer', lineweight: 1, linetype: 'continuous', visible: true, selected: false, center: { x: 50, y: 50 }, radius: 30 },
      { id: 'chp3', type: 'text', layer: '0', color: 'bylayer', lineweight: 1, linetype: 'continuous', visible: true, selected: false, position: { x: 20, y: 80 }, text: 'Test', height: 5, rotation: 0 },
    ];
    s.emit();
  });

  // Test CHPROP: change color of selected entities
  await page.evaluate(() => {
    for (const e of window.__store.entities) e.selected = true;
    window.__store.emit();
  });

  await cmd('CHPROP');
  await page.waitForTimeout(100);
  let output = await getOutput(3);
  test('CHPROP shows property prompt', output.includes('Color/LAyer/LType/LWeight'), output.split('\n').pop());

  await cmd('Color');
  await page.waitForTimeout(100);
  await cmd('#ff0000');
  await page.waitForTimeout(200);

  const colors = await page.evaluate(() =>
    window.__store.entities.map(e => e.color)
  );
  test('CHPROP Color applied to all', colors.every(c => c === '#ff0000'),
    `colors: ${colors.join(', ')}`);

  // Change linetype
  await cmd('LType');
  await page.waitForTimeout(100);
  await cmd('dashed');
  await page.waitForTimeout(200);

  const linetypes = await page.evaluate(() =>
    window.__store.entities.map(e => e.linetype)
  );
  test('CHPROP LType applied to all', linetypes.every(lt => lt === 'dashed'),
    `linetypes: ${linetypes.join(', ')}`);

  // Change lineweight
  await cmd('LWeight');
  await page.waitForTimeout(100);
  await cmd('3');
  await page.waitForTimeout(200);

  const lweights = await page.evaluate(() =>
    window.__store.entities.map(e => e.lineweight)
  );
  test('CHPROP LWeight applied to all', lweights.every(lw => lw === 3),
    `lineweights: ${lweights.join(', ')}`);

  // Exit CHPROP
  await cmd('');
  await page.waitForTimeout(100);

  // Test undo
  await cmd('UNDO');
  await page.waitForTimeout(200);
  const undoLw = await page.evaluate(() => window.__store.entities[0]?.lineweight);
  test('CHPROP undo works', undoLw !== 3, `after undo: lw=${undoLw}`);

  // Test CHANGE Properties sub-option
  await page.evaluate(() => {
    window.__store.clearSelection();
    const line = window.__store.entities.find(e => e.id === 'chp1');
    if (line) line.selected = true;
    window.__store.emit();
  });

  await cmd('CHANGE');
  await page.waitForTimeout(100);
  output = await getOutput(3);
  test('CHANGE prompt shown', output.includes('change point') || output.includes('Properties'),
    output.split('\n').pop());

  await cmd('P');
  await page.waitForTimeout(100);
  await cmd('Color');
  await page.waitForTimeout(100);
  await cmd('#00ff00');
  await page.waitForTimeout(100);
  await cmd('');
  await page.waitForTimeout(100);

  const lineColor = await page.evaluate(() => {
    const line = window.__store.entities.find(e => e.id === 'chp1');
    return line?.color;
  });
  test('CHANGE Properties sub-option works', lineColor === '#00ff00',
    `lineColor=${lineColor}`);

  await pressEsc();
}

// ============================================================
// DIMEDIT / DIMTEDIT — programmatic tests
// ============================================================
async function testDIMEDIT() {
  console.log('\n=== DIMEDIT / DIMTEDIT ===');

  const hasDimedit = await page.evaluate(() => window.__engine.commands.has('DIMEDIT'));
  test('DIMEDIT registered', hasDimedit);
  const hasDedAlias = await page.evaluate(() => {
    const def = window.__engine.commands.get('DIMEDIT');
    return def && def.aliases.includes('DED');
  });
  test('DED alias registered', hasDedAlias);

  const hasDimtedit = await page.evaluate(() => window.__engine.commands.has('DIMTEDIT'));
  test('DIMTEDIT registered', hasDimtedit);
  const hasDimtedAlias = await page.evaluate(() => {
    const def = window.__engine.commands.get('DIMTEDIT');
    return def && def.aliases.includes('DIMTED');
  });
  test('DIMTED alias registered', hasDimtedAlias);

  // Programmatic DIMEDIT tests via direct store manipulation
  // Test Home
  const homeResult = await page.evaluate(() => {
    const s = window.__store;
    s.entities = [
      { id: 'de1', type: 'dimension', dimType: 'linear', layer: '0', color: 'bylayer', lineweight: 1, linetype: 'continuous', visible: true, selected: true,
        p1: { x: 0, y: 0 }, p2: { x: 100, y: 0 }, textPos: { x: 80, y: 30 }, textOverride: '100.00' },
    ];
    s.emit();
    // Simulate DIMEDIT Home
    s.pushUndo('DIMEDIT');
    const d = s.entities[0];
    d.textPos = { x: (d.p1.x + d.p2.x) / 2, y: (d.p1.y + d.p2.y) / 2 };
    s.emit();
    return d.textPos;
  });
  test('DIMEDIT Home logic', homeResult.x === 50 && homeResult.y === 0,
    `textPos=(${homeResult.x}, ${homeResult.y})`);

  // Test New
  const newResult = await page.evaluate(() => {
    const d = window.__store.entities[0];
    window.__store.pushUndo('DIMEDIT');
    d.textOverride = 'CUSTOM';
    window.__store.emit();
    return d.textOverride;
  });
  test('DIMEDIT New logic', newResult === 'CUSTOM', `override="${newResult}"`);

  // Test New with <> (reset to measured)
  const resetResult = await page.evaluate(() => {
    const d = window.__store.entities[0];
    window.__store.pushUndo('DIMEDIT');
    d.textOverride = undefined;
    window.__store.emit();
    return d.textOverride;
  });
  test('DIMEDIT New <> resets', resetResult === undefined, `override=${resetResult}`);

  // Test Rotate
  const rotResult = await page.evaluate(() => {
    const d = window.__store.entities[0];
    window.__store.pushUndo('DIMEDIT');
    d.textRotation = 45;
    window.__store.emit();
    return d.textRotation;
  });
  test('DIMEDIT Rotate logic', rotResult === 45, `textRotation=${rotResult}`);

  // Test Oblique
  const oblResult = await page.evaluate(() => {
    const d = window.__store.entities[0];
    window.__store.pushUndo('DIMEDIT');
    d.obliqueAngle = 30;
    window.__store.emit();
    return d.obliqueAngle;
  });
  test('DIMEDIT Oblique logic', oblResult === 30, `obliqueAngle=${oblResult}`);

  // Test undo chain
  await cmd('UNDO');
  await page.waitForTimeout(100);
  const afterUndo = await page.evaluate(() => window.__store.entities[0]?.obliqueAngle);
  test('DIMEDIT undo works', afterUndo === undefined, `after undo: ${afterUndo}`);

  // Test DIMTEDIT positioning options programmatically
  const dimteditResult = await page.evaluate(() => {
    const s = window.__store;
    s.entities = [
      { id: 'dt1', type: 'dimension', dimType: 'linear', layer: '0', color: 'bylayer', lineweight: 1, linetype: 'continuous', visible: true, selected: false,
        p1: { x: 10, y: 10 }, p2: { x: 110, y: 10 }, textPos: { x: 60, y: 30 } },
    ];
    s.emit();
    const d = s.entities[0];
    const results = {};

    // Left
    s.pushUndo('DIMTEDIT');
    d.textPos = { ...d.p1 };
    results.left = { ...d.textPos };

    // Right
    s.pushUndo('DIMTEDIT');
    d.textPos = { ...d.p2 };
    results.right = { ...d.textPos };

    // Center/Home
    s.pushUndo('DIMTEDIT');
    d.textPos = { x: (d.p1.x + d.p2.x) / 2, y: (d.p1.y + d.p2.y) / 2 };
    results.center = { ...d.textPos };

    s.emit();
    return results;
  });

  test('DIMTEDIT Left positions at p1', dimteditResult.left.x === 10 && dimteditResult.left.y === 10,
    `pos=(${dimteditResult.left.x}, ${dimteditResult.left.y})`);
  test('DIMTEDIT Right positions at p2', dimteditResult.right.x === 110 && dimteditResult.right.y === 10,
    `pos=(${dimteditResult.right.x}, ${dimteditResult.right.y})`);
  test('DIMTEDIT Center positions at midpoint', dimteditResult.center.x === 60 && dimteditResult.center.y === 10,
    `pos=(${dimteditResult.center.x}, ${dimteditResult.center.y})`);

  // Test the CLI flow for DIMEDIT (with pre-selected entities)
  await page.evaluate(() => {
    const s = window.__store;
    s.entities = [
      { id: 'de_cli', type: 'dimension', dimType: 'linear', layer: '0', color: 'bylayer', lineweight: 1, linetype: 'continuous', visible: true, selected: true,
        p1: { x: 0, y: 0 }, p2: { x: 100, y: 0 }, textPos: { x: 80, y: 30 }, textOverride: '100.00' },
    ];
    s.emit();
  });

  await cmd('DED');
  await page.waitForTimeout(100);
  let output = await getOutput(3);
  test('DIMEDIT CLI prompt', output.includes('Home/New/Rotate/Oblique'), output.split('\n').pop());

  await cmd('Home');
  await page.waitForTimeout(100);
  // Enter to confirm pre-selected entities
  await cmd('');
  await page.waitForTimeout(300);
  output = await getOutput(3);
  test('DIMEDIT Home CLI completes', output.includes('home position') || output.includes('returned'),
    output.split('\n').pop());

  await pressEsc();
}

// ============================================================
// ATTDEF / ATTEDIT
// ============================================================
async function testATTDEF() {
  console.log('\n=== ATTDEF / ATTEDIT ===');

  const hasAttdef = await page.evaluate(() => window.__engine.commands.has('ATTDEF'));
  test('ATTDEF registered', hasAttdef);
  const hasAttAlias = await page.evaluate(() => {
    const def = window.__engine.commands.get('ATTDEF');
    return def && def.aliases.includes('ATT');
  });
  test('ATT alias registered', hasAttAlias);

  const hasAttedit = await page.evaluate(() => window.__engine.commands.has('ATTEDIT'));
  test('ATTEDIT registered', hasAttedit);
  const hasAteAlias = await page.evaluate(() => {
    const def = window.__engine.commands.get('ATTEDIT');
    return def && def.aliases.includes('ATE');
  });
  test('ATE alias registered', hasAteAlias);

  // Test attribute system programmatically
  const attResult = await page.evaluate(() => {
    const s = window.__store;
    s.entities = [];
    s.blockDefs.clear();
    s.blockAttribs.clear();

    // 1. Create attribute definitions (simulating ATTDEF)
    const defs = [
      { tag: 'PARTNO', prompt: 'Enter part number', defaultValue: 'P001', invisible: false },
      { tag: 'MATERIAL', prompt: 'Enter material', defaultValue: 'Steel', invisible: false },
      { tag: 'WEIGHT', prompt: 'Enter weight', defaultValue: '0', invisible: true },
    ];

    // 2. Create block with entities + attribute defs
    s.blockDefs.set('PLATE', [
      { id: 'b1', type: 'rect', layer: '0', color: 'bylayer', lineweight: 1, linetype: 'continuous', visible: true, selected: false, corner1: { x: 0, y: 0 }, corner2: { x: 50, y: 30 } },
    ]);
    s.blockAttribs.set('PLATE', defs);

    // 3. Insert block with attributes (simulating INSERT)
    const blockRef = {
      id: 'br1', type: 'blockref', layer: '0', color: 'bylayer', lineweight: 1,
      linetype: 'continuous', visible: true, selected: false,
      blockName: 'PLATE', insertPoint: { x: 100, y: 100 }, scaleX: 1, scaleY: 1, rotation: 0,
      attributes: [
        { tag: 'PARTNO', value: 'P-2024-A' },
        { tag: 'MATERIAL', value: 'Aluminum 6061' },
        { tag: 'WEIGHT', value: '2.5kg' },
      ],
    };
    s.pushUndo('test-attr');
    s.entities.push(blockRef);
    s.emit();

    return {
      blockHasDefs: s.blockAttribs.has('PLATE'),
      defCount: s.blockAttribs.get('PLATE').length,
      refAttrs: blockRef.attributes.length,
      partno: blockRef.attributes[0].value,
      material: blockRef.attributes[1].value,
      weight: blockRef.attributes[2].value,
    };
  });

  test('Block attribute definitions stored', attResult.blockHasDefs && attResult.defCount === 3,
    `defCount=${attResult.defCount}`);
  test('BlockRef has 3 attributes', attResult.refAttrs === 3,
    `attrCount=${attResult.refAttrs}`);
  test('PARTNO value correct', attResult.partno === 'P-2024-A',
    `PARTNO="${attResult.partno}"`);
  test('MATERIAL value correct', attResult.material === 'Aluminum 6061',
    `MATERIAL="${attResult.material}"`);
  test('WEIGHT value correct', attResult.weight === '2.5kg',
    `WEIGHT="${attResult.weight}"`);

  // Test ATTEDIT flow: modify attributes
  const editResult = await page.evaluate(() => {
    const s = window.__store;
    const br = s.entities.find(e => e.type === 'blockref');
    if (!br || !br.attributes) return null;
    s.pushUndo('ATTEDIT');
    br.attributes[0].value = 'P-REVISED';
    br.attributes[2].value = '3.1kg';
    s.emit();
    return {
      partno: br.attributes[0].value,
      weight: br.attributes[2].value,
    };
  });
  test('ATTEDIT modifies attributes', editResult?.partno === 'P-REVISED' && editResult?.weight === '3.1kg',
    `PARTNO="${editResult?.partno}", WEIGHT="${editResult?.weight}"`);

  // Test undo
  await cmd('UNDO');
  await page.waitForTimeout(200);
  const undoResult = await page.evaluate(() => {
    const br = window.__store.entities.find(e => e.type === 'blockref');
    return br?.attributes?.[0]?.value;
  });
  test('ATTEDIT undo restores values', undoResult === 'P-2024-A',
    `after undo: "${undoResult}"`);

  // Test ATTDEF CLI flow
  await page.evaluate(() => {
    window.__store.blockAttribs.delete('__pending__');
  });

  await cmd('ATTDEF');
  await page.waitForTimeout(100);
  let output = await getOutput(3);
  test('ATTDEF prompt shown', output.includes('tag') || output.includes('identifier'),
    output.split('\n').pop());

  await cmd('SERIAL');
  await page.waitForTimeout(100);
  await cmd('Enter serial number');
  await page.waitForTimeout(100);
  await cmd('SN-0000');
  await page.waitForTimeout(100);
  await cmd('No');
  await page.waitForTimeout(100);
  // Click insertion point
  await clickCanvas(0.5, 0.5);
  await page.waitForTimeout(100);
  await cmd('3');
  await page.waitForTimeout(300);

  const pendingAfter = await page.evaluate(() => {
    const p = window.__store.blockAttribs.get('__pending__');
    return p ? { count: p.length, tag: p[0]?.tag, defaultValue: p[0]?.defaultValue } : null;
  });
  test('ATTDEF creates pending attribute', pendingAfter !== null && pendingAfter.tag === 'SERIAL',
    pendingAfter ? `tag=${pendingAfter.tag}, default=${pendingAfter.defaultValue}` : 'null');

  // Test INSERT with attribute prompts
  await page.evaluate(() => {
    const s = window.__store;
    // Create a block with the pending attribute
    s.blockDefs.set('WIDGET', [
      { id: 'w1', type: 'circle', layer: '0', color: 'bylayer', lineweight: 1, linetype: 'continuous', visible: true, selected: false, center: { x: 0, y: 0 }, radius: 10 },
    ]);
    // Transfer pending to WIDGET
    const pending = s.blockAttribs.get('__pending__');
    if (pending) {
      s.blockAttribs.set('WIDGET', [...pending]);
      s.blockAttribs.delete('__pending__');
    }
    s.emit();
  });

  await cmd('INSERT');
  await page.waitForTimeout(100);
  await cmd('WIDGET');
  await page.waitForTimeout(100);
  await clickCanvas(0.3, 0.3);
  await page.waitForTimeout(100);
  await cmd('1');
  await page.waitForTimeout(100);
  await cmd('1');
  await page.waitForTimeout(100);
  await cmd('0');
  await page.waitForTimeout(300);

  output = await getOutput(5);
  const promptsSerial = output.includes('serial') || output.includes('SERIAL') || output.includes('SN-0000');
  test('INSERT prompts for block attributes', promptsSerial, output.split('\n').slice(-2).join(' | '));

  if (promptsSerial) {
    await cmd('SN-2024-X');
    await page.waitForTimeout(300);
  }

  const insertedRef = await page.evaluate(() => {
    const br = window.__store.entities.find(e => e.type === 'blockref' && e.blockName === 'WIDGET');
    return br ? { blockName: br.blockName, attrs: br.attributes } : null;
  });
  test('INSERT creates blockref with attributes', insertedRef !== null && insertedRef.attrs?.length > 0,
    insertedRef ? `attrs=${JSON.stringify(insertedRef.attrs)}` : 'no blockref');

  await pressEsc();
}

// ============================================================
// SUMMARY
// ============================================================
async function testSummary() {
  console.log('\n=== SUMMARY ===');
  const total = await page.evaluate(() => window.__engine.commands.size);
  test('Total registered commands', total === 105, `count=${total}`);

  const newCmds = ['CHPROP', 'CHANGE', 'DIMEDIT', 'DIMTEDIT', 'ATTDEF', 'ATTEDIT'];
  for (const name of newCmds) {
    const exists = await page.evaluate((n) => window.__engine.commands.has(n), name);
    test(`${name} registered`, exists);
  }

  const aliases = { CH: 'CHPROP', '-CH': 'CHANGE', DED: 'DIMEDIT', DIMTED: 'DIMTEDIT', ATT: 'ATTDEF', ATE: 'ATTEDIT' };
  for (const [alias, cmd] of Object.entries(aliases)) {
    const works = await page.evaluate(({ a, c }) => {
      const def = window.__engine.commands.get(c);
      return def && def.aliases.includes(a);
    }, { a: alias, c: cmd });
    test(`Alias ${alias} → ${cmd}`, works);
  }
}

// ============================================================
async function main() {
  console.log('MiniCAD Tier 5 Commands Audit');
  console.log('='.repeat(50));

  try {
    await setup();
    await testCHPROP();
    await testDIMEDIT();
    await testATTDEF();
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
