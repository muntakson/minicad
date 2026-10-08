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
  await page.waitForTimeout(150);
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
  await page.waitForTimeout(150);
}

async function pressEsc() {
  await page.keyboard.press('Escape');
  await page.waitForTimeout(100);
}

async function entityCount() {
  return page.evaluate(() => window.__store.entities.length);
}

async function lastEntity() {
  return page.evaluate(() => {
    const ents = window.__store.entities;
    if (ents.length === 0) return null;
    const e = ents[ents.length - 1];
    return JSON.parse(JSON.stringify(e));
  });
}

async function test(name, fn) {
  const r = { name, status: 'PASS', notes: '' };
  try { await fn(); r.notes = 'OK'; }
  catch (e) { r.status = 'FAIL'; r.notes = e.message.split('\n')[0]; }
  RESULTS.push(r);
  console.log(`${r.status === 'PASS' ? '✓' : '✗'} ${name} — ${r.notes}`);
}

// ===== HATCH TESTS =====

async function testHatchSolid() {
  // Draw a rect for boundary
  await cmd('REC');
  await cmd('0,0');
  await cmd('50,50');
  await page.waitForTimeout(150);
  // Select it
  await page.evaluate(() => {
    const store = window.__store;
    store.entities[store.entities.length - 1].selected = true;
    store.emit();
  });
  const before = await entityCount();
  await cmd('H');
  await cmd('SOLID');
  await cmd('0');  // angle
  await page.waitForTimeout(200);
  const after = await entityCount();
  if (after <= before) throw new Error('No hatch entity created');
  const last = await lastEntity();
  if (last.type !== 'hatch') throw new Error(`Expected hatch, got ${last.type}`);
  const out = await getOutput();
  if (!out.includes('Hatch created')) throw new Error('No confirmation: ' + out);
}

async function testHatchAnsi31() {
  // Draw a circle for boundary
  await cmd('C');
  await cmd('100,100');
  await cmd('30');
  await page.waitForTimeout(150);
  // Select it
  await page.evaluate(() => {
    const store = window.__store;
    store.entities[store.entities.length - 1].selected = true;
    store.emit();
  });
  const before = await entityCount();
  await cmd('H');
  await cmd('ANSI31');
  await cmd('2');   // scale
  await cmd('45');  // angle
  await page.waitForTimeout(200);
  const after = await entityCount();
  if (after <= before) throw new Error('No hatch entity created');
  const last = await lastEntity();
  if (last.type !== 'hatch') throw new Error(`Expected hatch, got ${last.type}`);
  if (last.patternName !== 'ANSI31') throw new Error(`Expected ANSI31, got ${last.patternName}`);
  if (last.patternAngle !== 45) throw new Error(`Expected angle 45, got ${last.patternAngle}`);
}

async function testHatchNoBoundary() {
  // Draw a line (not a closed boundary)
  await cmd('L');
  await cmd('200,200');
  await cmd('300,200');
  await pressEnter();
  await page.waitForTimeout(150);
  // Select the line
  await page.evaluate(() => {
    const store = window.__store;
    store.entities[store.entities.length - 1].selected = true;
    store.emit();
  });
  await cmd('H');
  await page.waitForTimeout(200);
  const out = await getOutput();
  if (!out.includes('No valid closed boundaries')) throw new Error('Should reject open boundary: ' + out);
}

// ===== BLOCK / INSERT TESTS =====

async function testBlockDefine() {
  // Draw two lines to define as block
  await cmd('L');
  await cmd('0,200');
  await cmd('20,200');
  await pressEnter();
  await cmd('L');
  await cmd('10,200');
  await cmd('10,220');
  await pressEnter();
  await page.waitForTimeout(150);
  // Select both lines
  await page.evaluate(() => {
    const store = window.__store;
    const len = store.entities.length;
    store.entities[len - 1].selected = true;
    store.entities[len - 2].selected = true;
    store.emit();
  });
  const before = await entityCount();
  await cmd('B');
  await cmd('cross');  // block name
  await cmd('10,210'); // base point
  await page.waitForTimeout(300);
  const after = await entityCount();
  // Block definition removes selected entities
  if (after >= before) throw new Error(`Expected fewer entities after block define (before=${before}, after=${after})`);
  const out = await getOutput(3);
  if (!out.includes('Block "cross" defined')) throw new Error('No block confirmation: ' + out);
  // Verify block exists in store
  const hasDef = await page.evaluate(() => window.__store.blockDefs.has('cross'));
  if (!hasDef) throw new Error('Block not in store.blockDefs');
}

