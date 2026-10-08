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
  await page.waitForTimeout(250);
}

async function click(x, y) {
  await page.evaluate(({ x, y }) => window.__engine.handleClick({ x, y }), { x, y });
  await page.waitForTimeout(250);
}

async function entityCount() {
  return page.evaluate(() => window.__store.entities.length);
}

async function clearAll() {
  await page.evaluate(() => {
    window.__engine.cancel();
    window.__store.entities = [];
    window.__store.clearSelection();
    window.__store.emit();
  });
  await page.waitForTimeout(200);
}

console.log('\n=== TIER 19 COMMAND TESTS ===\n');

// --- HELIX ---
console.log('HELIX:');

await runTest('HELIX registered', async () => {
  const has = await page.evaluate(() => window.__engine.commands.has('HELIX'));
  if (!has) throw new Error('HELIX not registered');
});

await runTest('HELIX alias HX', async () => {
  const found = await page.evaluate(() => {
    const def = window.__engine.commands.get('HELIX');
    return def && def.aliases.includes('HX');
  });
  if (!found) throw new Error('HX alias not found');
});

await runTest('HELIX creates spiral polyline', async () => {
  await clearAll();
  await cmd('HELIX');
  await click(0, 0);
  await cmd('10');
  await cmd('');
  await cmd('3');
  await page.waitForTimeout(300);
  const count = await page.evaluate(() =>
    window.__store.entities.filter(e => e.type === 'polyline').length
  );
  if (count < 1) throw new Error('No polyline created');
  const pts = await page.evaluate(() => {
    const pl = window.__store.entities.find(e => e.type === 'polyline');
    return pl ? pl.points.length : 0;
  });
  if (pts < 36) throw new Error(`Expected many points for spiral, got ${pts}`);
});

await runTest('HELIX polyline is not closed', async () => {
  const closed = await page.evaluate(() => {
    const pl = window.__store.entities.find(e => e.type === 'polyline');
    return pl ? pl.closed : undefined;
  });
  if (closed !== false) throw new Error('Helix should not be closed');
});

// --- FIELD ---
console.log('\nFIELD:');

await runTest('FIELD registered', async () => {
  const has = await page.evaluate(() => window.__engine.commands.has('FIELD'));
  if (!has) throw new Error('FIELD not registered');
});

await runTest('FIELD alias FI', async () => {
  const found = await page.evaluate(() => {
    const def = window.__engine.commands.get('FIELD');
    return def && def.aliases.includes('FI');
  });
  if (!found) throw new Error('FI alias not found');
});

await runTest('FIELD date creates text entity', async () => {
  await clearAll();
  await cmd('FIELD');
  await cmd('date');
  await click(50, 50);
  await page.waitForTimeout(300);
  const text = await page.evaluate(() => {
    const t = window.__store.entities.find(e => e.type === 'text');
    return t ? t.text : '';
  });
  if (!text || text.length === 0) throw new Error('No text created');
});

await runTest('FIELD count inserts entity count', async () => {
  await clearAll();
  await page.evaluate(() => {
    window.__store.entities.push(
      { id: 'fc1', type: 'line', layer: '0', color: '#fff', selected: false, visible: true, start: { x: 0, y: 0 }, end: { x: 10, y: 10 } },
      { id: 'fc2', type: 'line', layer: '0', color: '#fff', selected: false, visible: true, start: { x: 0, y: 0 }, end: { x: 20, y: 20 } }
    );
    window.__store.emit();
  });
  await cmd('FIELD');
  await cmd('count');
  await click(50, 50);
  await page.waitForTimeout(300);
  const text = await page.evaluate(() => {
    const t = window.__store.entities.filter(e => e.type === 'text');
    return t.length > 0 ? t[t.length - 1].text : '';
  });
  if (!text.includes('entities')) throw new Error(`Expected entity count text, got "${text}"`);
});

await runTest('FIELD layer inserts layer name', async () => {
  await clearAll();
  await cmd('FIELD');
  await cmd('layer');
  await click(50, 50);
  await page.waitForTimeout(300);
  const text = await page.evaluate(() => {
    const t = window.__store.entities.find(e => e.type === 'text');
    return t ? t.text : '';
  });
  if (text !== '0') throw new Error(`Expected layer '0', got "${text}"`);
});

// --- MLEADERSTYLE ---
console.log('\nMLEADERSTYLE:');

await runTest('MLEADERSTYLE registered', async () => {
  const has = await page.evaluate(() => window.__engine.commands.has('MLEADERSTYLE'));
  if (!has) throw new Error('MLEADERSTYLE not registered');
});

await runTest('MLEADERSTYLE alias MLS', async () => {
  const found = await page.evaluate(() => {
    const def = window.__engine.commands.get('MLEADERSTYLE');
    return def && def.aliases.includes('MLS');
  });
  if (!found) throw new Error('MLS alias not found');
});

