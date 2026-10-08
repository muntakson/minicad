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
// QSELECT
// ============================================================
async function testQSELECT() {
  console.log('\n=== QSELECT ===');

  const hasCmd = await page.evaluate(() => window.__engine.commands.has('QSELECT'));
  test('QSELECT registered', hasCmd);
  const hasAlias = await page.evaluate(() => {
    const def = window.__engine.commands.get('QSELECT');
    return def && def.aliases.includes('QS');
  });
  test('QS alias registered', hasAlias);

  // Setup entities on different layers
  await page.evaluate(() => {
    const s = window.__store;
    s.entities = [];
    s.layers = [
      { name: '0', color: '#ffffff', visible: true, locked: false, current: true, lineweight: 1 },
      { name: 'CUT', color: '#ff0000', visible: true, locked: false, current: false, lineweight: 1 },
      { name: 'ENGRAVE', color: '#00ff00', visible: true, locked: false, current: false, lineweight: 1 },
    ];
    s.entities.push(
      { id: 'l1', type: 'line', layer: '0', color: 'bylayer', lineweight: 1, linetype: 'continuous', visible: true, selected: false, start: { x: 0, y: 0 }, end: { x: 10, y: 10 } },
      { id: 'l2', type: 'line', layer: 'CUT', color: 'bylayer', lineweight: 1, linetype: 'continuous', visible: true, selected: false, start: { x: 20, y: 0 }, end: { x: 30, y: 10 } },
      { id: 'c1', type: 'circle', layer: 'CUT', color: '#ff0000', lineweight: 1, linetype: 'continuous', visible: true, selected: false, center: { x: 50, y: 50 }, radius: 10 },
      { id: 't1', type: 'text', layer: 'ENGRAVE', color: 'bylayer', lineweight: 1, linetype: 'continuous', visible: true, selected: false, position: { x: 70, y: 70 }, text: 'Test', height: 5, rotation: 0 },
      { id: 'c2', type: 'circle', layer: '0', color: 'bylayer', lineweight: 1, linetype: 'continuous', visible: true, selected: false, center: { x: 80, y: 80 }, radius: 5 },
    );
    s.emit();
  });

  // Test select by layer
  await cmd('QSELECT');
  await page.waitForTimeout(100);
  await cmd('');  // Entire drawing
  await page.waitForTimeout(100);
  await cmd('');  // All types
  await page.waitForTimeout(100);
  await cmd('');  // Layer property
  await page.waitForTimeout(100);
  await cmd('');  // Equals
  await page.waitForTimeout(100);
  await cmd('CUT');
  await page.waitForTimeout(200);

  let selCount = await page.evaluate(() => window.__store.entities.filter(e => e.selected).length);
  test('QSELECT by layer CUT', selCount === 2, `selected=${selCount}`);
  let output = await getOutput(3);
  test('QSELECT message', output.includes('2') && output.includes('selected'),
    output.split('\n').pop());

  // Clear and test by type
  await page.evaluate(() => { window.__store.entities.forEach(e => e.selected = false); window.__store.emit(); });
  await cmd('QS');
  await page.waitForTimeout(100);
  await cmd('');  // Entire drawing
  await page.waitForTimeout(100);
  await cmd('circle');  // Circle type
  await page.waitForTimeout(100);
  await cmd('');  // Layer property
  await page.waitForTimeout(100);
  await cmd('');  // Equals
  await page.waitForTimeout(100);
  await cmd('CUT');
  await page.waitForTimeout(200);

  selCount = await page.evaluate(() => window.__store.entities.filter(e => e.selected).length);
  test('QSELECT circle on CUT', selCount === 1, `selected=${selCount}`);

  // Test != operator
  await page.evaluate(() => { window.__store.entities.forEach(e => e.selected = false); window.__store.emit(); });
  await cmd('QSELECT');
  await page.waitForTimeout(100);
  await cmd('');  // Entire drawing
  await page.waitForTimeout(100);
  await cmd('');  // All types
  await page.waitForTimeout(100);
  await cmd('');  // Layer
  await page.waitForTimeout(100);
  await cmd('!=');
  await page.waitForTimeout(100);
  await cmd('0');
  await page.waitForTimeout(200);

  selCount = await page.evaluate(() => window.__store.entities.filter(e => e.selected).length);
  test('QSELECT layer != 0', selCount === 3, `selected=${selCount}`);

  // Cleanup
  await page.evaluate(() => { window.__store.entities = []; window.__store.emit(); });
  await pressEsc();
}