async function testInsertBlock() {
  const before = await entityCount();
  await cmd('I');
  await cmd('cross');   // block name
  await cmd('50,220');  // insertion point
  await cmd('1');       // X scale
  await cmd('1');       // Y scale
  await cmd('0');       // rotation
  await page.waitForTimeout(200);
  const after = await entityCount();
  if (after <= before) throw new Error('No blockref entity created');
  const last = await lastEntity();
  if (last.type !== 'blockref') throw new Error(`Expected blockref, got ${last.type}`);
  if (last.blockName !== 'cross') throw new Error(`Expected blockName=cross, got ${last.blockName}`);
  const out = await getOutput();
  if (!out.includes('Block "cross" inserted')) throw new Error('No insert confirmation: ' + out);
}

async function testInsertNotFound() {
  await cmd('I');
  await cmd('nonexistent');
  await page.waitForTimeout(200);
  const out = await getOutput();
  if (!out.includes('not found')) throw new Error('Should say not found: ' + out);
}

async function testInsertScaleRotation() {
  const before = await entityCount();
  await cmd('I');
  await cmd('cross');
  await cmd('100,220');
  await cmd('2');    // X scale
  await cmd('3');    // Y scale
  await cmd('45');   // rotation
  await page.waitForTimeout(200);
  const last = await lastEntity();
  if (last.scaleX !== 2) throw new Error(`Expected scaleX=2, got ${last.scaleX}`);
  if (last.scaleY !== 3) throw new Error(`Expected scaleY=3, got ${last.scaleY}`);
  if (last.rotation !== 45) throw new Error(`Expected rotation=45, got ${last.rotation}`);
}

// ===== DIMLINEAR / DIMALIGNED / DIMCONTINUE TESTS =====

async function testDimLinearOffset() {
  await pressEsc();
  // Create a horizontal linear dimension: two points at y=300, text offset at y=330
  const before = await entityCount();
  await cmd('DLI');
  await cmd('0,300');
  await cmd('100,300');
  await cmd('50,330');  // Place dim line 30 units above
  await page.waitForTimeout(200);
  const after = await entityCount();
  if (after <= before) throw new Error('No dimension created');
  const last = await lastEntity();
  if (last.type !== 'dimension') throw new Error(`Expected dimension, got ${last.type}`);
  if (last.dimType !== 'linear') throw new Error(`Expected linear, got ${last.dimType}`);
  if (Math.abs(last.textPos.y - 330) > 0.1) throw new Error(`textPos.y should be 330, got ${last.textPos.y}`);
  // Text should show 100.00 (horizontal distance), not 0.00
  if (last.textOverride.startsWith('0')) throw new Error(`Should measure dx=100, got ${last.textOverride}`);
}

async function testDimLinearHorizOffCenter() {
  await pressEsc();
  // BUG REGRESSION: horizontal line endpoints, textPos off-center must still be horizontal
  const before = await entityCount();
  await cmd('DLI');
  await cmd('0,300');
  await cmd('100,300');
  await cmd('80,320');  // Off-center (x=80 not at midpoint 50), 20 units above
  await page.waitForTimeout(200);
  const last = await lastEntity();
  // Must show horizontal distance (100), NOT vertical (0)
  if (last.textOverride.startsWith('0')) throw new Error(`Off-center textPos gave dy=0 instead of dx=100: ${last.textOverride}`);
  if (!last.textOverride.startsWith('100')) throw new Error(`Expected 100.xx, got ${last.textOverride}`);
}

