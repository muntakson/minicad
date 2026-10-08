import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto('http://localhost:3010');
await page.waitForTimeout(2000);

let passed = 0, failed = 0;
const failures = [];

async function runTest(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  PASS: ${name}`);
  } catch (e) {
    failed++;
    failures.push(name);
    console.log(`  FAIL: ${name} — ${e.message}`);
  }
}

async function cmd(command) {
  await page.evaluate((c) => window.__engine.handleInput(c), command);
  await page.waitForTimeout(200);
}

async function getOutput() {
  return page.evaluate(() => {
    const el = document.getElementById('cmd-history');
    return el ? el.innerText : '';
  });
}

async function entityCount() {
  return page.evaluate(() => window.__store.entities.length);
}

async function clearAll() {
  await page.evaluate(() => {
    window.__store.entities = [];
    window.__store.emit();
  });
  await page.waitForTimeout(100);
}

console.log('\n=== TIER 18 COMMAND TESTS ===\n');

// --- MLEADER ---
console.log('MLEADER:');

await runTest('MLEADER registered', async () => {
  const has = await page.evaluate(() => window.__engine.commands.has('MLEADER'));
  if (!has) throw new Error('MLEADER not registered');
});

await runTest('MLEADER alias MLD', async () => {
  const found = await page.evaluate(() => {
    const def = window.__engine.commands.get('MLEADER');
    return def && def.aliases.includes('MLD');
  });
  if (!found) throw new Error('MLD alias not found');
});

await runTest('MLEADER creates line+text', async () => {
  await clearAll();
  const before = await entityCount();
  await cmd('MLEADER');
  await page.evaluate(() => window.__engine.handleClick({ x: 10, y: 10 }));
  await page.waitForTimeout(200);
  await page.evaluate(() => window.__engine.handleClick({ x: 50, y: 50 }));
  await page.waitForTimeout(200);
  await cmd('Leader Text');
  const after = await entityCount();
  if (after - before < 2) throw new Error(`Expected at least 2 entities, got ${after - before}`);
  const output = await getOutput();
  if (!output.includes('MLEADER')) throw new Error('No MLEADER output');
});

// --- DIMREASSOCIATE ---
console.log('\nDIMREASSOCIATE:');

await runTest('DIMREASSOCIATE registered', async () => {
  const has = await page.evaluate(() => window.__engine.commands.has('DIMREASSOCIATE'));
  if (!has) throw new Error('DIMREASSOCIATE not registered');
});

await runTest('DIMREASSOCIATE reassociates dimension', async () => {
  await clearAll();
  await page.evaluate(() => {
    const store = window.__store;
    store.entities.push({
      id: 'dim1', type: 'dimension', layer: '0', color: 'bylayer',
      visible: true, selected: true, locked: false,
      dimType: 'linear', p1: { x: 0, y: 0 }, p2: { x: 100, y: 0 },
      textPos: { x: 50, y: -10 }, text: '', style: store.currentDimStyle || {}
    });
    store.emit();
  });
  await cmd('DIMREASSOCIATE');
  await page.waitForTimeout(300);
  await page.evaluate(() => window.__engine.handleClick({ x: 20, y: 20 }));
  await page.waitForTimeout(200);
  await page.evaluate(() => window.__engine.handleClick({ x: 80, y: 80 }));
  await page.waitForTimeout(200);
  const output = await getOutput();
  if (!output.includes('reassociate') && !output.includes('DIMREASSOCIATE') && !output.includes('Reassociat')) throw new Error('No reassociate output');
});

// --- TORIENT ---
console.log('\nTORIENT:');

await runTest('TORIENT registered', async () => {
  const has = await page.evaluate(() => window.__engine.commands.has('TORIENT'));
  if (!has) throw new Error('TORIENT not registered');
});

await runTest('TORIENT reorients upside-down text', async () => {
  await clearAll();
  await page.evaluate(() => {
    const store = window.__store;
    store.entities.push({
      id: 'txt1', type: 'text', layer: '0', color: 'bylayer',
      visible: true, selected: true, locked: false,
      position: { x: 50, y: 50 }, text: 'Test', height: 10, rotation: 180
    });
    store.emit();
  });
  await cmd('TORIENT');
  await page.waitForTimeout(300);
  const result = await page.evaluate(() => {
    const t = window.__store.entities.find(e => e.id === 'txt1');
    return { rotation: t.rotation };
  });
  if (result.rotation === 180) throw new Error('Text was not reoriented');
  const output = await getOutput();
  if (!output.includes('TORIENT')) throw new Error('No TORIENT output');
});

await runTest('TORIENT keeps correctly oriented text', async () => {
  await clearAll();
  await page.evaluate(() => {
    const store = window.__store;
    store.entities.push({
      id: 'txt2', type: 'text', layer: '0', color: 'bylayer',
      visible: true, selected: true, locked: false,
      position: { x: 50, y: 50 }, text: 'Test', height: 10, rotation: 45
    });
    store.emit();
  });
  await cmd('TORIENT');
  await page.waitForTimeout(300);
  const result = await page.evaluate(() => {
    const t = window.__store.entities.find(e => e.id === 'txt2');
    return { rotation: t.rotation };
  });
  if (result.rotation !== 45) throw new Error(`Expected rotation 45, got ${result.rotation}`);
});

// --- DSETTINGS ---
console.log('\nDSETTINGS:');

await runTest('DSETTINGS registered', async () => {
  const has = await page.evaluate(() => window.__engine.commands.has('DSETTINGS'));
  if (!has) throw new Error('DSETTINGS not registered');
});

await runTest('DSETTINGS alias DS', async () => {
  const found = await page.evaluate(() => {
    const def = window.__engine.commands.get('DSETTINGS');
    return def && def.aliases.includes('DS');
  });
  if (!found) throw new Error('DS alias not found');
});

await runTest('DSETTINGS shows grid/snap/ortho/osnap', async () => {
  await cmd('DSETTINGS');
  await page.waitForTimeout(200);
  const output = await getOutput();
  if (!output.includes('Grid') && !output.includes('grid')) throw new Error('No grid info');
  await cmd('');
});

await runTest('DSETTINGS toggle ortho', async () => {
  const before = await page.evaluate(() => window.__store.orthoOn);
  await cmd('DSETTINGS');
  await page.waitForTimeout(200);
  await cmd('ortho');
  const after = await page.evaluate(() => window.__store.orthoOn);
  if (before === after) throw new Error('Ortho not toggled');
});

await runTest('DSETTINGS set grid spacing', async () => {
  await cmd('DSETTINGS');
  await page.waitForTimeout(200);
  await cmd('grid');
  await page.waitForTimeout(200);
  await cmd('25');
  const spacing = await page.evaluate(() => window.__store.gridSpacing);
  if (spacing !== 25) throw new Error(`Expected spacing 25, got ${spacing}`);
});

await runTest('DSETTINGS toggle snap', async () => {
  const before = await page.evaluate(() => window.__store.snapToGrid);
  await cmd('DSETTINGS');
  await page.waitForTimeout(200);
  await cmd('snap');
  const after = await page.evaluate(() => window.__store.snapToGrid);
  if (before === after) throw new Error('Snap not toggled');
});

// --- DDGRIPS ---
console.log('\nDDGRIPS:');

await runTest('DDGRIPS registered', async () => {
  const has = await page.evaluate(() => window.__engine.commands.has('DDGRIPS'));
  if (!has) throw new Error('DDGRIPS not registered');
});

await runTest('DDGRIPS toggle grips off', async () => {
  await cmd('DDGRIPS');
  await page.waitForTimeout(200);
  await cmd('off');
  const result = await page.evaluate(() => window.__store.gripsEnabled);
  if (result !== false) throw new Error('Grips not disabled');
});

await runTest('DDGRIPS toggle grips on', async () => {
  await cmd('DDGRIPS');
  await page.waitForTimeout(200);
  await cmd('on');
  const result = await page.evaluate(() => window.__store.gripsEnabled);
  if (result !== true) throw new Error('Grips not enabled');
});

// --- LAYERP ---
console.log('\nLAYERP:');

await runTest('LAYERP registered', async () => {
  const has = await page.evaluate(() => window.__engine.commands.has('LAYERP'));
  if (!has) throw new Error('LAYERP not registered');
});

await runTest('LAYERP alias LP', async () => {
  const found = await page.evaluate(() => {
    const def = window.__engine.commands.get('LAYERP');
    return def && def.aliases.includes('LP');
  });
  if (!found) throw new Error('LP alias not found');
});

await runTest('LAYERP restores layer state', async () => {
  await page.evaluate(() => {
    const store = window.__store;
    store.layerStates.set('__layerp_auto', { layers: JSON.parse(JSON.stringify(store.layers)) });
    store.layers.push({ name: 'TempLayer', color: '#ff0000', visible: true, locked: false, frozen: false, current: false, lineweight: 0.25 });
  });
  const beforeCount = await page.evaluate(() => window.__store.layers.length);
  await cmd('LAYERP');
  await page.waitForTimeout(200);
  const afterCount = await page.evaluate(() => window.__store.layers.length);
  if (afterCount >= beforeCount) throw new Error(`Expected fewer layers after restore, before=${beforeCount} after=${afterCount}`);
  const output = await getOutput();
  if (!output.includes('LAYERP') && !output.includes('restored')) throw new Error('No LAYERP output');
});

await runTest('LAYERP no previous state', async () => {
  await page.evaluate(() => window.__store.layerStates.delete('__layerp_auto'));
  await cmd('LAYERP');
  await page.waitForTimeout(200);
  const output = await getOutput();
  if (!output.includes('No previous')) throw new Error('Expected no-state message');
});

// --- SCRIPT ---
console.log('\nSCRIPT:');

await runTest('SCRIPT registered', async () => {
  const has = await page.evaluate(() => window.__engine.commands.has('SCRIPT'));
  if (!has) throw new Error('SCRIPT not registered');
});

await runTest('SCRIPT alias SCR', async () => {
  const found = await page.evaluate(() => {
    const def = window.__engine.commands.get('SCRIPT');
    return def && def.aliases.includes('SCR');
  });
  if (!found) throw new Error('SCR alias not found');
});

await runTest('SCRIPT runs semicolon-separated commands', async () => {
  await cmd('SCRIPT');
  await page.waitForTimeout(200);
  await cmd('ABOUT;ABOUT');
  await page.waitForTimeout(600);
  const output = await getOutput();
  if (!output.includes('SCRIPT') && !output.includes('commands')) throw new Error('No script output');
});

// --- SHELL ---
console.log('\nSHELL:');

await runTest('SHELL registered', async () => {
  const has = await page.evaluate(() => window.__engine.commands.has('SHELL'));
  if (!has) throw new Error('SHELL not registered');
});

await runTest('SHELL evaluates expression', async () => {
  await cmd('SHELL');
  await page.waitForTimeout(200);
  await cmd('2 + 3');
  const output = await getOutput();
  if (!output.includes('5')) throw new Error('Expected result 5');
});

await runTest('SHELL handles error', async () => {
  await cmd('SHELL');
  await page.waitForTimeout(200);
  await cmd('undefinedVariable.foo');
  const output = await getOutput();
  if (!output.includes('Error')) throw new Error('Expected error output');
});

// --- OBJECTSCALE ---
console.log('\nOBJECTSCALE:');

await runTest('OBJECTSCALE registered', async () => {
  const has = await page.evaluate(() => window.__engine.commands.has('OBJECTSCALE'));
  if (!has) throw new Error('OBJECTSCALE not registered');
});

await runTest('OBJECTSCALE sets annotation scale', async () => {
  await cmd('OBJECTSCALE');
  await page.waitForTimeout(200);
  await cmd('2.5');
  const scale = await page.evaluate(() => window.__store.annotationScale);
  if (scale !== 2.5) throw new Error(`Expected scale 2.5, got ${scale}`);
  const output = await getOutput();
  if (!output.includes('2.5')) throw new Error('No scale output');
});

await runTest('OBJECTSCALE rejects invalid input', async () => {
  await cmd('OBJECTSCALE');
  await page.waitForTimeout(200);
  await cmd('-1');
  const output = await getOutput();
  if (!output.includes('positive')) throw new Error('Expected positive number message');
  await cmd('');
});

// --- PAGESETUP ---
console.log('\nPAGESETUP:');

await runTest('PAGESETUP registered', async () => {
  const has = await page.evaluate(() => window.__engine.commands.has('PAGESETUP'));
  if (!has) throw new Error('PAGESETUP not registered');
});

await runTest('PAGESETUP shows current settings', async () => {
  await cmd('PAGESETUP');
  await page.waitForTimeout(200);
  const output = await getOutput();
  if (!output.includes('PAGESETUP') && !output.includes('Paper')) throw new Error('No PAGESETUP output');
  await cmd('');
});

await runTest('PAGESETUP set paper size', async () => {
  await cmd('PAGESETUP');
  await page.waitForTimeout(200);
  await cmd('paper');
  await page.waitForTimeout(200);
  await cmd('A1');
  const ps = await page.evaluate(() => window.__store.pageSetup);
  if (!ps || ps.paperSize !== 'A1') throw new Error(`Expected A1, got ${ps?.paperSize}`);
});

await runTest('PAGESETUP toggle orientation', async () => {
  await cmd('PAGESETUP');
  await page.waitForTimeout(200);
  const before = await page.evaluate(() => (window.__store.pageSetup || {}).orientation);
  await cmd('orientation');
  const after = await page.evaluate(() => window.__store.pageSetup.orientation);
  if (before === after) throw new Error('Orientation not toggled');
});

await runTest('PAGESETUP set scale', async () => {
  await cmd('PAGESETUP');
  await page.waitForTimeout(200);
  await cmd('scale');
  await page.waitForTimeout(200);
  await cmd('1:2');
  const ps = await page.evaluate(() => window.__store.pageSetup);
  if (!ps || ps.scale !== '1:2') throw new Error(`Expected scale 1:2, got ${ps?.scale}`);
});

// Summary
console.log(`\n=== RESULTS: ${passed} passed, ${failed} failed out of ${passed + failed} ===`);
if (failures.length > 0) {
  console.log('Failures:', failures.join(', '));
}

await browser.close();
process.exit(failed > 0 ? 1 : 0);
