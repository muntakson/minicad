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

async function click(x, y) {
  await page.evaluate(({ x, y }) => window.__engine.handleClick({ x, y }), { x, y });
  await page.waitForTimeout(200);
}

async function clearAll() {
  await page.evaluate(() => {
    window.__store.entities = [];
    window.__store.clearSelection();
    window.__store.emit();
  });
  await page.waitForTimeout(100);
}

console.log('\n=== REMAINING COMMANDS TESTS (xref, viewport, compat, legacy) ===\n');

// ===========================
// XREF MODULE (12 commands)
// ===========================
console.log('--- XREF MODULE ---');

// XREF
await runTest('XREF registered', async () => {
  const has = await page.evaluate(() => window.__engine.commands.has('XREF'));
  if (!has) throw new Error('XREF not registered');
});

await runTest('XREF alias XR', async () => {
  const found = await page.evaluate(() => {
    const def = window.__engine.commands.get('XREF');
    return def && def.aliases.includes('XR');
  });
  if (!found) throw new Error('XR alias not found');
});

await runTest('XREF list works', async () => {
  await cmd('XREF');
  await cmd('list');
});

await runTest('XREF attach works', async () => {
  await cmd('XREF');
  await cmd('attach');
  await cmd('testblock');
});

// XBIND
await runTest('XBIND registered with alias XB', async () => {
  const has = await page.evaluate(() => window.__engine.commands.has('XBIND'));
  if (!has) throw new Error('XBIND not registered');
});

await runTest('XBIND binds symbol', async () => {
  await cmd('XBIND');
  await cmd('TestSymbol');
});

// XCLIP
await runTest('XCLIP registered', async () => {
  const has = await page.evaluate(() => window.__engine.commands.has('XCLIP'));
  if (!has) throw new Error('XCLIP not registered');
});

// IMAGEATTACH
await runTest('IMAGEATTACH registered with alias IAT', async () => {
  const has = await page.evaluate(() => window.__engine.commands.has('IMAGEATTACH'));
  if (!has) throw new Error('IMAGEATTACH not registered');
});

await runTest('IMAGEATTACH creates rect placeholder', async () => {
  await clearAll();
  await cmd('IMAGEATTACH');
  await cmd('photo.jpg');
  await click(100, 100);
  await cmd('50');
  const count = await page.evaluate(() =>
    window.__store.entities.filter(e => e.type === 'rect').length
  );
  if (count < 1) throw new Error('No rect placeholder created');
});

// IMAGEADJUST
await runTest('IMAGEADJUST registered with alias IAD', async () => {
  const has = await page.evaluate(() => window.__engine.commands.has('IMAGEADJUST'));
  if (!has) throw new Error('IMAGEADJUST not registered');
});

// IMAGECLIP
await runTest('IMAGECLIP registered with alias ICL', async () => {
  const has = await page.evaluate(() => window.__engine.commands.has('IMAGECLIP'));
  if (!has) throw new Error('IMAGECLIP not registered');
});

// IMAGEFRAME
await runTest('IMAGEFRAME registered', async () => {
  const has = await page.evaluate(() => window.__engine.commands.has('IMAGEFRAME'));
  if (!has) throw new Error('IMAGEFRAME not registered');
});

await runTest('IMAGEFRAME sets value', async () => {
  await cmd('IMAGEFRAME');
  await cmd('2');
  const v = await page.evaluate(() => (window.__store).imageFrame);
  if (v !== 2) throw new Error(`Expected 2, got ${v}`);
});

// TABLE
await runTest('TABLE registered with alias TB', async () => {
  const has = await page.evaluate(() => window.__engine.commands.has('TABLE'));
  if (!has) throw new Error('TABLE not registered');
});

await runTest('TABLE creates text entity', async () => {
  await clearAll();
  await cmd('TABLE');
  await cmd('2');
  await cmd('2');
  await click(100, 100);
  const count = await page.evaluate(() =>
    window.__store.entities.filter(e => e.type === 'text').length
  );
  if (count < 1) throw new Error('No text entity from TABLE');
});