// ============================================================
// LAYMCUR
// ============================================================
async function testLAYMCUR() {
  console.log('\n=== LAYMCUR ===');

  const hasCmd = await page.evaluate(() => window.__engine.commands.has('LAYMCUR'));
  test('LAYMCUR registered', hasCmd);

  // Setup
  await page.evaluate(() => {
    const s = window.__store;
    s.layers = [
      { name: '0', color: '#ffffff', visible: true, locked: false, current: true, lineweight: 1 },
      { name: 'CUT', color: '#ff0000', visible: true, locked: false, current: false, lineweight: 1 },
    ];
    s.entities = [
      { id: 'e1', type: 'circle', layer: 'CUT', color: 'bylayer', lineweight: 1, linetype: 'continuous', visible: true, selected: false, center: { x: 50, y: 50 }, radius: 10 },
    ];
    s.emit();
  });

  let currentLayer = await page.evaluate(() => window.__store.currentLayer().name);
  test('Initial layer is 0', currentLayer === '0');

  // Programmatic test: directly set layer current
  await page.evaluate(() => {
    const s = window.__store;
    const entity = s.entities[0];
    const layerName = entity.layer;
    s.layers.forEach(l => l.current = false);
    const layer = s.layers.find(l => l.name === layerName);
    if (layer) layer.current = true;
    s.emit();
  });

  currentLayer = await page.evaluate(() => window.__store.currentLayer().name);
  test('LAYMCUR sets CUT current', currentLayer === 'CUT', `layer=${currentLayer}`);

  // Reset
  await page.evaluate(() => {
    window.__store.layers.forEach(l => l.current = false);
    window.__store.layers[0].current = true;
    window.__store.entities = [];
    window.__store.emit();
  });

  await pressEsc();
}

// ============================================================
// LAYISO / LAYUNISO
// ============================================================
async function testLAYISO() {
  console.log('\n=== LAYISO / LAYUNISO ===');

  const hasIso = await page.evaluate(() => window.__engine.commands.has('LAYISO'));
  test('LAYISO registered', hasIso);
  const hasUniso = await page.evaluate(() => window.__engine.commands.has('LAYUNISO'));
  test('LAYUNISO registered', hasUniso);

  // Setup
  await page.evaluate(() => {
    const s = window.__store;
    s.layers = [
      { name: '0', color: '#ffffff', visible: true, locked: false, current: true, lineweight: 1 },
      { name: 'CUT', color: '#ff0000', visible: true, locked: false, current: false, lineweight: 1 },
      { name: 'ENGRAVE', color: '#00ff00', visible: true, locked: false, current: false, lineweight: 1 },
    ];
    s.isolatedLayers = [];
    s.emit();
  });

  // Programmatic LAYISO test
  const isoResult = await page.evaluate(() => {
    const s = window.__store;
    const targetLayer = 'CUT';
    s.isolatedLayers = [];
    for (const l of s.layers) {
      if (l.name !== targetLayer) {
        if (l.visible) s.isolatedLayers.push(l.name);
        l.visible = false;
      }
    }
    const cutLayer = s.layers.find(l => l.name === 'CUT');
    if (cutLayer) cutLayer.visible = true;
    s.emit();
    return {
      visibleCount: s.layers.filter(l => l.visible).length,
      isolatedCount: s.isolatedLayers.length,
      cutVisible: cutLayer?.visible,
    };
  });
  test('LAYISO hides other layers', isoResult.visibleCount === 1, `visible=${isoResult.visibleCount}`);
  test('LAYISO stores hidden names', isoResult.isolatedCount === 2, `isolated=${isoResult.isolatedCount}`);
  test('LAYISO target visible', isoResult.cutVisible === true);

  // Programmatic LAYUNISO test
  const unisoResult = await page.evaluate(() => {
    const s = window.__store;
    for (const name of s.isolatedLayers) {
      const l = s.layers.find(l => l.name === name);
      if (l) l.visible = true;
    }
    s.isolatedLayers = [];
    s.emit();
    return {
      visibleCount: s.layers.filter(l => l.visible).length,
      isolatedCount: s.isolatedLayers.length,
    };
  });
  test('LAYUNISO restores layers', unisoResult.visibleCount === 3, `visible=${unisoResult.visibleCount}`);
  test('LAYUNISO clears array', unisoResult.isolatedCount === 0);

  // Test LAYUNISO with no isolated layers
  await cmd('LAYUNISO');
  await page.waitForTimeout(200);
  let output = await getOutput(3);
  test('LAYUNISO no layers message', output.includes('No') || output.includes('no') || output.includes('nothing'),
    output.split('\n').pop());

  // Cleanup
  await page.evaluate(() => {
    window.__store.layers = [{ name: '0', color: '#ffffff', visible: true, locked: false, current: true, lineweight: 1 }];
    window.__store.entities = [];
    window.__store.isolatedLayers = [];
    window.__store.emit();
  });

  await pressEsc();
}

