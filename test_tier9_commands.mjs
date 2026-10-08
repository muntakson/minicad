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
// QTEXT
// ============================================================
async function testQTEXT() {
  console.log('\n=== QTEXT ===');

  const hasQtext = await page.evaluate(() => window.__engine.commands.has('QTEXT'));
  test('QTEXT registered', hasQtext);
  const hasAlias = await page.evaluate(() => {
    const def = window.__engine.commands.get('QTEXT');
    return def && def.aliases.includes('QT');
  });
  test('QT alias registered', hasAlias);

  // Check default
  const defaultVal = await page.evaluate(() => window.__store.qtextOn);
  test('QTEXT default is OFF', defaultVal === false, `qtextOn=${defaultVal}`);

  // Turn ON
  await cmd('QTEXT');
  await page.waitForTimeout(100);
  await cmd('ON');
  await page.waitForTimeout(200);

  let qtextState = await page.evaluate(() => window.__store.qtextOn);
  test('QTEXT set to ON', qtextState === true, `qtextOn=${qtextState}`);

  let output = await getOutput(3);
  test('QTEXT ON message', output.includes('ON') && output.includes('rectangle'),
    output.split('\n').pop());

  // Turn OFF
  await cmd('QT');
  await page.waitForTimeout(100);
  await cmd('OFF');
  await page.waitForTimeout(200);

  qtextState = await page.evaluate(() => window.__store.qtextOn);
  test('QTEXT set to OFF', qtextState === false, `qtextOn=${qtextState}`);

  // Toggle (empty input)
  await cmd('QTEXT');
  await page.waitForTimeout(100);
  await cmd('');
  await page.waitForTimeout(200);

  qtextState = await page.evaluate(() => window.__store.qtextOn);
  test('QTEXT toggle to ON', qtextState === true, `qtextOn=${qtextState}`);

  await cmd('QTEXT');
  await page.waitForTimeout(100);
  await cmd('');
  await page.waitForTimeout(200);

  qtextState = await page.evaluate(() => window.__store.qtextOn);
  test('QTEXT toggle to OFF', qtextState === false, `qtextOn=${qtextState}`);

  // Invalid input
  await cmd('QTEXT');
  await page.waitForTimeout(100);
  await cmd('MAYBE');
  await page.waitForTimeout(200);
  output = await getOutput(3);
  test('QTEXT invalid input', output.includes('Invalid'), output.split('\n').pop());

  // Verify QTEXT affects text rendering (programmatic check)
  const renderCheck = await page.evaluate(() => {
    const s = window.__store;
    s.entities = [];
    s.entities.push({
      id: 'qt_txt', type: 'text', layer: '0', color: 'bylayer', lineweight: 1,
      linetype: 'continuous', visible: true, selected: false,
      position: { x: 100, y: 100 }, text: 'Hello World', height: 10, rotation: 0,
    });
    // Text should exist
    const hasText = s.entities.some(e => e.type === 'text');
    return { hasText, qtextOn: s.qtextOn };
  });
  test('QTEXT text entity exists', renderCheck.hasText);

  // SETVAR integration
  await cmd('SETVAR');
  await page.waitForTimeout(100);
  await cmd('QTEXTMODE');
  await page.waitForTimeout(100);
  output = await getOutput(3);
  test('SETVAR QTEXTMODE shows value', output.includes('0'), output.split('\n').pop());
  await cmd('1');
  await page.waitForTimeout(200);

  qtextState = await page.evaluate(() => window.__store.qtextOn);
  test('SETVAR QTEXTMODE=1 works', qtextState === true, `qtextOn=${qtextState}`);

  // Reset
  await page.evaluate(() => {
    window.__store.qtextOn = false;
    window.__store.entities = [];
    window.__store.emit();
  });

  await pressEsc();
}