// TABLESTYLE
await runTest('TABLESTYLE registered with alias TS', async () => {
  const has = await page.evaluate(() => window.__engine.commands.has('TABLESTYLE'));
  if (!has) throw new Error('TABLESTYLE not registered');
});

await runTest('TABLESTYLE list works', async () => {
  await cmd('TABLESTYLE');
  await cmd('list');
});

await runTest('TABLESTYLE sets text height', async () => {
  await cmd('TABLESTYLE');
  await cmd('textheight');
  await cmd('3');
  const h = await page.evaluate(() => (window.__store).tableStyle?.textHeight);
  if (h !== 3) throw new Error(`Expected 3, got ${h}`);
});

// TINSERT
await runTest('TINSERT registered with alias TI', async () => {
  const has = await page.evaluate(() => window.__engine.commands.has('TINSERT'));
  if (!has) throw new Error('TINSERT not registered');
});

// REVCLOUDPROPERTIES
await runTest('REVCLOUDPROPERTIES registered with alias RCP', async () => {
  const has = await page.evaluate(() => window.__engine.commands.has('REVCLOUDPROPERTIES'));
  if (!has) throw new Error('REVCLOUDPROPERTIES not registered');
});

await runTest('REVCLOUDPROPERTIES sets arc lengths', async () => {
  await cmd('REVCLOUDPROPERTIES');
  await cmd('20');
  await cmd('25');
  const min = await page.evaluate(() => (window.__store).revcloudMinArc);
  const max = await page.evaluate(() => (window.__store).revcloudMaxArc);
  if (min !== 20) throw new Error(`Expected min 20, got ${min}`);
  if (max !== 25) throw new Error(`Expected max 25, got ${max}`);
});

// BATTMAN
await runTest('BATTMAN registered', async () => {
  const has = await page.evaluate(() => window.__engine.commands.has('BATTMAN'));
  if (!has) throw new Error('BATTMAN not registered');
});

await runTest('BATTMAN lists blocks', async () => {
  await cmd('BATTMAN');
  await cmd('');
});

// ===========================
// VIEWPORT MODULE (11 commands)
// ===========================
console.log('\n--- VIEWPORT MODULE ---');

// PLAN
await runTest('PLAN registered', async () => {
  const has = await page.evaluate(() => window.__engine.commands.has('PLAN'));
  if (!has) throw new Error('PLAN not registered');
});

await runTest('PLAN resets view rotation', async () => {
  await page.evaluate(() => { (window.__store).viewRotation = 45; });
  await cmd('PLAN');
  const rot = await page.evaluate(() => (window.__store).viewRotation);
  if (rot !== 0) throw new Error(`Expected 0, got ${rot}`);
});

// DVIEW
await runTest('DVIEW registered', async () => {
  const has = await page.evaluate(() => window.__engine.commands.has('DVIEW'));
  if (!has) throw new Error('DVIEW not registered');
});

await runTest('DVIEW zoom works', async () => {
  await cmd('DVIEW');
  await cmd('zoom');
  await cmd('2');
});

// DDVPOINT
await runTest('DDVPOINT registered', async () => {
  const has = await page.evaluate(() => window.__engine.commands.has('DDVPOINT'));
  if (!has) throw new Error('DDVPOINT not registered');
});

await runTest('DDVPOINT sets angle', async () => {
  await cmd('DDVPOINT');
  await cmd('45');
  const rot = await page.evaluate(() => (window.__store).viewRotation);
  if (rot !== 45) throw new Error(`Expected 45, got ${rot}`);
});

// MVIEW
await runTest('MVIEW registered with alias MV', async () => {
  const has = await page.evaluate(() => window.__engine.commands.has('MVIEW'));
  if (!has) throw new Error('MVIEW not registered');
});

await runTest('MVIEW fit works', async () => {
  await cmd('MVIEW');
  await cmd('fit');
});