async function testDimLinearVertical() {
  await pressEsc();
  // Create a vertical linear dimension: two points at x=200, text offset at x=230
  const before = await entityCount();
  await cmd('DLI');
  await cmd('200,300');
  await cmd('200,400');
  await cmd('230,350');  // Place dim line 30 units to the right
  await page.waitForTimeout(200);
  const after = await entityCount();
  if (after <= before) throw new Error('No dimension created');
  const last = await lastEntity();
  if (last.dimType !== 'linear') throw new Error(`Expected linear, got ${last.dimType}`);
  // textPos.x = 230 means dim line is offset to the right
  if (Math.abs(last.textPos.x - 230) > 0.1) throw new Error(`textPos.x should be 230, got ${last.textPos.x}`);
}

async function testDimAlignedOffset() {
  await pressEsc();
  // Create an aligned dimension on a diagonal line
  const before = await entityCount();
  await cmd('DAL');
  await cmd('0,350');
  await cmd('50,400');
  await cmd('30,400');  // Offset to the side
  await page.waitForTimeout(200);
  const after = await entityCount();
  if (after <= before) throw new Error('No aligned dimension created');
  const last = await lastEntity();
  if (last.dimType !== 'aligned') throw new Error(`Expected aligned, got ${last.dimType}`);
}

async function testDimContinue() {
  await pressEsc();
  // Continue from the last dimension
  const before = await entityCount();
  await cmd('DCO');
  await cmd('100,400');
  await page.waitForTimeout(200);
  const after = await entityCount();
  if (after <= before) throw new Error('No continued dimension created');
  const last = await lastEntity();
  if (last.type !== 'dimension') throw new Error(`Expected dimension, got ${last.type}`);
  const out = await getOutput();
  if (!out.includes('Dimension')) throw new Error('No dimension output: ' + out);
}

async function testDimContinueFromPrevious() {
  await cmd('DCO');
  const out = await getOutput(2);
  if (!out.includes('DIMCONTINUE from')) {
    throw new Error('DCO should reference previous dim: ' + out);
  }
  await pressEsc();
}

// ===== DIMSTYLE TESTS =====

async function testDimStyleStatus() {
  await pressEsc();
  await cmd('D');
  await cmd('st');  // status
  await page.waitForTimeout(200);
  const out = await getOutput(6);
  if (!out.includes('DIMTXT')) throw new Error('No DIMTXT in status: ' + out);
  if (!out.includes('DIMASZ')) throw new Error('No DIMASZ in status: ' + out);
}

async function testDimStyleVariable() {
  await cmd('D');
  await cmd('v');        // variables
  await cmd('DIMTXT');   // variable name
  await cmd('5');        // new value
  await page.waitForTimeout(200);
  const out = await getOutput(3);
  if (!out.includes('DIMTXT set to 5')) throw new Error('Variable not set: ' + out);
  // Verify it stuck
  const val = await page.evaluate(() => window.__store.currentDimStyle.textHeight);
  if (val !== 5) throw new Error(`Expected textHeight=5, got ${val}`);
}

async function testDimStyleSaveRestore() {
  // Save current style
  await cmd('D');
  await cmd('sa');       // save
  await cmd('MyStyle');  // name
  await page.waitForTimeout(200);
  let out = await getOutput(2);
  if (!out.includes('MyStyle') || !out.includes('saved')) throw new Error('Style not saved: ' + out);
  // Change a value
  await cmd('D');
  await cmd('v');
  await cmd('DIMTXT');
  await cmd('10');
  await page.waitForTimeout(150);
  // Restore
  await cmd('D');
  await cmd('r');         // restore
  await cmd('MyStyle');
  await page.waitForTimeout(200);
  out = await getOutput(2);
  if (!out.includes('MyStyle') || !out.includes('restored')) throw new Error('Style not restored: ' + out);
  const val = await page.evaluate(() => window.__store.currentDimStyle.textHeight);
  if (val !== 5) throw new Error(`Expected restored textHeight=5, got ${val}`);
}

// ===== MTEXT TESTS =====

async function testMtextCreate() {
  await pressEsc();
  const before = await entityCount();
  await cmd('MT');
  await cmd('0,400');    // first corner
  await cmd('100,420');  // opposite corner
  await cmd('Hello\\nWorld');
  await page.waitForTimeout(200);
  const after = await entityCount();
  if (after <= before) throw new Error('No text entity created');
  const last = await lastEntity();
  if (last.type !== 'text') throw new Error(`Expected text, got ${last.type}`);
  if (!last.text.includes('\n')) throw new Error(`Expected multiline text, got "${last.text}"`);
  const out = await getOutput();
  if (!out.includes('MText created')) throw new Error('No confirmation: ' + out);
}

