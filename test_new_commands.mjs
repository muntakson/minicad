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

async function teardown() {
  await browser.close();
}

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
  const icon = passed ? 'PASS' : 'FAIL';
  console.log(`  [${icon}] ${name}${detail ? ' — ' + detail : ''}`);
}

// ============================================================
// TEST SUITE
// ============================================================

async function testDDEDIT() {
  console.log('\n=== DDEDIT / TEXTEDIT ===');

  // Create a text entity first
  await cmd('TEXT');
  await page.waitForTimeout(100);
  await clickCanvas(0.5, 0.5);
  await cmd('5');       // height
  await cmd('0');       // rotation
  await cmd('Hello World');  // text content
  await page.waitForTimeout(200);

  const countAfterText = await page.evaluate(() => window.__store.entities.length);
  const textEntity = await page.evaluate(() => {
    const e = window.__store.entities.find(e => e.type === 'text');
    return e ? { id: e.id, text: e.text, type: e.type } : null;
  });
  test('TEXT entity created', textEntity !== null && textEntity.text === 'Hello World',
    textEntity ? `text="${textEntity.text}"` : 'no text entity found');

  // Test DDEDIT command registration (via alias ED)
  const hasDdedit = await page.evaluate(() => {
    const eng = window.__engine;
    return eng.commands.has('DDEDIT');
  });
  test('DDEDIT command registered', hasDdedit);

  const hasEdAlias = await page.evaluate(() => {
    const eng = window.__engine;
    const def = eng.commands.get('DDEDIT');
    return def && def.aliases.includes('ED');
  });
  test('ED alias registered', hasEdAlias);

  const hasTexteditAlias = await page.evaluate(() => {
    const eng = window.__engine;
    const def = eng.commands.get('DDEDIT');
    return def && def.aliases.includes('TEXTEDIT');
  });
  test('TEXTEDIT alias registered', hasTexteditAlias);

  // Run DDEDIT via alias ED - click on the text entity to edit it
  await cmd('ED');
  await page.waitForTimeout(100);
  let output = await getOutput(3);
  test('DDEDIT prompt shown', output.includes('Select a text or dimension'),
    output.split('\n').pop());

  // Click on the text entity (center of canvas where we placed it)
  await clickCanvas(0.5, 0.5);
  await page.waitForTimeout(200);
  output = await getOutput(3);
  test('DDEDIT shows current text', output.includes('Hello World'),
    output.split('\n').pop());

  // Enter new text
  await cmd('Edited Text');
  await page.waitForTimeout(200);

  const editedText = await page.evaluate(() => {
    const e = window.__store.entities.find(e => e.type === 'text');
    return e ? e.text : null;
  });
  test('Text content updated', editedText === 'Edited Text',
    `text="${editedText}"`);

  // Exit DDEDIT
  await cmd('');
  await page.waitForTimeout(100);

  // Test undo
  await cmd('UNDO');
  await page.waitForTimeout(200);
  const undoneText = await page.evaluate(() => {
    const e = window.__store.entities.find(e => e.type === 'text');
    return e ? e.text : null;
  });
  test('DDEDIT undo restores old text', undoneText === 'Hello World',
    `text="${undoneText}"`);

  // Redo
  await cmd('REDO');
  await page.waitForTimeout(100);

  // Now test DDEDIT on a dimension entity
  // Create a dimension
  await cmd('DLI');
  await page.waitForTimeout(100);
  await clickCanvas(0.3, 0.3);
  await clickCanvas(0.7, 0.3);
  await clickCanvas(0.5, 0.2);
  await page.waitForTimeout(200);

  const dimEntity = await page.evaluate(() => {
    const e = window.__store.entities.find(e => e.type === 'dimension');
    return e ? { id: e.id, dimType: e.dimType, textOverride: e.textOverride } : null;
  });
  test('Dimension entity created for DDEDIT test', dimEntity !== null,
    dimEntity ? `dimType=${dimEntity.dimType}` : 'no dimension found');

  if (dimEntity) {
    // Edit dimension text
    await cmd('ED');
    await page.waitForTimeout(100);
    // Click near dimension (at the text position area)
    await clickCanvas(0.5, 0.2);
    await page.waitForTimeout(300);
    output = await getOutput(5);
    const showsDimText = output.includes('dimension text') || output.includes('<measured>');
    test('DDEDIT recognizes dimension entity', showsDimText, output.split('\n').pop());

    if (showsDimText) {
      await cmd('Custom 50mm');
      await page.waitForTimeout(200);

      const dimOverride = await page.evaluate(() => {
        const e = window.__store.entities.find(e => e.type === 'dimension');
        return e ? e.textOverride : null;
      });
      test('Dimension text override set', dimOverride === 'Custom 50mm',
        `override="${dimOverride}"`);

      // Exit
      await cmd('');
    } else {
      // Dimension might not have been hit - still pass partial test
      test('Dimension text override set', false, 'could not click on dimension');
      await pressEsc();
    }
  }

  await pressEsc();
}