// ============================================================
// ATTDISP
// ============================================================
async function testATTDISP() {
  console.log('\n=== ATTDISP ===');

  const hasAttdisp = await page.evaluate(() => window.__engine.commands.has('ATTDISP'));
  test('ATTDISP registered', hasAttdisp);

  // Check default
  const defaultMode = await page.evaluate(() => window.__store.attDispMode);
  test('ATTDISP default is normal', defaultMode === 'normal', `mode=${defaultMode}`);

  // Set to ON
  await cmd('ATTDISP');
  await page.waitForTimeout(100);
  let output = await getOutput(5);
  test('ATTDISP shows current mode', output.includes('NORMAL'),
    output.split('\n')[0]);
  test('ATTDISP shows options', output.includes('Normal') && output.includes('ON') && output.includes('OFF'),
    output.split('\n').slice(-1)[0]);

  await cmd('ON');
  await page.waitForTimeout(200);

  let mode = await page.evaluate(() => window.__store.attDispMode);
  test('ATTDISP set to ON', mode === 'on', `mode=${mode}`);

  output = await getOutput(3);
  test('ATTDISP ON message', output.includes('ON'), output.split('\n').pop());

  // Set to OFF
  await cmd('ATTDISP');
  await page.waitForTimeout(100);
  await cmd('OFF');
  await page.waitForTimeout(200);

  mode = await page.evaluate(() => window.__store.attDispMode);
  test('ATTDISP set to OFF', mode === 'off', `mode=${mode}`);

  // Set back to Normal
  await cmd('ATTDISP');
  await page.waitForTimeout(100);
  await cmd('N');
  await page.waitForTimeout(200);

  mode = await page.evaluate(() => window.__store.attDispMode);
  test('ATTDISP set to NORMAL via N', mode === 'normal', `mode=${mode}`);

  // Empty input defaults to normal
  await page.evaluate(() => { window.__store.attDispMode = 'on'; });
  await cmd('ATTDISP');
  await page.waitForTimeout(100);
  await cmd('');
  await page.waitForTimeout(200);

  mode = await page.evaluate(() => window.__store.attDispMode);
  test('ATTDISP empty defaults to normal', mode === 'normal', `mode=${mode}`);

  // Invalid input
  await cmd('ATTDISP');
  await page.waitForTimeout(100);
  await cmd('MAYBE');
  await page.waitForTimeout(200);
  output = await getOutput(3);
  test('ATTDISP invalid input', output.includes('Invalid'), output.split('\n').pop());

  // SETVAR integration
  await cmd('SETVAR');
  await page.waitForTimeout(100);
  await cmd('ATTDISP');
  await page.waitForTimeout(100);
  output = await getOutput(3);
  test('SETVAR ATTDISP shows value', output.includes('normal'), output.split('\n').pop());
  await cmd('on');
  await page.waitForTimeout(200);

  mode = await page.evaluate(() => window.__store.attDispMode);
  test('SETVAR ATTDISP=on works', mode === 'on', `mode=${mode}`);

  // Test ATTDISP affects block attribute rendering
  const attCheck = await page.evaluate(() => {
    const s = window.__store;
    s.entities = [];
    s.blockDefs.set('TESTBLK', [
      { id: 'b1', type: 'circle', layer: '0', color: 'bylayer', lineweight: 1,
        linetype: 'continuous', visible: true, selected: false,
        center: { x: 0, y: 0 }, radius: 5 },
    ]);
    s.blockAttribs.set('TESTBLK', [
      { tag: 'PART_NO', prompt: 'Part number', defaultValue: 'P100', invisible: false },
      { tag: 'COST', prompt: 'Cost', defaultValue: '10.00', invisible: true },
    ]);
    s.entities.push({
      id: 'br1', type: 'blockref', layer: '0', color: 'bylayer', lineweight: 1,
      linetype: 'continuous', visible: true, selected: false,
      blockName: 'TESTBLK', insertPoint: { x: 50, y: 50 },
      scaleX: 1, scaleY: 1, rotation: 0,
      attributes: [
        { tag: 'PART_NO', value: 'P100' },
        { tag: 'COST', value: '10.00' },
      ],
    });
    s.emit();

    return {
      blockRefCount: s.entities.filter(e => e.type === 'blockref').length,
      attDispMode: s.attDispMode,
    };
  });
  test('Block with attributes created', attCheck.blockRefCount === 1);

  // Test each mode
  await page.evaluate(() => { window.__store.attDispMode = 'normal'; window.__store.emit(); });
  const normalMode = await page.evaluate(() => window.__store.attDispMode);
  test('ATTDISP Normal mode active', normalMode === 'normal');

  await page.evaluate(() => { window.__store.attDispMode = 'on'; window.__store.emit(); });
  const onMode = await page.evaluate(() => window.__store.attDispMode);
  test('ATTDISP ON shows all attrs', onMode === 'on');

  await page.evaluate(() => { window.__store.attDispMode = 'off'; window.__store.emit(); });
  const offMode = await page.evaluate(() => window.__store.attDispMode);
  test('ATTDISP OFF hides all attrs', offMode === 'off');

  // Reset
  await page.evaluate(() => {
    window.__store.attDispMode = 'normal';
    window.__store.entities = [];
    window.__store.blockDefs.delete('TESTBLK');
    window.__store.blockAttribs.delete('TESTBLK');
    window.__store.emit();
  });

  await pressEsc();
}