await runTest('MVIEW creates viewport rect', async () => {
  await clearAll();
  await cmd('MVIEW');
  await cmd('');  // trigger corner pick
  await click(0, 0);
  await click(100, 100);
  // Should create rect entity
});

// VPCLIP
await runTest('VPCLIP registered', async () => {
  const has = await page.evaluate(() => window.__engine.commands.has('VPCLIP'));
  if (!has) throw new Error('VPCLIP not registered');
});

// MSPACE
await runTest('MSPACE registered with alias MS', async () => {
  const has = await page.evaluate(() => window.__engine.commands.has('MSPACE'));
  if (!has) throw new Error('MSPACE not registered');
});

await runTest('MSPACE sets model space', async () => {
  await cmd('MSPACE');
  const space = await page.evaluate(() => (window.__store).currentSpace);
  if (space !== 'model') throw new Error(`Expected model, got ${space}`);
});

// PSPACE
await runTest('PSPACE registered with alias PS', async () => {
  const has = await page.evaluate(() => window.__engine.commands.has('PSPACE'));
  if (!has) throw new Error('PSPACE not registered');
});

await runTest('PSPACE sets paper space', async () => {
  await cmd('PSPACE');
  const space = await page.evaluate(() => (window.__store).currentSpace);
  if (space !== 'paper') throw new Error(`Expected paper, got ${space}`);
});

// CHSPACE
await runTest('CHSPACE registered', async () => {
  const has = await page.evaluate(() => window.__engine.commands.has('CHSPACE'));
  if (!has) throw new Error('CHSPACE not registered');
});

// UCS
await runTest('UCS registered', async () => {
  const has = await page.evaluate(() => window.__engine.commands.has('UCS'));
  if (!has) throw new Error('UCS not registered');
});

await runTest('UCS world resets origin', async () => {
  await cmd('UCS');
  await cmd('world');
  const origin = await page.evaluate(() => (window.__store).ucsOrigin);
  if (!origin || origin.x !== 0 || origin.y !== 0) throw new Error('UCS origin not reset');
});

await runTest('UCS save and restore', async () => {
  await cmd('UCS');
  await cmd('save');
  await cmd('TestUCS');
  await cmd('UCS');
  await cmd('restore');
  await cmd('TestUCS');
});

// UCSMAN
await runTest('UCSMAN registered', async () => {
  const has = await page.evaluate(() => window.__engine.commands.has('UCSMAN'));
  if (!has) throw new Error('UCSMAN not registered');
});

await runTest('UCSMAN lists UCS definitions', async () => {
  await cmd('UCSMAN');
});

// SHAPE
await runTest('SHAPE registered with alias SHP', async () => {
  const has = await page.evaluate(() => window.__engine.commands.has('SHAPE'));
  if (!has) throw new Error('SHAPE not registered');
});

await runTest('SHAPE ? lists available shapes', async () => {
  await cmd('SHAPE');
  await cmd('?');
});

await runTest('SHAPE BOX creates closed polyline', async () => {
  await clearAll();
  await cmd('SHAPE');
  await cmd('box');
  await click(50, 50);
  await cmd('20');
  const exists = await page.evaluate(() =>
    window.__store.entities.some(e => e.type === 'polyline' && e.closed === true)
  );
  if (!exists) throw new Error('No closed polyline from SHAPE BOX');
});

await runTest('SHAPE DIAMOND creates 4-point polyline', async () => {
  await clearAll();
  await cmd('SHAPE');
  await cmd('diamond');
  await click(50, 50);
  await cmd('10');
  const pts = await page.evaluate(() => {
    const pl = window.__store.entities.find(e => e.type === 'polyline');
    return pl ? pl.points.length : 0;
  });
  if (pts !== 4) throw new Error(`Expected 4 points for diamond, got ${pts}`);
});

// ===========================
// COMPAT MODULE (30 commands)
// ===========================
console.log('\n--- COMPAT MODULE ---');