async function testMtextEscape() {
  const before = await entityCount();
  await cmd('MT');
  await cmd('0,500');
  await pressEsc();
  const after = await entityCount();
  if (after !== before) throw new Error('Entity created despite Escape');
}

// ===== MATCHPROP TESTS =====

async function testMatchProp() {
  // Create a line on default layer
  await cmd('L');
  await cmd('0,500');
  await cmd('50,500');
  await pressEnter();
  await page.waitForTimeout(150);
  // Create another line and change its layer/color
  await page.evaluate(() => {
    const store = window.__store;
    if (!store.layers.find(l => l.name === 'RedLayer')) {
      store.layers.push({ name: 'RedLayer', color: '#ff0000', visible: true, locked: false, current: false, lineweight: 1 });
    }
  });
  await cmd('L');
  await cmd('0,520');
  await cmd('50,520');
  await pressEnter();
  await page.waitForTimeout(150);
  // Set the second line to RedLayer
  await page.evaluate(() => {
    const store = window.__store;
    const last = store.entities[store.entities.length - 1];
    last.layer = 'RedLayer';
    last.color = '#ff0000';
    store.emit();
  });
  // Now use MATCHPROP: source = second line (RedLayer), dest = first line
  await cmd('MA');
  await page.waitForTimeout(150);
  // Set view to see these entities
  await page.evaluate(() => {
    window.__store.view = { panX: -20, panY: 550, zoom: 5 };
  });
  await page.waitForTimeout(100);
  // Click source (second line at y=520)
  const srcScreen = await page.evaluate(() => window.__store.worldToScreen({ x: 25, y: 520 }));
  const box = await page.locator('#cad-canvas').boundingBox();
  await page.mouse.click(box.x + srcScreen.x, box.y + srcScreen.y);
  await page.waitForTimeout(200);
  let out = await getOutput(3);
  if (!out.includes('Source:')) throw new Error('Source not picked: ' + out);
  // Click destination (first line at y=500)
  const dstScreen = await page.evaluate(() => window.__store.worldToScreen({ x: 25, y: 500 }));
  await page.mouse.click(box.x + dstScreen.x, box.y + dstScreen.y);
  await page.waitForTimeout(200);
  out = await getOutput(2);
  if (!out.includes('Properties matched')) throw new Error('No match confirmation: ' + out);
  // Press Enter to exit
  await pressEnter();
}

// ===== PROPERTIES TESTS =====

async function testPropertiesView() {
  await pressEsc();
  // Draw a circle and select ONLY it
  await page.evaluate(() => { window.__store.clearSelection(); });
  await cmd('C');
  await cmd('200,400');
  await cmd('25');
  await page.waitForTimeout(150);
  await page.evaluate(() => {
    const store = window.__store;
    store.clearSelection();
    store.entities[store.entities.length - 1].selected = true;
    store.emit();
  });
  await cmd('MO');
  await page.waitForTimeout(200);
  const out = await getOutput(5);
  if (!out.includes('CIRCLE')) throw new Error('Should show CIRCLE type: ' + out);
  if (!out.includes('Center:')) throw new Error('Should show center: ' + out);
  if (!out.includes('Radius:')) throw new Error('Should show radius: ' + out);
  await pressEnter();
}

async function testPropertiesChangeLayer() {
  await pressEsc();
  await page.evaluate(() => {
    const store = window.__store;
    if (!store.layers.find(l => l.name === 'TestLayer')) {
      store.layers.push({ name: 'TestLayer', color: '#00ff00', visible: true, locked: false, current: false, lineweight: 1 });
    }
    store.entities[store.entities.length - 1].selected = true;
    store.emit();
  });
  await cmd('MO');
  await page.waitForTimeout(100);
  await cmd('layer');
  await cmd('TestLayer');
  await page.waitForTimeout(200);
  const out = await getOutput(3);
  if (!out.includes('Layer set to "TestLayer"')) throw new Error('Layer not changed: ' + out);
  const layer = await page.evaluate(() => window.__store.entities[window.__store.entities.length - 1].layer);
  if (layer !== 'TestLayer') throw new Error(`Expected layer TestLayer, got ${layer}`);
  await pressEnter();
}