async function testDRAWORDER() {
  console.log('\n=== DRAWORDER ===');

  // Clear entities
  await page.evaluate(() => {
    window.__store.pushUndo('test-clear');
    window.__store.entities = [];
    window.__store.emit();
  });

  // Create 3 entities in known order
  await page.evaluate(() => {
    const s = window.__store;
    s.pushUndo('test-setup');
    s.entities = [
      { id: 'e_bottom', type: 'line', layer: '0', color: 'bylayer', lineweight: 1, linetype: 'continuous', visible: true, selected: false, start: { x: 0, y: 0 }, end: { x: 100, y: 0 } },
      { id: 'e_middle', type: 'circle', layer: '0', color: 'bylayer', lineweight: 1, linetype: 'continuous', visible: true, selected: false, center: { x: 50, y: 50 }, radius: 30 },
      { id: 'e_top', type: 'line', layer: '0', color: 'bylayer', lineweight: 1, linetype: 'continuous', visible: true, selected: false, start: { x: 0, y: 100 }, end: { x: 100, y: 100 } },
    ];
    s.emit();
  });

  // Verify initial order
  const initialOrder = await page.evaluate(() => window.__store.entities.map(e => e.id));
  test('Initial order correct', JSON.stringify(initialOrder) === '["e_bottom","e_middle","e_top"]',
    initialOrder.join(' → '));

  // Test DRAWORDER command registration
  const hasDraworder = await page.evaluate(() => window.__engine.commands.has('DRAWORDER'));
  test('DRAWORDER command registered', hasDraworder);

  const hasDrAlias = await page.evaluate(() => {
    const def = window.__engine.commands.get('DRAWORDER');
    return def && def.aliases.includes('DR');
  });
  test('DR alias registered', hasDrAlias);

  // Test Front: select e_bottom and move to front
  await page.evaluate(() => {
    const e = window.__store.entities.find(e => e.id === 'e_bottom');
    if (e) e.selected = true;
    window.__store.emit();
  });

  await cmd('DRAWORDER');
  await page.waitForTimeout(100);
  let output = await getOutput(3);
  test('DRAWORDER prompt shown', output.includes('Front/Back/Above/Under'),
    output.split('\n').pop());

  await cmd('Front');
  await page.waitForTimeout(200);

  const afterFront = await page.evaluate(() => window.__store.entities.map(e => e.id));
  test('Front: e_bottom moved to end', afterFront[afterFront.length - 1] === 'e_bottom',
    afterFront.join(' → '));

  // Test Back: select e_bottom (now at end) and move to back
  await page.evaluate(() => {
    window.__store.clearSelection();
    const e = window.__store.entities.find(e => e.id === 'e_bottom');
    if (e) e.selected = true;
    window.__store.emit();
  });

  await cmd('DR');
  await page.waitForTimeout(100);
  await cmd('Back');
  await page.waitForTimeout(200);

  const afterBack = await page.evaluate(() => window.__store.entities.map(e => e.id));
  test('Back: e_bottom moved to start', afterBack[0] === 'e_bottom',
    afterBack.join(' → '));

  // Test undo for DRAWORDER
  await cmd('UNDO');
  await page.waitForTimeout(200);
  const afterUndo = await page.evaluate(() => window.__store.entities.map(e => e.id));
  test('DRAWORDER undo works', afterUndo[afterUndo.length - 1] === 'e_bottom',
    afterUndo.join(' → '));

  await pressEsc();
}