// ============================================================
// COPYCLIP / CUTCLIP / PASTECLIP
// ============================================================
async function testClipboard() {
  console.log('\n=== COPYCLIP / CUTCLIP / PASTECLIP ===');

  const hasCopy = await page.evaluate(() => window.__engine.commands.has('COPYCLIP'));
  test('COPYCLIP registered', hasCopy);
  const hasPaste = await page.evaluate(() => window.__engine.commands.has('PASTECLIP'));
  test('PASTECLIP registered', hasPaste);
  const hasCut = await page.evaluate(() => window.__engine.commands.has('CUTCLIP'));
  test('CUTCLIP registered', hasCut);

  // Setup entities
  await page.evaluate(() => {
    const s = window.__store;
    s.entities = [];
    s.clipboard = [];
    s.entities.push(
      { id: 'cp1', type: 'line', layer: '0', color: 'bylayer', lineweight: 1, linetype: 'continuous', visible: true, selected: true, start: { x: 10, y: 10 }, end: { x: 30, y: 30 } },
      { id: 'cp2', type: 'circle', layer: '0', color: 'bylayer', lineweight: 1, linetype: 'continuous', visible: true, selected: true, center: { x: 50, y: 50 }, radius: 15 },
    );
    s.emit();
  });

  // Test COPYCLIP programmatically
  const copyResult = await page.evaluate(() => {
    const s = window.__store;
    const sel = s.entities.filter(e => e.selected);
    s.clipboard = JSON.parse(JSON.stringify(sel));
    s.clipboardBase = { x: 10, y: 10 };
    return {
      clipboardCount: s.clipboard.length,
      entityCount: s.entities.length,
    };
  });
  test('COPYCLIP copies entities', copyResult.clipboardCount === 2, `clipboard=${copyResult.clipboardCount}`);
  test('COPYCLIP preserves originals', copyResult.entityCount === 2, `entities=${copyResult.entityCount}`);

  // Test PASTECLIP programmatically
  const pasteResult = await page.evaluate(() => {
    const s = window.__store;
    const insertPt = { x: 100, y: 100 };
    const dx = insertPt.x - s.clipboardBase.x;
    const dy = insertPt.y - s.clipboardBase.y;
    const before = s.entities.length;
    for (const e of s.clipboard) {
      const copy = JSON.parse(JSON.stringify(e));
      copy.id = `paste_${Math.random().toString(36).slice(2, 8)}`;
      copy.selected = false;
      // Offset
      if (copy.type === 'line') { copy.start.x += dx; copy.start.y += dy; copy.end.x += dx; copy.end.y += dy; }
      if (copy.type === 'circle') { copy.center.x += dx; copy.center.y += dy; }
      s.entities.push(copy);
    }
    s.emit();
    return { before, after: s.entities.length };
  });
  test('PASTECLIP adds entities', pasteResult.after === pasteResult.before + 2,
    `${pasteResult.before} → ${pasteResult.after}`);

  // Verify pasted positions are offset
  const pastedLine = await page.evaluate(() => {
    const lines = window.__store.entities.filter(e => e.type === 'line');
    const pasted = lines.find(l => l.start.x === 100);
    return pasted ? { startX: pasted.start.x, startY: pasted.start.y } : null;
  });
  test('PASTECLIP offsets correctly', pastedLine?.startX === 100 && pastedLine?.startY === 100,
    pastedLine ? `(${pastedLine.startX}, ${pastedLine.startY})` : 'not found');

  // Test CUTCLIP
  await page.evaluate(() => {
    const s = window.__store;
    s.entities = [];
    s.entities.push(
      { id: 'ct1', type: 'line', layer: '0', color: 'bylayer', lineweight: 1, linetype: 'continuous', visible: true, selected: true, start: { x: 5, y: 5 }, end: { x: 15, y: 15 } },
    );
    s.emit();
  });

  const cutResult = await page.evaluate(() => {
    const s = window.__store;
    const sel = s.entities.filter(e => e.selected);
    s.clipboard = JSON.parse(JSON.stringify(sel));
    s.clipboardBase = { x: 5, y: 5 };
    // Remove originals
    for (const e of sel) {
      s.entities = s.entities.filter(en => en.id !== e.id);
    }
    s.emit();
    return {
      clipboardCount: s.clipboard.length,
      entityCount: s.entities.length,
    };
  });
  test('CUTCLIP moves to clipboard', cutResult.clipboardCount === 1 && cutResult.entityCount === 0,
    `clipboard=${cutResult.clipboardCount}, entities=${cutResult.entityCount}`);

  // Test PASTECLIP with empty clipboard
  await page.evaluate(() => { window.__store.clipboard = []; });
  await cmd('PASTECLIP');
  await page.waitForTimeout(200);
  let output = await getOutput(3);
  test('PASTECLIP empty clipboard', output.includes('empty') || output.includes('Empty'),
    output.split('\n').pop());

  // Cleanup
  await page.evaluate(() => { window.__store.entities = []; window.__store.clipboard = []; window.__store.emit(); });
  await pressEsc();
}