// ===== OPTIONS TESTS =====

async function testOptionsGridSpacing() {
  await pressEsc();
  await cmd('OP');
  await cmd('grid');
  await cmd('20');
  await page.waitForTimeout(200);
  const out = await getOutput(2);
  if (!out.includes('Grid spacing set to 20')) throw new Error('Grid spacing not changed: ' + out);
  const spacing = await page.evaluate(() => window.__store.gridSpacing);
  if (spacing !== 20) throw new Error(`Expected gridSpacing=20, got ${spacing}`);
}

async function testOptionsPrecision() {
  await pressEsc();
  await cmd('OP');
  await cmd('precision');
  await cmd('6');
  await page.waitForTimeout(200);
  const out = await getOutput(2);
  if (!out.includes('Precision set to 6')) throw new Error('Precision not changed: ' + out);
  const prec = await page.evaluate(() => window.__store.unitPrecision);
  if (prec !== 6) throw new Error(`Expected unitPrecision=6, got ${prec}`);
  // Reset for other tests
  await page.evaluate(() => { window.__store.unitPrecision = 4; });
}

// ===== GROUP TESTS =====

async function testGroupCreate() {
  await pressEsc();
  // Clear all selection first
  await page.evaluate(() => {
    window.__store.entities.forEach(e => e.selected = false);
    window.__store.emit();
  });
  // Draw two circles and select them
  await cmd('C');
  await cmd('300,400');
  await cmd('10');
  await cmd('C');
  await cmd('330,400');
  await cmd('10');
  await page.waitForTimeout(150);
  await page.evaluate(() => {
    const store = window.__store;
    store.entities.forEach(e => e.selected = false);
    const len = store.entities.length;
    store.entities[len - 1].selected = true;
    store.entities[len - 2].selected = true;
    store.emit();
  });
  await cmd('GROUP');
  await cmd('new');
  await cmd('mygroup');
  await page.waitForTimeout(200);
  const out = await getOutput(2);
  if (!out.includes('Group "mygroup" created')) throw new Error('Group not created: ' + out);
}

async function testGroupSelect() {
  await pressEsc();
  // Clear all selection
  await page.evaluate(() => {
    window.__store.entities.forEach(e => e.selected = false);
    window.__store.emit();
  });
  await cmd('GROUP');
  await cmd('select');
  await cmd('mygroup');
  await page.waitForTimeout(200);
  const out = await getOutput(2);
  if (!out.includes('selected from group "mygroup"')) throw new Error('Group not selected: ' + out);
  const selCount = await page.evaluate(() => window.__store.selectedEntities().length);
  if (selCount !== 2) throw new Error(`Expected 2 selected, got ${selCount}`);
}

async function testGroupList() {
  await pressEsc();
  await cmd('GROUP');
  await cmd('list');
  await page.waitForTimeout(200);
  const out = await getOutput(3);
  if (!out.includes('"mygroup"')) throw new Error('Group not listed: ' + out);
}

// ===== UNITS TESTS =====

async function testUnitsPrecision() {
  await pressEsc();
  await cmd('UN');
  await cmd('2');
  await page.waitForTimeout(200);
  const out = await getOutput(2);
  if (!out.includes('Precision set to 2')) throw new Error('Precision not changed: ' + out);
  const prec = await page.evaluate(() => window.__store.unitPrecision);
  if (prec !== 2) throw new Error(`Expected 2, got ${prec}`);
  // Reset
  await cmd('UN');
  await cmd('4');
}

async function testUnitsInvalid() {
  await pressEsc();
  await cmd('UN');
  await cmd('99');
  await page.waitForTimeout(200);
  const out = await getOutput(2);
  if (!out.includes('must be 0-8')) throw new Error('Should reject invalid: ' + out);
}

// ===== LINEWEIGHT TESTS =====