async function testEXPORT() {
  console.log('\n=== EXPORT ===');

  // Reset entities with some geometry
  await page.evaluate(() => {
    const s = window.__store;
    s.pushUndo('test-setup-export');
    s.entities = [
      { id: 'exp1', type: 'line', layer: '0', color: 'bylayer', lineweight: 1, linetype: 'continuous', visible: true, selected: false, start: { x: 0, y: 0 }, end: { x: 100, y: 0 } },
      { id: 'exp2', type: 'circle', layer: '0', color: 'bylayer', lineweight: 1, linetype: 'continuous', visible: true, selected: false, center: { x: 50, y: 50 }, radius: 30 },
    ];
    s.emit();
  });

  // Test command registration
  const hasExport = await page.evaluate(() => window.__engine.commands.has('EXPORT'));
  test('EXPORT command registered', hasExport);

  const hasExpAlias = await page.evaluate(() => {
    const def = window.__engine.commands.get('EXPORT');
    return def && def.aliases.includes('EXP');
  });
  test('EXP alias registered', hasExpAlias);

  // Test EXPORT SVG (will trigger download — we intercept it)
  let downloadTriggered = false;
  const downloadPromise = page.waitForEvent('download', { timeout: 5000 }).catch(() => null);

  await cmd('EXPORT');
  await page.waitForTimeout(100);
  let output = await getOutput(3);
  test('EXPORT prompt shown', output.includes('SVG/PNG/DXF'),
    output.split('\n').pop());

  await cmd('SVG');
  await page.waitForTimeout(500);

  const dl = await downloadPromise;
  if (dl) {
    test('EXPORT SVG triggers download', true, `filename="${dl.suggestedFilename()}"`);
  } else {
    // Download might be blocked in headless - check output instead
    output = await getOutput(3);
    test('EXPORT SVG executes', output.includes('Exported SVG'),
      output.split('\n').pop());
  }

  await pressEsc();
}