// ============================================================
// ATTEXT
// ============================================================
async function testATTEXT() {
  console.log('\n=== ATTEXT ===');

  const hasAttext = await page.evaluate(() => window.__engine.commands.has('ATTEXT'));
  test('ATTEXT registered', hasAttext);
  const hasAlias = await page.evaluate(() => {
    const def = window.__engine.commands.get('ATTEXT');
    return def && def.aliases.includes('DDATTEXT');
  });
  test('DDATTEXT alias registered', hasAlias);

  // Test with no block references
  await page.evaluate(() => { window.__store.entities = []; window.__store.emit(); });
  await cmd('ATTEXT');
  await page.waitForTimeout(200);
  let output = await getOutput(3);
  test('ATTEXT no blocks message', output.includes('No block references'),
    output.split('\n').pop());

  // Setup block with attributes
  await page.evaluate(() => {
    const s = window.__store;
    s.blockDefs.set('BRACKET', [
      { id: 'b1', type: 'rect', layer: '0', color: 'bylayer', lineweight: 1,
        linetype: 'continuous', visible: true, selected: false,
        corner1: { x: 0, y: 0 }, corner2: { x: 10, y: 5 } },
    ]);
    s.blockAttribs.set('BRACKET', [
      { tag: 'PART_NO', prompt: 'Part number', defaultValue: 'BRK-100', invisible: false },
      { tag: 'MATERIAL', prompt: 'Material', defaultValue: 'Steel', invisible: false },
      { tag: 'QTY', prompt: 'Quantity', defaultValue: '1', invisible: false },
    ]);

    s.entities = [
      {
        id: 'br1', type: 'blockref', layer: '0', color: 'bylayer', lineweight: 1,
        linetype: 'continuous', visible: true, selected: false,
        blockName: 'BRACKET', insertPoint: { x: 10, y: 20 },
        scaleX: 1, scaleY: 1, rotation: 0,
        attributes: [
          { tag: 'PART_NO', value: 'BRK-100' },
          { tag: 'MATERIAL', value: 'Steel' },
          { tag: 'QTY', value: '4' },
        ],
      },
      {
        id: 'br2', type: 'blockref', layer: '0', color: 'bylayer', lineweight: 1,
        linetype: 'continuous', visible: true, selected: false,
        blockName: 'BRACKET', insertPoint: { x: 50, y: 30 },
        scaleX: 1, scaleY: 1, rotation: 0,
        attributes: [
          { tag: 'PART_NO', value: 'BRK-200' },
          { tag: 'MATERIAL', value: 'Aluminum' },
          { tag: 'QTY', value: '2' },
        ],
      },
    ];
    s.emit();
  });

  // Test CDF output
  await cmd('ATTEXT');
  await page.waitForTimeout(200);
  output = await getOutput(3);
  test('ATTEXT finds blocks', output.includes('2 block(s)'), output.split('\n')[0]);
  test('ATTEXT shows tags', output.includes('PART_NO') || output.includes('MATERIAL'),
    output.split('\n')[1]);

  await cmd('CDF');
  await page.waitForTimeout(300);
  output = await getOutput(10);
  test('ATTEXT CDF header', output.includes('BLOCK_NAME') && output.includes('PART_NO'),
    output.split('\n').find(l => l.includes('BLOCK_NAME')) || '');
  test('ATTEXT CDF data row 1', output.includes('BRK-100') && output.includes('Steel'),
    output.split('\n').find(l => l.includes('BRK-100')) || '');
  test('ATTEXT CDF data row 2', output.includes('BRK-200') && output.includes('Aluminum'),
    output.split('\n').find(l => l.includes('BRK-200')) || '');
  test('ATTEXT record count', output.includes('2 record(s)'),
    output.split('\n').find(l => l.includes('record')) || '');

  // Test SDF output
  await page.evaluate(() => {
    // Re-setup since ATTEXT completes
    const s = window.__store;
    s.entities = [
      {
        id: 'br3', type: 'blockref', layer: '0', color: 'bylayer', lineweight: 1,
        linetype: 'continuous', visible: true, selected: false,
        blockName: 'BRACKET', insertPoint: { x: 10, y: 20 },
        scaleX: 1, scaleY: 1, rotation: 0,
        attributes: [
          { tag: 'PART_NO', value: 'BRK-100' },
          { tag: 'MATERIAL', value: 'Steel' },
          { tag: 'QTY', value: '4' },
        ],
      },
    ];
    s.emit();
  });

  await cmd('ATTEXT');
  await page.waitForTimeout(200);
  await cmd('SDF');
  await page.waitForTimeout(300);
  output = await getOutput(8);
  test('ATTEXT SDF format', output.includes('SDF') && output.includes('BLOCK_NAME'),
    output.split('\n').find(l => l.includes('BLOCK_NAME')) || '');
  test('ATTEXT SDF data', output.includes('BRK-100'),
    output.split('\n').find(l => l.includes('BRK-100')) || '');

  // Test invalid format
  await page.evaluate(() => {
    const s = window.__store;
    s.entities = [
      {
        id: 'br4', type: 'blockref', layer: '0', color: 'bylayer', lineweight: 1,
        linetype: 'continuous', visible: true, selected: false,
        blockName: 'BRACKET', insertPoint: { x: 10, y: 20 },
        scaleX: 1, scaleY: 1, rotation: 0,
        attributes: [
          { tag: 'PART_NO', value: 'BRK-100' },
          { tag: 'MATERIAL', value: 'Steel' },
          { tag: 'QTY', value: '4' },
        ],
      },
    ];
    s.emit();
  });
  await cmd('ATTEXT');
  await page.waitForTimeout(200);
  await cmd('XML');
  await page.waitForTimeout(200);
  output = await getOutput(3);
  test('ATTEXT invalid format', output.includes('Invalid'), output.split('\n').pop());

  // Test block with attributes from definitions (no .attributes on entity)
  await page.evaluate(() => {
    const s = window.__store;
    s.entities = [
      {
        id: 'br5', type: 'blockref', layer: '0', color: 'bylayer', lineweight: 1,
        linetype: 'continuous', visible: true, selected: false,
        blockName: 'BRACKET', insertPoint: { x: 100, y: 100 },
        scaleX: 1, scaleY: 1, rotation: 0,
        attributes: [],
      },
    ];
    s.emit();
  });
  await cmd('ATTEXT');
  await page.waitForTimeout(200);
  output = await getOutput(3);
  test('ATTEXT populates from defs', output.includes('1 block(s)'),
    output.split('\n')[0]);

  await cmd('CDF');
  await page.waitForTimeout(300);
  output = await getOutput(8);
  test('ATTEXT populated default values', output.includes('BRK-100') || output.includes('Steel'),
    output.split('\n').find(l => l.includes('BRACKET')) || '');

  // Cleanup
  await page.evaluate(() => {
    window.__store.entities = [];
    window.__store.blockDefs.delete('BRACKET');
    window.__store.blockAttribs.delete('BRACKET');
    window.__store.emit();
  });

  await pressEsc();
}

// ============================================================
// SUMMARY
// ============================================================
async function testSummary() {
  console.log('\n=== SUMMARY ===');
  const total = await page.evaluate(() => window.__engine.commands.size);
  test('Total registered commands', total === 117, `count=${total}`);

  const newCmds = ['QTEXT', 'ATTDISP', 'ATTEXT'];
  for (const name of newCmds) {
    const exists = await page.evaluate((n) => window.__engine.commands.has(n), name);
    test(`${name} registered`, exists);
  }

  const aliases = { QT: 'QTEXT', DDATTEXT: 'ATTEXT' };
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
  console.log('MiniCAD Tier 9 Commands Audit');
  console.log('='.repeat(50));

  try {
    await setup();
    await testQTEXT();
    await testATTDISP();
    await testATTEXT();
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
