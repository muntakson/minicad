import { chromium } from 'playwright';

const URL = 'http://localhost:3011/';
let page, browser;
const RESULTS = [];

async function setup() {
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  page = await ctx.newPage();
  await page.goto(URL);
  await page.waitForSelector('#cad-canvas', { timeout: 5000 });
  await page.waitForTimeout(500);
}

async function cmd(text) {
  const input = page.locator('#cmd-input');
  await input.fill(text);
  await input.press('Enter');
  await page.waitForTimeout(100);
}

async function getOutput(n = 3) {
  return page.evaluate((count) => {
    const hist = document.getElementById('cmd-history');
    const lines = hist.innerText.split('\n').filter(l => l.trim());
    return lines.slice(-count).join('\n');
  }, n);
}

async function pressEnter() {
  const input = page.locator('#cmd-input');
  await input.fill('');
  await input.press('Enter');
  await page.waitForTimeout(100);
}

async function test(name, fn) {
  const r = { name, status: 'PASS', notes: '' };
  try { await fn(); r.notes = 'OK'; }
  catch (e) { r.status = 'FAIL'; r.notes = e.message.split('\n')[0]; }
  RESULTS.push(r);
  console.log(`${r.status === 'PASS' ? '✓' : '✗'} ${name} — ${r.notes}`);
}

// ===== DROPDOWN MENU TESTS =====

async function testMenuOpens() {
  // Click "Draw" menu
  const drawMenu = page.locator('#menubar > span[data-menu="draw"]');
  await drawMenu.click();
  await page.waitForTimeout(200);
  const dropdown = page.locator('#menu-draw');
  const visible = await dropdown.isVisible();
  if (!visible) throw new Error('Draw dropdown not visible');
  // Close by clicking elsewhere
  await page.locator('#cad-canvas').click();
  await page.waitForTimeout(100);
  const hidden = !(await dropdown.isVisible());
  if (!hidden) throw new Error('Menu did not close');
}

async function testMenuHover() {
  // Open File menu, then hover to Draw — should switch
  await page.locator('#menubar > span[data-menu="file"]').click();
  await page.waitForTimeout(100);
  const fileDD = page.locator('#menu-file');
  if (!(await fileDD.isVisible())) throw new Error('File menu not open');

  await page.locator('#menubar > span[data-menu="draw"]').hover();
  await page.waitForTimeout(200);
  const drawDD = page.locator('#menu-draw');
  if (!(await drawDD.isVisible())) throw new Error('Draw menu did not open on hover');
  if (await fileDD.isVisible()) throw new Error('File menu did not close on hover');
  // Close
  await page.locator('#cad-canvas').click();
  await page.waitForTimeout(100);
}

async function testMenuRunsCommand() {
  // Open Draw → click "Line"
  await page.locator('#menubar > span[data-menu="draw"]').click();
  await page.waitForTimeout(100);
  await page.locator('#menu-draw .menu-item[data-cmd="LINE"]').click();
  await page.waitForTimeout(200);
  const out = await getOutput();
  if (!out.includes('LINE') && !out.includes('first point')) throw new Error('LINE not started: ' + out);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(100);
}

async function testMenuFileNew() {
  // Draw a line first
  await cmd('L');
  await cmd('0,0');
  await cmd('100,100');
  await pressEnter();
  // File → New
  await page.locator('#menubar > span[data-menu="file"]').click();
  await page.waitForTimeout(100);
  await page.locator('#menu-file .menu-item[data-action="new"]').click();
  await page.waitForTimeout(200);
  const out = await getOutput();
  if (!out.includes('New drawing')) throw new Error('New did not work: ' + out);
}

async function testMenuEditSelectAll() {
  // Draw something
  await cmd('L');
  await cmd('0,0');
  await cmd('100,100');
  await pressEnter();
  await cmd('L');
  await cmd('50,0');
  await cmd('50,100');
  await pressEnter();
  // Edit → Select All
  await page.locator('#menubar > span[data-menu="edit"]').click();
  await page.waitForTimeout(100);
  await page.locator('#menu-edit .menu-item[data-action="selectall"]').click();
  await page.waitForTimeout(200);
  const out = await getOutput();
  if (!out.includes('selected')) throw new Error('Select all failed: ' + out);
}

async function testMenuModifyErase() {
  // Select all, then Modify → Erase
  await page.locator('#menubar > span[data-menu="edit"]').click();
  await page.waitForTimeout(100);
  await page.locator('#menu-edit .menu-item[data-action="selectall"]').click();
  await page.waitForTimeout(200);

  await page.locator('#menubar > span[data-menu="modify"]').click();
  await page.waitForTimeout(100);
  await page.locator('#menu-modify .menu-item[data-cmd="ERASE"]').click();
  await page.waitForTimeout(200);
  const out = await getOutput();
  if (!out.includes('erased')) throw new Error('Erase from menu failed: ' + out);
}