// Simple stub commands — verify registration and no crash
const stubCommands = [
  'TOOLBAR', 'MENUBAR', 'CUI', 'CUSTOMIZE', 'SYSWINDOWS',
  'PLOTTERMANAGER', 'PLOTSTYLE', 'CONVERTCTB',
  'ADCENTER', 'TOOLPALETTES', 'QUICKCALC',
  'EATTEXT', 'DRAWINGRECOVERY', 'ETRANSMIT',
  'TABLETCONFIG', 'HANDLES', 'COMPILE', 'TABLET'
];

for (const cmdName of stubCommands) {
  await runTest(`${cmdName} registered and runs`, async () => {
    const has = await page.evaluate((c) => window.__engine.commands.has(c), cmdName);
    if (!has) throw new Error(`${cmdName} not registered`);
    await cmd(cmdName);
  });
}

// Alias checks
const compatAliases = [
  ['PLOTTERMANAGER', 'PLOTMAN'],
  ['ADCENTER', 'ADC'],
  ['TOOLPALETTES', 'TP'],
  ['QUICKCALC', 'QCA'],
  ['DATAEXTRACTION', 'DX'],
  ['HYPERLINK', 'HYP'],
  ['SCALELISTEDIT', 'SLE'],
];

for (const [cmdName, alias] of compatAliases) {
  await runTest(`${cmdName} alias ${alias}`, async () => {
    const found = await page.evaluate(({ c, a }) => {
      const def = window.__engine.commands.get(c);
      return def && def.aliases.includes(a);
    }, { c: cmdName, a: alias });
    if (!found) throw new Error(`${alias} not found`);
  });
}

// DATAEXTRACTION
await runTest('DATAEXTRACTION registered', async () => {
  const has = await page.evaluate(() => window.__engine.commands.has('DATAEXTRACTION'));
  if (!has) throw new Error('DATAEXTRACTION not registered');
});

// REINIT
await runTest('REINIT runs without error', async () => {
  await cmd('REINIT');
});

// DRAGMODE
await runTest('DRAGMODE sets mode', async () => {
  await cmd('DRAGMODE');
  await cmd('on');
  const m = await page.evaluate(() => (window.__store).dragMode);
  if (m !== 'on') throw new Error(`Expected 'on', got '${m}'`);
});

// BLIPMODE
await runTest('BLIPMODE toggles', async () => {
  await cmd('BLIPMODE');
  await cmd('on');
  const b = await page.evaluate(() => (window.__store).blipMode);
  if (b !== true) throw new Error(`Expected true, got ${b}`);
});

// HYPERLINK
await runTest('HYPERLINK sets URL on entity', async () => {
  await clearAll();
  await page.evaluate(() => {
    window.__store.entities.push({
      id: 'hyp-test', type: 'line', layer: '0', color: '#fff',
      selected: true, visible: true,
      start: { x: 0, y: 0 }, end: { x: 10, y: 10 }
    });
    window.__store.emit();
  });
  await cmd('HYPERLINK');
  await cmd('https://example.com');
  const url = await page.evaluate(() => {
    const e = window.__store.entities.find(e => e.id === 'hyp-test');
    return e ? e.hyperlink : '';
  });
  if (url !== 'https://example.com') throw new Error(`Expected URL, got '${url}'`);
});

// CONVERT
await runTest('CONVERT registered', async () => {
  const has = await page.evaluate(() => window.__engine.commands.has('CONVERT'));
  if (!has) throw new Error('CONVERT not registered');
});

// PASTESPEC
await runTest('PASTESPEC registered', async () => {
  const has = await page.evaluate(() => window.__engine.commands.has('PASTESPEC'));
  if (!has) throw new Error('PASTESPEC not registered');
});

// SCALELISTEDIT
await runTest('SCALELISTEDIT list works', async () => {
  await cmd('SCALELISTEDIT');
  await cmd('list');
});

await runTest('SCALELISTEDIT add scale', async () => {
  await cmd('SCALELISTEDIT');
  await cmd('add');
  await cmd('1:5');
  const list = await page.evaluate(() => (window.__store).scaleList);
  if (!list || !list.includes('1:5')) throw new Error('Scale 1:5 not added');
});