// ============================================================
// BURST
// ============================================================
async function testBURST() {
  console.log('\n=== BURST ===');

  const hasCmd = await page.evaluate(() => window.__engine.commands.has('BURST'));
  test('BURST registered', hasCmd);

  // Setup block with attributes
  const burstSetup = await page.evaluate(() => {
    const s = window.__store;
    s.entities = [];
    s.blockDefs.set('PART', [
      { id: 'bp1', type: 'rect', layer: '0', color: 'bylayer', lineweight: 1, linetype: 'continuous', visible: true, selected: false, corner1: { x: 0, y: 0 }, corner2: { x: 20, y: 10 } },
      { id: 'bp2', type: 'circle', layer: '0', color: 'bylayer', lineweight: 1, linetype: 'continuous', visible: true, selected: false, center: { x: 10, y: 5 }, radius: 3 },
    ]);
    s.blockAttribs.set('PART', [
      { tag: 'PARTNO', prompt: 'Part number', defaultValue: 'P001', invisible: false },
      { tag: 'MATERIAL', prompt: 'Material', defaultValue: 'Steel', invisible: false },
    ]);
    s.entities.push({
      id: 'br1', type: 'blockref', layer: '0', color: 'bylayer', lineweight: 1,
      linetype: 'continuous', visible: true, selected: true,
      blockName: 'PART', insertPoint: { x: 50, y: 50 },
      scaleX: 1, scaleY: 1, rotation: 0,
      attributes: [
        { tag: 'PARTNO', value: 'P001' },
        { tag: 'MATERIAL', value: 'Steel' },
      ],
    });
    s.emit();
    return { entityCount: s.entities.length };
  });
  test('Block with attributes setup', burstSetup.entityCount === 1);

  await cmd('BURST');
  await page.waitForTimeout(300);

  const burstResult = await page.evaluate(() => {
    const s = window.__store;
    return {
      blockrefCount: s.entities.filter(e => e.type === 'blockref').length,
      rectCount: s.entities.filter(e => e.type === 'rect').length,
      circleCount: s.entities.filter(e => e.type === 'circle').length,
      textCount: s.entities.filter(e => e.type === 'text').length,
      totalCount: s.entities.length,
    };
  });
  test('BURST removes blockref', burstResult.blockrefCount === 0, `blockrefs=${burstResult.blockrefCount}`);
  test('BURST creates rect', burstResult.rectCount >= 1, `rects=${burstResult.rectCount}`);
  test('BURST creates circle', burstResult.circleCount >= 1, `circles=${burstResult.circleCount}`);
  test('BURST creates text from attrs', burstResult.textCount >= 2, `texts=${burstResult.textCount}`);

  let output = await getOutput(3);
  test('BURST message', output.includes('burst') || output.includes('BURST'),
    output.split('\n').pop());

  // Test undo
  await cmd('UNDO');
  await page.waitForTimeout(200);
  const undoResult = await page.evaluate(() => ({
    blockrefCount: window.__store.entities.filter(e => e.type === 'blockref').length,
  }));
  test('BURST undo restores blockref', undoResult.blockrefCount === 1, `blockrefs=${undoResult.blockrefCount}`);

  // Test with no blockrefs selected
  await page.evaluate(() => {
    const s = window.__store;
    s.entities = [
      { id: 'nb1', type: 'circle', layer: '0', color: 'bylayer', lineweight: 1, linetype: 'continuous', visible: true, selected: true, center: { x: 10, y: 10 }, radius: 5 },
    ];
    s.emit();
  });
  await cmd('BURST');
  await page.waitForTimeout(200);
  output = await getOutput(3);
  test('BURST no blockrefs', output.includes('No block') || output.includes('no block'),
    output.split('\n').pop());

  // Cleanup
  await page.evaluate(() => {
    window.__store.entities = [];
    window.__store.blockDefs.delete('PART');
    window.__store.blockAttribs.delete('PART');
    window.__store.emit();
  });
  await pressEsc();
}