await runTest('MLEADERSTYLE sets text height', async () => {
  await clearAll();
  await cmd('MLEADERSTYLE');
  await cmd('textheight');
  await cmd('5');
  const h = await page.evaluate(() => (window.__store).mleaderStyle?.textHeight);
  if (h !== 5) throw new Error(`Expected 5, got ${h}`);
});

await runTest('MLEADERSTYLE sets arrow size', async () => {
  await clearAll();
  await cmd('MLEADERSTYLE');
  await cmd('arrowsize');
  await cmd('4');
  const s = await page.evaluate(() => (window.__store).mleaderStyle?.arrowSize);
  if (s !== 4) throw new Error(`Expected 4, got ${s}`);
});

// --- MLEADEREDIT ---
console.log('\nMLEADEREDIT:');

await runTest('MLEADEREDIT registered', async () => {
  const has = await page.evaluate(() => window.__engine.commands.has('MLEADEREDIT'));
  if (!has) throw new Error('MLEADEREDIT not registered');
});

await runTest('MLEADEREDIT updates text', async () => {
  await clearAll();
  await page.evaluate(() => {
    window.__store.entities.push({
      id: 'mle-t1', type: 'text', layer: '0', color: '#fff',
      selected: true, visible: true,
      position: { x: 0, y: 0 }, text: 'OldText', height: 2.5, rotation: 0
    });
    window.__store.emit();
  });
  await page.waitForTimeout(200);
  await cmd('MLEADEREDIT');
  await page.waitForTimeout(500);
  await cmd('NewText');
  await page.waitForTimeout(300);
  const text = await page.evaluate(() => {
    const e = window.__store.entities.find(e => e.id === 'mle-t1');
    return e ? e.text : '';
  });
  if (text !== 'NewText') throw new Error(`Expected 'NewText', got '${text}'`);
});

// --- DIMINSPECT ---
console.log('\nDIMINSPECT:');

await runTest('DIMINSPECT registered', async () => {
  const has = await page.evaluate(() => window.__engine.commands.has('DIMINSPECT'));
  if (!has) throw new Error('DIMINSPECT not registered');
});

await runTest('DIMINSPECT alias DINSP', async () => {
  const found = await page.evaluate(() => {
    const def = window.__engine.commands.get('DIMINSPECT');
    return def && def.aliases.includes('DINSP');
  });
  if (!found) throw new Error('DINSP alias not found');
});

await runTest('DIMINSPECT adds inspection marking', async () => {
  await clearAll();
  await page.evaluate(() => {
    window.__store.entities.push({
      id: 'dinsp-t', type: 'dimension', layer: '0', color: '#fff',
      selected: true, visible: true, dimType: 'linear',
      p1: { x: 0, y: 0 }, p2: { x: 100, y: 0 },
      textPos: { x: 50, y: -10 }, textOverride: '100.00'
    });
    window.__store.emit();
  });
  await page.waitForTimeout(200);
  await cmd('DIMINSPECT');
  await page.waitForTimeout(500);
  await cmd('50%');
  await page.waitForTimeout(300);
  const text = await page.evaluate(() => {
    const e = window.__store.entities.find(e => e.id === 'dinsp-t');
    return e ? e.textOverride : '';
  });
  if (!text.includes('◇') && !text.includes('50%')) throw new Error(`Expected inspection marking, got "${text}"`);
});

// --- LAYOUT ---
console.log('\nLAYOUT:');

await runTest('LAYOUT registered', async () => {
  const has = await page.evaluate(() => window.__engine.commands.has('LAYOUT'));
  if (!has) throw new Error('LAYOUT not registered');
});

await runTest('LAYOUT alias LAY', async () => {
  const found = await page.evaluate(() => {
    const def = window.__engine.commands.get('LAYOUT');
    return def && def.aliases.includes('LAY');
  });
  if (!found) throw new Error('LAY alias not found');
});

await runTest('LAYOUT new creates layout', async () => {
  await clearAll();
  await cmd('LAYOUT');
  await page.waitForTimeout(200);
  await cmd('new');
  await page.waitForTimeout(300);
  await cmd('TestLayout');
  await page.waitForTimeout(300);
  const layouts = await page.evaluate(() => (window.__store).layouts);
  if (!layouts || !layouts.includes('TestLayout')) throw new Error(`Layout not created. layouts=${JSON.stringify(layouts)}`);
});

await runTest('LAYOUT set changes current', async () => {
  await clearAll();
  await cmd('LAYOUT');
  await page.waitForTimeout(200);
  await cmd('new');
  await page.waitForTimeout(200);
  await cmd('SetTest');
  await page.waitForTimeout(200);
  await cmd('LAYOUT');
  await page.waitForTimeout(200);
  await cmd('set');
  await page.waitForTimeout(200);
  await cmd('SetTest');
  await page.waitForTimeout(200);
  const current = await page.evaluate(() => (window.__store).currentLayout);
  if (current !== 'SetTest') throw new Error(`Expected SetTest, got ${current}`);
});