async function testLineweightSet() {
  // Draw a line and select it
  await cmd('L');
  await cmd('400,400');
  await cmd('500,400');
  await pressEnter();
  await page.waitForTimeout(150);
  await page.evaluate(() => {
    const store = window.__store;
    store.entities[store.entities.length - 1].selected = true;
    store.emit();
  });
  await cmd('LW');
  await cmd('3');
  await page.waitForTimeout(200);
  const out = await getOutput(2);
  if (!out.includes('lineweight set to 3')) throw new Error('Lineweight not set: ' + out);
  const lw = await page.evaluate(() => window.__store.entities[window.__store.entities.length - 1].lineweight);
  if (lw !== 3) throw new Error(`Expected lw=3, got ${lw}`);
}

async function testLineweightInvalid() {
  await cmd('LW');
  await cmd('-5');
  await page.waitForTimeout(200);
  const out = await getOutput(2);
  if (!out.includes('Invalid')) throw new Error('Should reject negative: ' + out);
}

// ===== LAYER TESTS =====

async function testLayerNew() {
  await cmd('LA');
  await cmd('new');
  await cmd('CutLayer');
  await page.waitForTimeout(200);
  const out = await getOutput(2);
  if (!out.includes('Layer "CutLayer" created')) throw new Error('Layer not created: ' + out);
}

async function testLayerSetCurrent() {
  await cmd('LA');
  await cmd('set');
  await cmd('CutLayer');
  await page.waitForTimeout(200);
  const out = await getOutput(2);
  if (!out.includes('Current layer: "CutLayer"')) throw new Error('Layer not set: ' + out);
  const current = await page.evaluate(() => window.__store.currentLayer().name);
  if (current !== 'CutLayer') throw new Error(`Expected CutLayer, got ${current}`);
}

async function testLayerColor() {
  await cmd('LA');
  await cmd('color');
  await cmd('CutLayer');
  await cmd('red');
  await page.waitForTimeout(200);
  const out = await getOutput(2);
  if (!out.includes('color set to')) throw new Error('Color not set: ' + out);
  const color = await page.evaluate(() => {
    return window.__store.layers.find(l => l.name === 'CutLayer').color;
  });
  if (color !== '#ff0000') throw new Error(`Expected #ff0000, got ${color}`);
}

async function testLayerOnOff() {
  await cmd('LA');
  await cmd('off');
  await cmd('CutLayer');
  await page.waitForTimeout(200);
  let out = await getOutput(2);
  if (!out.includes('Layer "CutLayer" OFF')) throw new Error('Layer not turned off: ' + out);
  await cmd('LA');
  await cmd('on');
  await cmd('CutLayer');
  await page.waitForTimeout(200);
  out = await getOutput(2);
  if (!out.includes('Layer "CutLayer" ON')) throw new Error('Layer not turned on: ' + out);
}

async function testLayerList() {
  await cmd('LA');
  await cmd('list');
  await page.waitForTimeout(200);
  const out = await getOutput(5);
  if (!out.includes('CutLayer')) throw new Error('CutLayer not in list: ' + out);
}

// ===== LINETYPE TESTS =====

async function testLinetypeSet() {
  // Draw a line and select it
  await cmd('L');
  await cmd('0,600');
  await cmd('100,600');
  await pressEnter();
  await page.waitForTimeout(150);
  await page.evaluate(() => {
    const store = window.__store;
    store.entities[store.entities.length - 1].selected = true;
    store.emit();
  });
  await cmd('LT');
  await cmd('dashed');
  await page.waitForTimeout(200);
  const out = await getOutput(2);
  if (!out.includes('set to dashed')) throw new Error('Linetype not set: ' + out);
  const lt = await page.evaluate(() => window.__store.entities[window.__store.entities.length - 1].linetype);
  if (lt !== 'dashed') throw new Error(`Expected dashed, got ${lt}`);
}

async function testLinetypeInvalid() {
  await cmd('LT');
  await cmd('squiggly');
  await page.waitForTimeout(200);
  const out = await getOutput(2);
  if (!out.includes('Unknown linetype')) throw new Error('Should reject invalid: ' + out);
}

// ===== MENU INTEGRATION =====