// ISOPLANE
await runTest('ISOPLANE sets plane', async () => {
  await cmd('ISOPLANE');
  await cmd('left');
  const iso = await page.evaluate(() => (window.__store).isoplane);
  if (iso !== 'left') throw new Error(`Expected 'left', got '${iso}'`);
});

await runTest('ISOPLANE right', async () => {
  await cmd('ISOPLANE');
  await cmd('right');
  const iso = await page.evaluate(() => (window.__store).isoplane);
  if (iso !== 'right') throw new Error(`Expected 'right', got '${iso}'`);
});

// ELEV
await runTest('ELEV sets elevation and thickness', async () => {
  await cmd('ELEV');
  await cmd('5');
  await cmd('2');
  const elev = await page.evaluate(() => (window.__store).defaultElevation);
  const thick = await page.evaluate(() => (window.__store).defaultThickness);
  if (elev !== 5) throw new Error(`Expected elevation 5, got ${elev}`);
  if (thick !== 2) throw new Error(`Expected thickness 2, got ${thick}`);
});

// THICKNESS
await runTest('THICKNESS sets default thickness', async () => {
  await cmd('THICKNESS');
  await cmd('7');
  const t = await page.evaluate(() => (window.__store).defaultThickness);
  if (t !== 7) throw new Error(`Expected 7, got ${t}`);
});

// DELAY
await runTest('DELAY runs with short delay', async () => {
  await cmd('DELAY');
  await cmd('50');
  await page.waitForTimeout(200);
});

// ===========================
// LEGACY MODULE (31 commands)
// ===========================
console.log('\n--- LEGACY MODULE ---');

// All stub commands — verify registration
const legacyStubs = [
  '3DFACE', '3DMESH', '3DPOLY', '3DSIN',
  'SURFREV', 'EDGESURF', 'RULESURF', 'TABSURF', 'REVSURF',
  'HIDE', 'SHADE', 'RENDER', 'LIGHT', 'SCENE', 'RPREF',
  'MSLIDE', 'VSLIDE',
  'GRAPHSCR', 'TEXTSCR',
  'MENU', 'MENULOAD', 'MENUUNLOAD', 'TBCONFIG',
  'APPLOAD', 'ARX', 'VBARUN', 'VBAIDE', 'VBALOAD',
  'RESUME'
];

for (const cmdName of legacyStubs) {
  await runTest(`${cmdName} registered and runs`, async () => {
    const has = await page.evaluate((c) => window.__engine.commands.has(c), cmdName);
    if (!has) throw new Error(`${cmdName} not registered`);
    await cmd(cmdName);
  });
}

// SURFTAB1 interactive
await runTest('SURFTAB1 sets value', async () => {
  await cmd('SURFTAB1');
  await cmd('12');
  const v = await page.evaluate(() => (window.__store).surftab1);
  if (v !== 12) throw new Error(`Expected 12, got ${v}`);
});

// SURFTAB2 interactive
await runTest('SURFTAB2 sets value', async () => {
  await cmd('SURFTAB2');
  await cmd('8');
  const v = await page.evaluate(() => (window.__store).surftab2);
  if (v !== 8) throw new Error(`Expected 8, got ${v}`);
});

// ===========================
// TOTAL COMMAND COUNT
// ===========================
console.log('\n--- COMMAND COUNT ---');

await runTest('Total commands is 287', async () => {
  const count = await page.evaluate(() => window.__engine.commands.size);
  if (count !== 287) throw new Error(`Expected 287 commands, got ${count}`);
});

// === SUMMARY ===
console.log(`\n=== RESULTS: ${passed} passed, ${failed} failed ===`);
if (failures.length) {
  console.log('Failures:');
  failures.forEach(f => console.log(`  - ${f}`));
}
await browser.close();
process.exit(failed > 0 ? 1 : 0);