// --- RECOVER ---
console.log('\nRECOVER:');

await runTest('RECOVER registered', async () => {
  const has = await page.evaluate(() => window.__engine.commands.has('RECOVER'));
  if (!has) throw new Error('RECOVER not registered');
});

await runTest('RECOVER detects NaN entities', async () => {
  await clearAll();
  await page.evaluate(() => {
    window.__store.entities.push(
      {
        id: 'bad1', type: 'line', layer: '0', color: '#fff',
        selected: false, visible: true,
        start: { x: NaN, y: 0 }, end: { x: 10, y: 10 }
      },
      {
        id: 'good1', type: 'line', layer: '0', color: '#fff',
        selected: false, visible: true,
        start: { x: 0, y: 0 }, end: { x: 10, y: 10 }
      }
    );
    window.__store.emit();
  });
  await page.waitForTimeout(100);
  await cmd('RECOVER');
  await page.waitForTimeout(300);
  const after = await entityCount();
  if (after !== 1) throw new Error(`Expected 1 entity after RECOVER, got ${after}`);
});

// --- CLOSEALL ---
console.log('\nCLOSEALL:');

await runTest('CLOSEALL registered', async () => {
  const has = await page.evaluate(() => window.__engine.commands.has('CLOSEALL'));
  if (!has) throw new Error('CLOSEALL not registered');
});

await runTest('CLOSEALL with No keeps entities', async () => {
  await clearAll();
  await page.evaluate(() => {
    window.__store.entities.push({
      id: 'keep1', type: 'line', layer: '0', color: '#fff',
      selected: false, visible: true,
      start: { x: 0, y: 0 }, end: { x: 10, y: 10 }
    });
    window.__store.emit();
  });
  await page.waitForTimeout(100);
  await cmd('CLOSEALL');
  await cmd('no');
  await page.waitForTimeout(200);
  const count = await entityCount();
  if (count < 1) throw new Error('Entities should be kept when answering No');
});

await runTest('CLOSEALL with Yes erases all', async () => {
  await clearAll();
  await page.evaluate(() => {
    window.__store.entities.push({
      id: 'del1', type: 'line', layer: '0', color: '#fff',
      selected: false, visible: true,
      start: { x: 0, y: 0 }, end: { x: 10, y: 10 }
    });
    window.__store.emit();
  });
  await page.waitForTimeout(100);
  await cmd('CLOSEALL');
  await cmd('yes');
  await page.waitForTimeout(300);
  const after = await entityCount();
  if (after !== 0) throw new Error(`Expected 0 entities, got ${after}`);
});

// --- VPOINT ---
console.log('\nVPOINT:');

await runTest('VPOINT registered', async () => {
  const has = await page.evaluate(() => window.__engine.commands.has('VPOINT'));
  if (!has) throw new Error('VPOINT not registered');
});

await runTest('VPOINT alias VP', async () => {
  const found = await page.evaluate(() => {
    const def = window.__engine.commands.get('VPOINT');
    return def && def.aliases.includes('VP');
  });
  if (!found) throw new Error('VP alias not found');
});

await runTest('VPOINT top sets viewRotation to 0', async () => {
  await clearAll();
  await cmd('VPOINT');
  await cmd('top');
  await page.waitForTimeout(300);
  const rot = await page.evaluate(() => (window.__store).viewRotation);
  if (rot !== 0) throw new Error(`Expected 0, got ${rot}`);
});

// --- REFEDIT ---
console.log('\nREFEDIT:');

await runTest('REFEDIT registered', async () => {
  const has = await page.evaluate(() => window.__engine.commands.has('REFEDIT'));
  if (!has) throw new Error('REFEDIT not registered');
});

await runTest('REFEDIT alias REFE', async () => {
  const found = await page.evaluate(() => {
    const def = window.__engine.commands.get('REFEDIT');
    return def && def.aliases.includes('REFE');
  });
  if (!found) throw new Error('REFE alias not found');
});

await runTest('REFEDIT with no block refs handles gracefully', async () => {
  await clearAll();
  await page.evaluate(() => {
    window.__store.entities.push({
      id: 'line1', type: 'line', layer: '0', color: '#fff',
      selected: true, visible: true,
      start: { x: 0, y: 0 }, end: { x: 10, y: 10 }
    });
    window.__store.emit();
  });
  await page.waitForTimeout(100);
  await cmd('REFEDIT');
  await page.waitForTimeout(500);
});

// === SUMMARY ===
console.log(`\n=== RESULTS: ${passed} passed, ${failed} failed ===`);
if (failures.length) {
  console.log('Failures:');
  failures.forEach(f => console.log(`  - ${f}`));
}
await browser.close();
process.exit(failed > 0 ? 1 : 0);