async function testMenuDimension() {
  // Open Dimension → Linear
  await page.locator('#menubar > span[data-menu="dimension"]').click();
  await page.waitForTimeout(100);
  await page.locator('#menu-dimension .menu-item[data-cmd="DIMLINEAR"]').click();
  await page.waitForTimeout(200);
  const out = await getOutput();
  if (!out.includes('first extension') && !out.includes('DIMLINEAR')) throw new Error('DimLinear not started: ' + out);
  await page.keyboard.press('Escape');
}

async function testMenuEscCloses() {
  await page.locator('#menubar > span[data-menu="file"]').click();
  await page.waitForTimeout(100);
  if (!(await page.locator('#menu-file').isVisible())) throw new Error('Menu not open');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(100);
  if (await page.locator('#menu-file').isVisible()) throw new Error('Escape did not close menu');
}

// ===== CONTEXT MENU TESTS =====

async function testContextMenuIdle() {
  // Deselect everything first
  await page.evaluate(() => {
    const store = window.__store;
    if (store) { store.clearSelection(); store.emit(); }
  });
  // Right-click on empty canvas area
  const box = await page.locator('#cad-canvas').boundingBox();
  await page.mouse.click(box.x + box.width * 0.8, box.y + box.height * 0.8, { button: 'right' });
  await page.waitForTimeout(200);
  const ctxMenu = page.locator('#context-menu');
  if (!(await ctxMenu.isVisible())) throw new Error('Context menu not visible');
  const text = await ctxMenu.innerText();
  if (!text.includes('Zoom All') && !text.includes('Pan')) throw new Error('Wrong idle menu: ' + text);
  // Close with Escape
  await page.keyboard.press('Escape');
  await page.waitForTimeout(100);
}

async function testContextMenuWithSelection() {
  // Select entities programmatically
  await page.evaluate(() => {
    const store = window.__store;
    if (store && store.entities.length > 0) {
      store.entities[0].selected = true;
      store.emit();
    }
  });
  await page.waitForTimeout(100);
  const hasSel = await page.evaluate(() => {
    const store = window.__store;
    return store ? store.selectedEntities().length > 0 : false;
  });
  if (!hasSel) {
    // Draw something and select it manually
    await cmd('L');
    await cmd('200,200');
    await cmd('400,200');
    await pressEnter();
    await page.evaluate(() => {
      const store = window.__store;
      if (store && store.entities.length > 0) {
        store.entities[store.entities.length - 1].selected = true;
        store.emit();
      }
    });
    await page.waitForTimeout(100);
  }
  // Right-click
  const box = await page.locator('#cad-canvas').boundingBox();
  await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.5, { button: 'right' });
  await page.waitForTimeout(200);
  const ctxMenu = page.locator('#context-menu');
  if (!(await ctxMenu.isVisible())) throw new Error('Context menu not visible');
  const text = await ctxMenu.innerText();
  if (!text.includes('Move') || !text.includes('Erase') || !text.includes('Copy'))
    throw new Error('Selection context menu wrong: ' + text);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(100);
  // Clean up selection
  await page.evaluate(() => {
    const store = window.__store;
    if (store) { store.clearSelection(); store.emit(); }
  });
}

async function testContextMenuDuringCommand() {
  // Start a LINE command with first point
  await cmd('L');
  await page.waitForTimeout(100);
  // Click on canvas to place first point (this keeps command active)
  const box = await page.locator('#cad-canvas').boundingBox();
  await page.mouse.click(box.x + box.width * 0.3, box.y + box.height * 0.3);
  await page.waitForTimeout(200);
  // Now the command should be active (waiting for next point)
  // Right-click during command
  await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.5, { button: 'right' });
  await page.waitForTimeout(200);
  const ctxMenu = page.locator('#context-menu');
  if (!(await ctxMenu.isVisible())) throw new Error('Context menu not visible during command');
  const text = await ctxMenu.innerText();
  if (!text.includes('Enter') || !text.includes('Cancel'))
    throw new Error('Command context menu wrong: ' + text);
  // Click "Cancel"
  await page.locator('#context-menu .menu-item[data-ctx="cancel"]').click();
  await page.waitForTimeout(200);
}