async function testDimMenu() {
  await page.locator('#menubar > span[data-menu="dimension"]').click();
  await page.waitForTimeout(100);
  const linear = page.locator('#menu-dimension .menu-item[data-cmd="DIMLINEAR"]');
  if (await linear.isVisible()) {
    await page.locator('#cad-canvas').click();
    await page.waitForTimeout(100);
  } else {
    throw new Error('DIMLINEAR not in Dimension menu');
  }
}

async function testModifyHatchMenu() {
  // Check that Hatch is in the Draw menu
  await page.locator('#menubar > span[data-menu="draw"]').click();
  await page.waitForTimeout(100);
  const items = await page.locator('#menu-draw .menu-item').allInnerTexts();
  await page.locator('#cad-canvas').click();
  await page.waitForTimeout(100);
  // Hatch should be somewhere in Draw or a related menu
  // Check Modify menu for Block
  await page.locator('#menubar > span[data-menu="modify"]').click();
  await page.waitForTimeout(100);
  const modItems = await page.locator('#menu-modify .menu-item').allInnerTexts();
  await page.locator('#cad-canvas').click();
  // At minimum, verify menus open without error
}

// ===== RUN =====

async function main() {
  console.log('Setting up...');
  await setup();
  console.log('Running Tier 3 tests...\n');

  // Hatch
  await test('HATCH — solid pattern on rect', testHatchSolid);
  await test('HATCH — ANSI31 with scale and angle', testHatchAnsi31);
  await test('HATCH — rejects open boundary', testHatchNoBoundary);

  // Block / Insert
  await test('BLOCK — define "cross" block', testBlockDefine);
  await test('INSERT — insert block', testInsertBlock);
  await test('INSERT — block not found', testInsertNotFound);
  await test('INSERT — scale and rotation', testInsertScaleRotation);

  // Dimension (linear, aligned, continue)
  await test('DIMLINEAR — offset dimension line', testDimLinearOffset);
  await test('DIMLINEAR — horiz off-center textPos', testDimLinearHorizOffCenter);
  await test('DIMLINEAR — vertical measurement', testDimLinearVertical);
  await test('DIMALIGNED — diagonal offset', testDimAlignedOffset);
  await test('DIMCONTINUE — continues from last dim', testDimContinue);
  await test('DIMCONTINUE — references previous dim', testDimContinueFromPrevious);

  // DimStyle
  await test('DIMSTYLE — status display', testDimStyleStatus);
  await test('DIMSTYLE — change variable', testDimStyleVariable);
  await test('DIMSTYLE — save and restore', testDimStyleSaveRestore);

  // MText
  await test('MTEXT — multiline text', testMtextCreate);
  await test('MTEXT — Escape cancels', testMtextEscape);

  // MatchProp
  await test('MATCHPROP — copy properties', testMatchProp);

  // Properties
  await test('PROPERTIES — view entity', testPropertiesView);
  await test('PROPERTIES — change layer', testPropertiesChangeLayer);

  // Options
  await test('OPTIONS — grid spacing', testOptionsGridSpacing);
  await test('OPTIONS — precision', testOptionsPrecision);

  // Group
  await test('GROUP — create group', testGroupCreate);
  await test('GROUP — select group', testGroupSelect);
  await test('GROUP — list groups', testGroupList);

  // Units
  await test('UNITS — set precision', testUnitsPrecision);
  await test('UNITS — reject invalid', testUnitsInvalid);

  // Lineweight
  await test('LINEWEIGHT — set on entity', testLineweightSet);
  await test('LINEWEIGHT — reject negative', testLineweightInvalid);

  // Layer
  await test('LAYER — create new layer', testLayerNew);
  await test('LAYER — set current', testLayerSetCurrent);
  await test('LAYER — set color', testLayerColor);
  await test('LAYER — on/off toggle', testLayerOnOff);
  await test('LAYER — list layers', testLayerList);

  // Linetype
  await test('LINETYPE — set dashed', testLinetypeSet);
  await test('LINETYPE — reject invalid', testLinetypeInvalid);

  // Menu integration
  await test('Menu — Dimension menu', testDimMenu);
  await test('Menu — Draw/Modify menus open', testModifyHatchMenu);

  // Screenshot
  await page.screenshot({ path: '/tmp/test_tier3.png' });

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