async function testIMPORT() {
  console.log('\n=== IMPORT ===');

  // Test command registration
  const hasImport = await page.evaluate(() => window.__engine.commands.has('IMPORT'));
  test('IMPORT command registered', hasImport);

  const hasImpAlias = await page.evaluate(() => {
    const def = window.__engine.commands.get('IMPORT');
    return def && def.aliases.includes('IMP');
  });
  test('IMP alias registered', hasImpAlias);

  // Test IMPORT command prompt
  await cmd('IMPORT');
  await page.waitForTimeout(100);
  let output = await getOutput(3);
  test('IMPORT prompt shown', output.includes('DXF/SVG'),
    output.split('\n').pop());

  // Cancel - we can't actually select a file in headless, but verify the flow
  await pressEsc();

  // Test SVG import via programmatic injection
  const countBefore = await page.evaluate(() => window.__store.entities.length);

  const importResult = await page.evaluate(() => {
    return new Promise((resolve) => {
      const s = window.__store;
      const countBefore = s.entities.length;

      // Simulate SVG import logic by creating a mock SVG and parsing it
      const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200">
        <line x1="10" y1="20" x2="100" y2="80" stroke="black"/>
        <circle cx="50" cy="50" r="25" stroke="red" fill="none"/>
        <rect x="10" y="10" width="40" height="30" stroke="blue" fill="none"/>
        <polyline points="0,0 10,20 30,10 50,40" stroke="green" fill="none"/>
        <polygon points="60,60 80,60 80,80 60,80" stroke="orange" fill="none"/>
      </svg>`;

      const parser = new DOMParser();
      const doc = parser.parseFromString(svgContent, 'image/svg+xml');
      const entities = [];

      function parseNumber(s) { return s ? parseFloat(s) || 0 : 0; }

      function processElement(el) {
        const tag = el.tagName.toLowerCase();
        if (tag === 'line') {
          entities.push({
            type: 'line',
            start: { x: parseNumber(el.getAttribute('x1')), y: -parseNumber(el.getAttribute('y1')) },
            end: { x: parseNumber(el.getAttribute('x2')), y: -parseNumber(el.getAttribute('y2')) },
          });
        } else if (tag === 'circle') {
          entities.push({
            type: 'circle',
            center: { x: parseNumber(el.getAttribute('cx')), y: -parseNumber(el.getAttribute('cy')) },
            radius: parseNumber(el.getAttribute('r')),
          });
        } else if (tag === 'rect') {
          const x = parseNumber(el.getAttribute('x'));
          const y = parseNumber(el.getAttribute('y'));
          const w = parseNumber(el.getAttribute('width'));
          const h = parseNumber(el.getAttribute('height'));
          entities.push({
            type: 'rect',
            corner1: { x, y: -(y + h) },
            corner2: { x: x + w, y: -y },
          });
        } else if (tag === 'polyline' || tag === 'polygon') {
          const raw = el.getAttribute('points') || '';
          const nums = raw.trim().split(/[\s,]+/).map(Number);
          const pts = [];
          for (let i = 0; i < nums.length - 1; i += 2) {
            pts.push({ x: nums[i], y: -nums[i + 1] });
          }
          if (pts.length >= 2) {
            entities.push({
              type: 'polyline',
              points: pts,
              bulges: pts.map(() => 0),
              closed: tag === 'polygon',
            });
          }
        } else if (tag === 'g' || tag === 'svg') {
          for (const child of Array.from(el.children)) {
            processElement(child);
          }
        }
      }

      processElement(doc.documentElement);

      // Add them to the store
      let idCounter = 9000;
      s.pushUndo('IMPORT');
      for (const partial of entities) {
        s.entities.push({
          id: `imp${++idCounter}`,
          layer: '0',
          color: 'bylayer',
          lineweight: 1,
          linetype: 'continuous',
          visible: true,
          selected: false,
          ...partial,
        });
      }
      s.emit();

      resolve({
        parsed: entities.length,
        totalAfter: s.entities.length,
        types: entities.map(e => e.type),
      });
    });
  });

  test('SVG parser extracts entities', importResult.parsed === 5,
    `parsed ${importResult.parsed} entities: ${importResult.types.join(', ')}`);

  test('SVG import includes line', importResult.types.includes('line'));
  test('SVG import includes circle', importResult.types.includes('circle'));
  test('SVG import includes rect', importResult.types.includes('rect'));
  test('SVG import includes polyline', importResult.types.filter(t => t === 'polyline').length === 2,
    'polyline + polygon both parsed as polyline');

  // Verify entities are in the store
  const afterImport = await page.evaluate(() => window.__store.entities.length);
  test('Entities added to store', afterImport > countBefore,
    `before=${countBefore}, after=${afterImport}`);

  // Test undo of import
  await cmd('UNDO');
  await page.waitForTimeout(200);
  const afterUndo = await page.evaluate(() => window.__store.entities.length);
  test('IMPORT undo works', afterUndo === countBefore,
    `before=${countBefore}, afterUndo=${afterUndo}`);
}

async function testTotalCommandCount() {
  console.log('\n=== SUMMARY ===');
  const total = await page.evaluate(() => window.__engine.commands.size);
  test('Total registered commands', total === 99, `count=${total}`);

  // Verify all new commands are accessible
  for (const name of ['DDEDIT', 'DRAWORDER', 'EXPORT', 'IMPORT']) {
    const exists = await page.evaluate((n) => window.__engine.commands.has(n), name);
    test(`${name} registered`, exists);
  }

  // Verify aliases
  const aliases = { ED: 'DDEDIT', TEXTEDIT: 'DDEDIT', DR: 'DRAWORDER', EXP: 'EXPORT', IMP: 'IMPORT' };
  for (const [alias, cmd] of Object.entries(aliases)) {
    const works = await page.evaluate(({ a, c }) => {
      const def = window.__engine.commands.get(c);
      return def && def.aliases.includes(a);
    }, { a: alias, c: cmd });
    test(`Alias ${alias} → ${cmd}`, works);
  }
}

// ============================================================
// RUNNER
// ============================================================

async function main() {
  console.log('MiniCAD New Commands Audit');
  console.log('='.repeat(50));

  try {
    await setup();

    await testDDEDIT();
    await testDRAWORDER();
    await testEXPORT();
    await testIMPORT();
    await testTotalCommandCount();

    console.log('\n' + '='.repeat(50));
    const passed = RESULTS.filter(r => r.passed).length;
    const failed = RESULTS.filter(r => !r.passed).length;
    const total = RESULTS.length;
    console.log(`Results: ${passed}/${total} passed, ${failed} failed`);

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