async function testContextMenuRepeat() {
  // Run a command first
  await cmd('L');
  await cmd('0,0');
  await cmd('100,0');
  await pressEnter();
  // Right-click — should show "Repeat LINE"
  const box = await page.locator('#cad-canvas').boundingBox();
  await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.5, { button: 'right' });
  await page.waitForTimeout(200);
  const text = await page.locator('#context-menu').innerText();
  if (!text.includes('Repeat LINE')) throw new Error('No repeat option: ' + text);
  // Click it
  await page.locator('#context-menu .menu-item[data-ctx="repeat"]').click();
  await page.waitForTimeout(200);
  const out = await getOutput();
  if (!out.includes('first point') && !out.includes('LINE')) throw new Error('Repeat did not start LINE: ' + out);
  await page.keyboard.press('Escape');
}

// ===== COMMAND HISTORY TESTS =====

async function testHistoryUpDown() {
  // Type several commands
  await cmd('L');
  await page.keyboard.press('Escape');
  await cmd('C');
  await page.keyboard.press('Escape');
  await cmd('REC');
  await page.keyboard.press('Escape');

  // Focus input and press Up
  const input = page.locator('#cmd-input');
  await input.focus();
  await input.press('ArrowUp');
  let val = await input.inputValue();
  if (val !== 'REC') throw new Error(`Up1 expected REC, got "${val}"`);

  await input.press('ArrowUp');
  val = await input.inputValue();
  if (val !== 'C') throw new Error(`Up2 expected C, got "${val}"`);

  await input.press('ArrowUp');
  val = await input.inputValue();
  if (val !== 'L') throw new Error(`Up3 expected L, got "${val}"`);

  // Down should go forward
  await input.press('ArrowDown');
  val = await input.inputValue();
  if (val !== 'C') throw new Error(`Down1 expected C, got "${val}"`);

  await input.press('ArrowDown');
  val = await input.inputValue();
  if (val !== 'REC') throw new Error(`Down2 expected REC, got "${val}"`);

  // One more Down should clear
  await input.press('ArrowDown');
  val = await input.inputValue();
  if (val !== '') throw new Error(`Down3 expected empty, got "${val}"`);
}

async function testHistoryUpExecutes() {
  // Type a command
  await cmd('L');
  await page.keyboard.press('Escape');
  // Press Up to recall, then Enter to execute
  const input = page.locator('#cmd-input');
  await input.focus();
  await input.press('ArrowUp');
  const val = await input.inputValue();
  if (val !== 'L') throw new Error(`Expected L, got "${val}"`);
  await input.press('Enter');
  await page.waitForTimeout(100);
  const out = await getOutput();
  if (!out.includes('first point') && !out.includes('LINE')) throw new Error('Recalled command did not execute: ' + out);
  await page.keyboard.press('Escape');
}

// ===== RUN =====

async function main() {
  console.log('Setting up...');
  await setup();
  console.log('Running tests...\n');

  // Dropdown menus
  await test('Menu — dropdown opens on click', testMenuOpens);
  await test('Menu — hover switches open menu', testMenuHover);
  await test('Menu — Draw > Line runs command', testMenuRunsCommand);
  await test('Menu — File > New clears drawing', testMenuFileNew);
  await test('Menu — Edit > Select All', testMenuEditSelectAll);
  await test('Menu — Modify > Erase with selection', testMenuModifyErase);
  await test('Menu — Dimension > Linear', testMenuDimension);
  await test('Menu — Escape closes dropdown', testMenuEscCloses);

  // Context menu
  await test('Context menu — idle (no selection)', testContextMenuIdle);
  await test('Context menu — with selection', testContextMenuWithSelection);
  await test('Context menu — during command', testContextMenuDuringCommand);
  await test('Context menu — repeat last command', testContextMenuRepeat);

  // Command history
  await test('History — Up/Down arrow recall', testHistoryUpDown);
  await test('History — Up then Enter executes', testHistoryUpExecutes);

  // Screenshot
  await page.screenshot({ path: '/tmp/claude-1000/-home-jit-minicad/4ef81a79-4973-4b48-9813-512c961605f4/scratchpad/test_menus.png' });

  console.log('\n========== SUMMARY ==========');
  const passed = RESULTS.filter(r => r.status === 'PASS').length;
  const failed = RESULTS.filter(r => r.status === 'FAIL').length;
  console.log(`Total: ${RESULTS.length} | Passed: ${passed} | Failed: ${failed}`);
  if (failed > 0) {
    console.log('\nFailed:');
    RESULTS.filter(r => r.status === 'FAIL').forEach(r => console.log(`  ✗ ${r.name}: ${r.notes}`));
  }

  await browser.close();
}

main().catch(e => { console.error(e); process.exit(1); });