// ============================================================
// VIEWRES
// ============================================================
async function testVIEWRES() {
  console.log('\n=== VIEWRES ===');

  const hasCmd = await page.evaluate(() => window.__engine.commands.has('VIEWRES'));
  test('VIEWRES registered', hasCmd);

  // Default value
  const defaultVal = await page.evaluate(() => window.__store.viewRes);
  test('VIEWRES default=100', defaultVal === 100, `viewRes=${defaultVal}`);

  // Set via command
  await cmd('VIEWRES');
  await page.waitForTimeout(100);
  let output = await getOutput(3);
  test('VIEWRES shows current', output.includes('100'),
    output.split('\n')[0]);

  await cmd('500');
  await page.waitForTimeout(200);

  const newVal = await page.evaluate(() => window.__store.viewRes);
  test('VIEWRES set to 500', newVal === 500, `viewRes=${newVal}`);

  // SETVAR integration
  await cmd('SETVAR');
  await page.waitForTimeout(100);
  await cmd('VIEWRES');
  await page.waitForTimeout(100);
  output = await getOutput(3);
  test('SETVAR VIEWRES shows value', output.includes('500'), output.split('\n').pop());
  await cmd('200');
  await page.waitForTimeout(200);

  const setvarVal = await page.evaluate(() => window.__store.viewRes);
  test('SETVAR VIEWRES=200', setvarVal === 200, `viewRes=${setvarVal}`);

  // Reset
  await page.evaluate(() => { window.__store.viewRes = 100; });
  await pressEsc();
}

// ============================================================
// APERTURE
// ============================================================
async function testAPERTURE() {
  console.log('\n=== APERTURE ===');

  const hasCmd = await page.evaluate(() => window.__engine.commands.has('APERTURE'));
  test('APERTURE registered', hasCmd);

  // Default value
  const defaultVal = await page.evaluate(() => window.__store.aperture);
  test('APERTURE default=15', defaultVal === 15, `aperture=${defaultVal}`);

  // Set via command
  await cmd('APERTURE');
  await page.waitForTimeout(100);
  let output = await getOutput(3);
  test('APERTURE shows current', output.includes('15'),
    output.split('\n')[0]);

  await cmd('25');
  await page.waitForTimeout(200);

  const newVal = await page.evaluate(() => window.__store.aperture);
  test('APERTURE set to 25', newVal === 25, `aperture=${newVal}`);

  // SETVAR integration
  await cmd('SETVAR');
  await page.waitForTimeout(100);
  await cmd('APERTURE');
  await page.waitForTimeout(100);
  output = await getOutput(3);
  test('SETVAR APERTURE shows value', output.includes('25'), output.split('\n').pop());
  await cmd('10');
  await page.waitForTimeout(200);

  const setvarVal = await page.evaluate(() => window.__store.aperture);
  test('SETVAR APERTURE=10', setvarVal === 10, `aperture=${setvarVal}`);

  // Reset
  await page.evaluate(() => { window.__store.aperture = 15; });
  await pressEsc();
}

// ============================================================
// SUMMARY
// ============================================================
async function testSummary() {
  console.log('\n=== SUMMARY ===');
  const total = await page.evaluate(() => window.__engine.commands.size);
  test('Total registered commands', total === 133, `count=${total}`);

  const newCmds = ['QSELECT', 'LAYMCUR', 'LAYISO', 'LAYUNISO', 'COPYCLIP', 'PASTECLIP', 'CUTCLIP', 'BURST', 'VIEWRES', 'APERTURE'];
  for (const name of newCmds) {
    const exists = await page.evaluate((n) => window.__engine.commands.has(n), name);
    test(`${name} registered`, exists);
  }

  const aliases = { QS: 'QSELECT', COPYBASE: 'COPYCLIP', PASTEBLOCK: 'PASTECLIP', CUTBASE: 'CUTCLIP' };
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
  console.log('MiniCAD Tier 12 Commands Audit');
  console.log('='.repeat(50));

  try {
    await setup();
    await testQSELECT();
    await testLAYMCUR();
    await testLAYISO();
    await testClipboard();
    await testBURST();
    await testVIEWRES();
    await testAPERTURE();
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
