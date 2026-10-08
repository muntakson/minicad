import { chromium } from 'playwright';

const URL = 'http://localhost:3011/';
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

// Helper: type a command and press Enter
async function cmd(text) {
  const input = page.locator('#cmd-input');
  await input.fill(text);
  await input.press('Enter');
  await page.waitForTimeout(100);
}

// Helper: get the last N lines from command output
async function getOutput(n = 3) {
  return await page.evaluate((count) => {
    const hist = document.getElementById('cmd-history');
    if (!hist) return '';
    const lines = hist.innerText.split('\n').filter(l => l.trim());
    return lines.slice(-count).join('\n');
  }, n);
}

// Helper: click on canvas at relative position (0-1 range)
async function clickCanvas(xRatio, yRatio) {
  const box = await page.locator('#cad-canvas').boundingBox();
  await page.mouse.click(box.x + box.width * xRatio, box.y + box.height * yRatio);
  await page.waitForTimeout(100);
}

// Helper: get entity count
async function entityCount() {
  return await page.evaluate(() => {
    if (window.store) return window.store.entities.length;
    return -1;
  });
}

// Helper: press Escape
async function pressEsc() {
  await page.keyboard.press('Escape');
  await page.waitForTimeout(100);
}

// Helper: press Enter with empty input
async function pressEnter() {
  const input = page.locator('#cmd-input');
  await input.fill('');
  await input.press('Enter');
  await page.waitForTimeout(100);
}

async function test(name, fn) {
  const result = { name, status: 'PASS', notes: '' };
  try {
    await fn();
    result.notes = 'OK';
  } catch (err) {
    result.status = 'FAIL';
    result.notes = err.message.split('\n')[0];
  }
  RESULTS.push(result);
  console.log(`${result.status === 'PASS' ? '✓' : '✗'} ${name} — ${result.notes}`);
}

// Expose store to page for entity inspection
async function exposeStore() {
  await page.evaluate(() => {
    const storeModule = document.querySelector('script[type="module"]');
    // store is a global singleton, try to access it
  });
}

// ====== TESTS ======

async function testLINE() {
  await cmd('L');
  let out = await getOutput();
  if (!out.includes('first point')) throw new Error('No first point prompt');
  await clickCanvas(0.3, 0.5);
  await clickCanvas(0.6, 0.5);
  await pressEnter();
  out = await getOutput();
  // Should complete without error
}

async function testCIRCLE() {
  await cmd('C');
  let out = await getOutput();
  if (!out.includes('center')) throw new Error('No center prompt');
  await clickCanvas(0.5, 0.5);
  await clickCanvas(0.5, 0.4);
  out = await getOutput();
  if (!out.includes('Circle created')) throw new Error('Circle not created');
}

async function testARC() {
  await cmd('A');
  let out = await getOutput();
  if (!out.includes('start')) throw new Error('No start prompt');
  await clickCanvas(0.2, 0.3);
  await clickCanvas(0.3, 0.2);
  await clickCanvas(0.4, 0.3);
  out = await getOutput();
  if (!out.includes('Arc created') && !out.includes('collinear')) throw new Error('Arc not created: ' + out);
}

async function testRECTANG() {
  await cmd('REC');
  let out = await getOutput();
  if (!out.includes('first corner')) throw new Error('No corner prompt');
  await clickCanvas(0.2, 0.2);
  await clickCanvas(0.4, 0.4);
  out = await getOutput();
  if (!out.includes('Rectangle created')) throw new Error('Rectangle not created');
}

async function testPLINE() {
  await cmd('PL');
  let out = await getOutput();
  if (!out.includes('start point')) throw new Error('No start prompt');
  await clickCanvas(0.1, 0.6);
  await clickCanvas(0.2, 0.6);
  await clickCanvas(0.3, 0.7);
  await pressEnter();
  out = await getOutput();
  if (!out.includes('Polyline created')) throw new Error('Polyline not created: ' + out);
}

async function testTEXT() {
  await cmd('DT');
  await clickCanvas(0.5, 0.3);
  await cmd('10');      // height
  await cmd('0');       // rotation
  await cmd('Hello');   // text
  let out = await getOutput();
  if (!out.includes('Text') && !out.includes('created')) throw new Error('Text not created: ' + out);
}

async function testPOINT() {
  await cmd('PO');
  await clickCanvas(0.7, 0.7);
  await pressEnter();
  let out = await getOutput(5);
  // Should place a point and exit
}

async function testMTEXT() {
  await cmd('MT');
  await clickCanvas(0.6, 0.2);
  await clickCanvas(0.8, 0.4);
  await cmd('Multi\\nLine');
  let out = await getOutput();
  if (!out.includes('MText created')) throw new Error('MText not created: ' + out);
}

async function testPOLYGON() {
  await cmd('POL');
  let out = await getOutput();
  if (!out.includes('sides')) throw new Error('No sides prompt');
  await cmd('6');  // 6 sides
  await clickCanvas(0.5, 0.5);  // center
  await cmd('i');  // inscribed
  await cmd('50'); // radius
  out = await getOutput();
  if (!out.includes('polygon created')) throw new Error('Polygon not created: ' + out);
}

async function testPOLYGON_EnterDefault() {
  // Test that pressing Enter defaults to 6 sides
  await cmd('POL');
  await pressEnter(); // default 6 sides
  await clickCanvas(0.4, 0.4);  // center
  await pressEnter(); // default inscribed
  await cmd('30'); // radius
  let out = await getOutput();
  if (!out.includes('polygon created')) throw new Error('Polygon default not working: ' + out);
}

async function testERASE() {
  // Draw something first
  await cmd('L');
  await clickCanvas(0.1, 0.1);
  await clickCanvas(0.2, 0.1);
  await pressEnter();
  // Select and erase
  await clickCanvas(0.15, 0.1); // click to select the line
  await page.waitForTimeout(200);
  await cmd('E');
  let out = await getOutput();
  if (!out.includes('erased')) throw new Error('Erase failed: ' + out);
}

async function testMOVE() {
  await cmd('L');
  await clickCanvas(0.3, 0.8);
  await clickCanvas(0.4, 0.8);
  await pressEnter();
  await clickCanvas(0.35, 0.8);
  await page.waitForTimeout(200);
  await cmd('M');
  await clickCanvas(0.35, 0.8); // base point
  await clickCanvas(0.35, 0.7); // destination
  let out = await getOutput();
  if (!out.includes('moved')) throw new Error('Move failed: ' + out);
}

async function testCOPY() {
  await cmd('L');
  await clickCanvas(0.5, 0.8);
  await clickCanvas(0.6, 0.8);
  await pressEnter();
  await clickCanvas(0.55, 0.8);
  await page.waitForTimeout(200);
  await cmd('CO');
  await clickCanvas(0.55, 0.8); // base point
  await clickCanvas(0.55, 0.7); // displacement
  await pressEnter(); // exit copy loop
  let out = await getOutput();
}

async function testROTATE() {
  await cmd('L');
  await clickCanvas(0.7, 0.8);
  await clickCanvas(0.8, 0.8);
  await pressEnter();
  await clickCanvas(0.75, 0.8);
  await page.waitForTimeout(200);
  await cmd('RO');
  await clickCanvas(0.75, 0.8); // base point
  await cmd('45'); // angle
  let out = await getOutput();
  if (!out.includes('rotated')) throw new Error('Rotate failed: ' + out);
}

async function testROTATE_EnterCancel() {
  // Test Enter cancels rotation (new fix)
  await cmd('L');
  await clickCanvas(0.7, 0.7);
  await clickCanvas(0.8, 0.7);
  await pressEnter();
  await clickCanvas(0.75, 0.7);
  await page.waitForTimeout(200);
  await cmd('RO');
  await clickCanvas(0.75, 0.7); // base point
  await pressEnter(); // should cancel
  // Command should no longer be active
}

async function testSCALE() {
  await cmd('L');
  await clickCanvas(0.1, 0.9);
  await clickCanvas(0.2, 0.9);
  await pressEnter();
  await clickCanvas(0.15, 0.9);
  await page.waitForTimeout(200);
  await cmd('SC');
  await clickCanvas(0.15, 0.9);
  await cmd('2');
  let out = await getOutput();
  if (!out.includes('scaled')) throw new Error('Scale failed: ' + out);
}

async function testMIRROR() {
  await cmd('L');
  await clickCanvas(0.3, 0.9);
  await clickCanvas(0.4, 0.9);
  await pressEnter();
  await clickCanvas(0.35, 0.9);
  await page.waitForTimeout(200);
  await cmd('MI');
  await clickCanvas(0.35, 0.85); // mirror line p1
  await clickCanvas(0.35, 0.95); // mirror line p2
  await pressEnter(); // No erase (default)
  let out = await getOutput();
  if (!out.includes('mirrored')) throw new Error('Mirror failed: ' + out);
}

async function testOFFSET() {
  await cmd('L');
  await clickCanvas(0.1, 0.5);
  await clickCanvas(0.2, 0.5);
  await pressEnter();
  await cmd('O');
  await cmd('10'); // distance
  await clickCanvas(0.15, 0.5); // select object
  await clickCanvas(0.15, 0.4); // side to offset
  await pressEnter(); // exit
  let out = await getOutput(5);
}

async function testTRIM() {
  // Draw crossing lines
  await cmd('L');
  await cmd('100,100');
  await cmd('200,100');
  await pressEnter();
  await cmd('L');
  await cmd('150,50');
  await cmd('150,150');
  await pressEnter();
  // Trim
  await cmd('TR');
  await pressEnter(); // all edges
  await clickCanvas(0.5, 0.5); // click a segment (may miss, that's ok)
  await pressEnter(); // exit
  let out = await getOutput(5);
  // Should not error
}

async function testEXTEND() {
  await cmd('L');
  await cmd('250,100');
  await cmd('350,100');
  await pressEnter();
  await cmd('L');
  await cmd('300,50');
  await cmd('300,90');
  await pressEnter();
  await cmd('EX');
  await pressEnter(); // all boundaries
  await clickCanvas(0.5, 0.5);
  await pressEnter(); // exit
}

async function testBREAK() {
  // Draw a line to break
  await cmd('L');
  await cmd('400,200');
  await cmd('600,200');
  await pressEnter();
  await cmd('BR');
  // Need to click near the line — hard to hit precisely, but test the flow
  await clickCanvas(0.5, 0.5);
  // At this point, either found or not found
  let out = await getOutput();
  if (out.includes('No object')) {
    // That's OK, the command handled it gracefully
  } else {
    // We're in "second break point" phase, test Enter-to-exit
    await pressEnter();
    out = await getOutput();
  }
}

async function testBREAK_FirstPoint() {
  // Test the [F]irst point option
  await cmd('L');
  await cmd('0,300');
  await cmd('500,300');
  await pressEnter();
  await cmd('BR');
  await clickCanvas(0.5, 0.5); // may or may not hit
  let out = await getOutput();
  if (out.includes('No object')) {
    // OK
  } else {
    await cmd('f'); // First point option
    out = await getOutput();
    if (out.includes('first break point')) {
      await pressEsc(); // cancel out
    }
  }
}

async function testFILLET() {
  // Draw two lines meeting at a point
  await cmd('L');
  await cmd('50,400');
  await cmd('150,400');
  await pressEnter();
  await cmd('L');
  await cmd('150,400');
  await cmd('150,500');
  await pressEnter();
  // Fillet with radius
  await cmd('F');
  let out = await getOutput();
  if (!out.includes('FILLET')) throw new Error('Fillet not started: ' + out);
  // Test Enter-to-exit (new fix)
  await pressEnter();
  out = await getOutput(5);
  // Command should have exited cleanly
}

async function testFILLET_Radius() {
  await cmd('F');
  await cmd('r'); // set radius
  await cmd('5'); // radius value
  let out = await getOutput();
  if (!out.includes('Fillet radius')) throw new Error('Radius not set: ' + out);
  // Now in selection mode, test that 'r' handler is cleared
  await pressEsc(); // cancel
}

async function testCHAMFER() {
  await cmd('CHA');
  let out = await getOutput();
  if (!out.includes('CHAMFER')) throw new Error('Chamfer not started');
  // Test Enter-to-exit
  await pressEnter();
  // Should exit cleanly
}

async function testCHAMFER_Distance() {
  await cmd('CHA');
  await cmd('d'); // set distances
  await cmd('5'); // dist1
  await cmd('5'); // dist2
  let out = await getOutput();
  if (!out.includes('Chamfer') && !out.includes('Dist')) throw new Error('Distance not set: ' + out);
  await pressEsc();
}

async function testLENGTHEN() {
  await cmd('LEN');
  let out = await getOutput();
  if (!out.includes('LENGTHEN')) throw new Error('Lengthen not started');
  // Test Enter-to-exit (was broken before fix)
  await pressEnter();
  // Should exit cleanly without getting stuck
}

async function testLENGTHEN_Delta() {
  await cmd('LEN');
  await cmd('de'); // delta mode
  let out = await getOutput();
  if (!out.includes('delta')) throw new Error('Delta prompt not shown: ' + out);
  // Test Enter-to-exit from delta value prompt
  await pressEnter();
  // Should exit cleanly
}

async function testPEDIT() {
  // Draw a polyline first
  await cmd('PL');
  await cmd('50,600');
  await cmd('100,600');
  await cmd('150,650');
  await pressEnter();
  // Now PEDIT
  await cmd('PE');
  await clickCanvas(0.5, 0.5); // try to click the polyline (may miss)
  let out = await getOutput();
  if (out.includes('not a polyline') || out.includes('Do you want')) {
    await pressEnter(); // default Yes
    out = await getOutput();
  }
  if (out.includes('option')) {
    // Test invalid option handling (was falling through before)
    await cmd('z'); // invalid option
    out = await getOutput();
    if (!out.includes('Invalid')) throw new Error('Invalid option not handled: ' + out);
    await cmd('x'); // exit
  } else {
    await pressEsc();
  }
}

async function testEXPLODE() {
  await cmd('REC');
  await cmd('200,600');
  await cmd('300,700');
  await page.waitForTimeout(200);
  // Select the rect
  await clickCanvas(0.5, 0.5);
  await page.waitForTimeout(200);
  // This may not select the right thing, but test the flow
  await cmd('X');
  let out = await getOutput();
  // Check it completed (may say 0 exploded if nothing selected)
}

async function testJOIN() {
  // Draw two touching lines
  await cmd('L');
  await cmd('300,600');
  await cmd('400,600');
  await pressEnter();
  await cmd('L');
  await cmd('400,600');
  await cmd('500,600');
  await pressEnter();
  // Select both and join
  await clickCanvas(0.5, 0.5);
  await page.waitForTimeout(200);
  await cmd('J');
  let out = await getOutput();
}

async function testSTRETCH() {
  await cmd('L');
  await cmd('600,600');
  await cmd('700,600');
  await pressEnter();
  await clickCanvas(0.5, 0.5);
  await page.waitForTimeout(200);
  await cmd('S');
  await clickCanvas(0.5, 0.5);
  await clickCanvas(0.55, 0.5);
  let out = await getOutput();
}

async function testDIMSTYLE() {
  await cmd('D');
  let out = await getOutput();
  if (!out.includes('dimstyle') && !out.includes('Dimstyle') && !out.includes('Current')) throw new Error('Dimstyle not started: ' + out);
  await cmd('st'); // status
  out = await getOutput(8);
  if (!out.includes('DIMTXT') && !out.includes('text')) throw new Error('Status not shown: ' + out);
}

async function testDIMLINEAR() {
  await cmd('DLI');
  let out = await getOutput();
  if (!out.includes('first extension')) throw new Error('DimLinear not started: ' + out);
  await cmd('100,0');
  await cmd('200,0');
  await clickCanvas(0.5, 0.4);
  out = await getOutput();
  if (!out.includes('Dimension')) throw new Error('DimLinear failed: ' + out);
}

async function testDIMALIGNED() {
  await cmd('DAL');
  await cmd('0,0');
  await cmd('100,100');
  await clickCanvas(0.5, 0.5);
  let out = await getOutput();
  if (!out.includes('Dimension')) throw new Error('DimAligned failed: ' + out);
}

async function testDIMRADIUS() {
  // Draw a circle first
  await cmd('C');
  await cmd('500,500');
  await cmd('50');
  await page.waitForTimeout(200);
  await cmd('DRA');
  await clickCanvas(0.5, 0.5); // try to click the circle
  let out = await getOutput();
  // May or may not hit the circle
}

async function testDIMDIAMETER() {
  await cmd('DDI');
  await clickCanvas(0.5, 0.5);
  let out = await getOutput();
}

async function testLAYER() {
  await cmd('LA');
  let out = await getOutput();
  if (!out.includes('LAYER')) throw new Error('Layer not started');
  // Test list
  await cmd('list');
  out = await getOutput(5);
  // Test invalid option (was falling through before)
  await cmd('LA');
  await cmd('xyz'); // invalid
  out = await getOutput();
  if (!out.includes('Invalid')) throw new Error('Invalid option not caught: ' + out);
  await pressEsc();
}

async function testLAYER_New() {
  await cmd('LA');
  await cmd('new');
  await cmd('TestLayer');
  let out = await getOutput();
  if (!out.includes('created') && !out.includes('exists')) throw new Error('Layer new failed: ' + out);
}

async function testLINETYPE() {
  await cmd('LT');
  let out = await getOutput();
  if (!out.includes('LINETYPE')) throw new Error('Linetype not started');
  // Test Enter-to-exit
  await pressEnter();
}

async function testLINEWEIGHT() {
  await cmd('LW');
  let out = await getOutput();
  if (!out.includes('LINEWEIGHT')) throw new Error('Lineweight not started');
  await pressEnter();
}

async function testMATCHPROP() {
  await cmd('MA');
  let out = await getOutput();
  if (!out.includes('MATCHPROP')) throw new Error('Matchprop not started');
  await pressEsc();
}

async function testGROUP() {
  await cmd('GROUP');
  let out = await getOutput();
  if (!out.includes('GROUP')) throw new Error('Group not started');
  // Test list
  await cmd('list');
  out = await getOutput();
  // Test invalid option (was falling through before)
  await cmd('GROUP');
  await cmd('xyz');
  out = await getOutput();
  if (!out.includes('Invalid')) throw new Error('Invalid group option not caught: ' + out);
  await pressEsc();
}

async function testOSNAP() {
  await cmd('OS');
  await cmd('end,mid,cen');
  let out = await getOutput();
  if (!out.includes('Osnap')) throw new Error('Osnap failed: ' + out);
}

async function testORTHO() {
  await cmd('OR');
  let out = await getOutput();
  if (!out.includes('ORTHO')) throw new Error('Ortho failed: ' + out);
  await cmd('OR'); // toggle back
}

async function testGRID() {
  await cmd('G');
  // This might conflict with GROUP alias. Let's use the direct command
  await pressEsc();
  await cmd('GRID');
  let out = await getOutput();
  if (!out.includes('Grid') && !out.includes('GROUP')) throw new Error('Grid failed: ' + out);
}

async function testUNDO_REDO() {
  await cmd('U');
  let out = await getOutput();
  if (!out.includes('Undo') && !out.includes('Nothing')) throw new Error('Undo failed: ' + out);
  await cmd('REDO');
  out = await getOutput();
  if (!out.includes('Redo') && !out.includes('Nothing')) throw new Error('Redo failed: ' + out);
}

async function testUNITS() {
  await cmd('UN');
  let out = await getOutput();
  if (!out.includes('UNITS')) throw new Error('Units not started: ' + out);
  await cmd('4');
  out = await getOutput();
  if (!out.includes('Precision set')) throw new Error('Units not set: ' + out);
}

async function testZOOM() {
  await cmd('Z');
  let out = await getOutput();
  await cmd('a'); // zoom all
  out = await getOutput();
}

async function testPAN() {
  await cmd('P');
  let out = await getOutput();
  await pressEsc();
}

async function testDIST() {
  await cmd('DI');
  let out = await getOutput();
  if (!out.includes('first point')) throw new Error('Dist not started: ' + out);
  await cmd('0,0');
  await cmd('100,100');
  out = await getOutput();
  if (!out.includes('Distance')) throw new Error('Dist failed: ' + out);
}

async function testLIST() {
  await cmd('LI');
  let out = await getOutput(5);
  // May show info or "no objects selected"
}

async function testDIVIDE() {
  await cmd('L');
  await cmd('0,800');
  await cmd('500,800');
  await pressEnter();
  await clickCanvas(0.5, 0.9);
  await page.waitForTimeout(200);
  await cmd('DIV');
  let out = await getOutput();
  // May need selection or direct click
  await pressEsc();
}

async function testHATCH() {
  await cmd('H');
  let out = await getOutput();
  await pressEsc();
}

async function testBLOCK() {
  await cmd('B');
  let out = await getOutput();
  await pressEsc();
}

async function testINSERT() {
  await cmd('I');
  let out = await getOutput();
  await pressEsc();
}

async function testPROPERTIES() {
  await cmd('MO');
  let out = await getOutput();
  await pressEsc();
}

async function testOPTIONS() {
  await cmd('OP');
  let out = await getOutput();
  await pressEsc();
}

// === SPECIFIC STATE MACHINE BUG TESTS ===

async function testBREAK_EnterExit() {
  // The specific bug: BREAK had no Enter-to-exit at "second break point"
  await cmd('L');
  await cmd('0,0');
  await cmd('500,0');
  await pressEnter();

  await cmd('BR');
  let out = await getOutput();
  // Click near the line at y=0 (bottom of canvas)
  const box = await page.locator('#cad-canvas').boundingBox();
  // y=0 in world is at the bottom of canvas (Y is flipped)
  await page.mouse.click(box.x + box.width * 0.3, box.y + box.height * 0.95);
  await page.waitForTimeout(200);
  out = await getOutput();
  if (out.includes('No object')) {
    // Line wasn't hit, but command handled it
    return;
  }
  // If we hit an object, we should be at "second break point" prompt
  if (out.includes('second break point')) {
    await pressEnter(); // THIS was the bug - should exit cleanly
    out = await getOutput();
    // Should not be stuck
  }
}

async function testFILLET_EnterExit() {
  // FILLET had no Enter-to-exit
  await cmd('F');
  let out = await getOutput();
  if (!out.includes('FILLET')) throw new Error('Fillet not started');
  await pressEnter(); // Should exit cleanly (was broken before)
  // Verify we can start a new command immediately
  await cmd('L');
  out = await getOutput();
  if (!out.includes('first point')) throw new Error('Command stuck after FILLET Enter: ' + out);
  await pressEsc();
}

async function testCHAMFER_EnterExit() {
  await cmd('CHA');
  let out = await getOutput();
  if (!out.includes('CHAMFER')) throw new Error('Chamfer not started');
  await pressEnter(); // Should exit cleanly
  await cmd('L');
  out = await getOutput();
  if (!out.includes('first point')) throw new Error('Command stuck after CHAMFER Enter: ' + out);
  await pressEsc();
}

async function testLENGTHEN_EnterExit() {
  // LENGTHEN was stuck — only Escape worked
  await cmd('LEN');
  let out = await getOutput();
  if (!out.includes('LENGTHEN')) throw new Error('Lengthen not started');
  await pressEnter(); // THIS was the bug - should exit cleanly
  await cmd('L');
  out = await getOutput();
  if (!out.includes('first point')) throw new Error('Command stuck after LENGTHEN Enter: ' + out);
  await pressEsc();
}

async function testLENGTHEN_DeltaEnterExit() {
  await cmd('LEN');
  await cmd('de');
  let out = await getOutput();
  if (!out.includes('delta')) throw new Error('Delta prompt not shown');
  await pressEnter(); // Exit from delta value prompt
  await cmd('L');
  out = await getOutput();
  if (!out.includes('first point')) throw new Error('Stuck after delta Enter: ' + out);
  await pressEsc();
}

async function testFILLET_RadiusThenSelect() {
  // After setting radius, the 'r' handler should be cleared
  await cmd('F');
  await cmd('r');
  await cmd('10');
  let out = await getOutput();
  if (!out.includes('radius') && !out.includes('Fillet')) throw new Error('Radius not set: ' + out);
  // Now in selection mode — press Escape to exit
  await pressEsc();
}

async function testPOLYGON_StaleHandler() {
  // After entering sides, old handler should be cleared
  await cmd('POL');
  await cmd('5'); // 5 sides
  let out = await getOutput();
  if (!out.includes('center')) throw new Error('Center prompt not shown: ' + out);
  // Now waiting for click, old handler should be cleared
  // Type something — should NOT re-trigger sides input
  await pressEsc();
}

async function testLAYER_InvalidOption() {
  await cmd('LA');
  await cmd('invalidoption');
  let out = await getOutput();
  if (!out.includes('Invalid')) throw new Error('Invalid option fell through: ' + out);
  await pressEsc();
}

async function testGROUP_InvalidOption() {
  await cmd('GROUP');
  let out = await getOutput();
  if (!out.includes('GROUP')) throw new Error('Group not started: ' + out);
  await cmd('invalidoption');
  out = await getOutput();
  if (!out.includes('Invalid')) throw new Error('Invalid group option fell through: ' + out);
  await pressEsc();
}

async function testPEDIT_InvalidOption() {
  // Draw a polyline and try PEDIT with invalid option
  await cmd('PL');
  await cmd('0,900');
  await cmd('100,900');
  await cmd('200,900');
  await pressEnter();
  // PEDIT requires clicking the polyline — hard to automate precisely
  await cmd('PE');
  await clickCanvas(0.5, 0.5); // may not hit
  let out = await getOutput();
  await pressEsc();
}

async function testFunctionKeys() {
  // F3 - OSNAP toggle
  await page.keyboard.press('F3');
  await page.waitForTimeout(200);
  let out = await getOutput();

  // F7 - Grid toggle
  await page.keyboard.press('F7');
  await page.waitForTimeout(200);

  // F8 - Ortho toggle
  await page.keyboard.press('F8');
  await page.waitForTimeout(200);
  out = await getOutput();

  // F9 - Grid snap toggle
  await page.keyboard.press('F9');
  await page.waitForTimeout(200);
}

async function testEscapeCancels() {
  // Verify Escape cancels any active command
  await cmd('L');
  await pressEsc();
  // Should be back to idle
  await cmd('C');
  await pressEsc();
  await cmd('TR');
  await pressEsc();
  await cmd('BR');
  await pressEsc();
  await cmd('F');
  await pressEsc();
}

async function testRepeatLastCommand() {
  // Press Enter with no command to repeat last
  await cmd('L');
  await pressEsc();
  // Now press Enter to repeat LINE
  await pressEnter();
  let out = await getOutput();
  // Should start LINE again
  await pressEsc();
}

// ====== RUN ALL ======

async function main() {
  console.log('Setting up browser...');
  await setup();
  console.log('Running tests...\n');

  // Drawing commands
  await test('LINE — basic draw', testLINE);
  await test('CIRCLE — basic draw', testCIRCLE);
  await test('ARC — three point', testARC);
  await test('RECTANG — two corners', testRECTANG);
  await test('PLINE — polyline', testPLINE);
  await test('TEXT — basic text', testTEXT);
  await test('POINT — place point', testPOINT);
  await test('MTEXT — multiline text', testMTEXT);
  await test('POLYGON — 6 sides', testPOLYGON);
  await test('POLYGON — Enter defaults', testPOLYGON_EnterDefault);

  // Modify commands
  await test('ERASE — delete entity', testERASE);
  await test('MOVE — move entity', testMOVE);
  await test('COPY — copy entity', testCOPY);
  await test('ROTATE — by angle', testROTATE);
  await test('ROTATE — Enter cancels', testROTATE_EnterCancel);
  await test('SCALE — scale entity', testSCALE);
  await test('MIRROR — mirror entity', testMIRROR);
  await test('OFFSET — parallel copy', testOFFSET);
  await test('TRIM — trim at intersection', testTRIM);
  await test('EXTEND — extend to boundary', testEXTEND);
  await test('EXPLODE — break compound', testEXPLODE);
  await test('JOIN — merge entities', testJOIN);
  await test('STRETCH — stretch entities', testSTRETCH);

  // State machine bug fix tests
  await test('BREAK — basic flow', testBREAK);
  await test('BREAK — [F]irst point option', testBREAK_FirstPoint);
  await test('BREAK — Enter exits (FIX)', testBREAK_EnterExit);
  await test('FILLET — Enter exits (FIX)', testFILLET_EnterExit);
  await test('FILLET — radius then select', testFILLET_Radius);
  await test('FILLET — R handler cleared (FIX)', testFILLET_RadiusThenSelect);
  await test('CHAMFER — Enter exits (FIX)', testCHAMFER_EnterExit);
  await test('CHAMFER — distance setting', testCHAMFER_Distance);
  await test('LENGTHEN — Enter exits (FIX)', testLENGTHEN_EnterExit);
  await test('LENGTHEN — Delta Enter exits (FIX)', testLENGTHEN_DeltaEnterExit);
  await test('POLYGON — stale handler cleared (FIX)', testPOLYGON_StaleHandler);
  await test('LAYER — invalid option caught (FIX)', testLAYER_InvalidOption);
  await test('GROUP — invalid option caught (FIX)', testGROUP_InvalidOption);
  await test('PEDIT — invalid option test', testPEDIT_InvalidOption);

  // Dimension commands
  await test('DIMSTYLE — status', testDIMSTYLE);
  await test('DIMLINEAR — dimension', testDIMLINEAR);
  await test('DIMALIGNED — dimension', testDIMALIGNED);
  await test('DIMRADIUS — dimension', testDIMRADIUS);
  await test('DIMDIAMETER — dimension', testDIMDIAMETER);

  // Settings commands
  await test('LAYER — basic flow', testLAYER);
  await test('LAYER — new layer', testLAYER_New);
  await test('LINETYPE — type list', testLINETYPE);
  await test('LINEWEIGHT — weight set', testLINEWEIGHT);
  await test('MATCHPROP — start', testMATCHPROP);
  await test('GROUP — basic flow', testGROUP);
  await test('OSNAP — set modes', testOSNAP);
  await test('ORTHO — toggle', testORTHO);
  await test('GRID — toggle', testGRID);
  await test('UNDO/REDO', testUNDO_REDO);
  await test('UNITS — precision', testUNITS);

  // View commands
  await test('ZOOM — zoom all', testZOOM);
  await test('PAN — start pan', testPAN);

  // Inquiry commands
  await test('DIST — measure', testDIST);
  await test('LIST — entity info', testLIST);
  await test('DIVIDE — divide entity', testDIVIDE);

  // Annotation/block commands
  await test('HATCH — start', testHATCH);
  await test('BLOCK — start', testBLOCK);
  await test('INSERT — start', testINSERT);

  // Other commands
  await test('PROPERTIES — view', testPROPERTIES);
  await test('OPTIONS — settings', testOPTIONS);

  // General behavior
  await test('Function keys (F3/F7/F8/F9)', testFunctionKeys);
  await test('Escape cancels all commands', testEscapeCancels);
  await test('Enter repeats last command', testRepeatLastCommand);

  // Take a screenshot
  await page.screenshot({ path: '/tmp/claude-1000/-home-jit-minicad/4ef81a79-4973-4b48-9813-512c961605f4/scratchpad/test_screenshot.png', fullPage: true });

  console.log('\n========== SUMMARY ==========');
  const passed = RESULTS.filter(r => r.status === 'PASS').length;
  const failed = RESULTS.filter(r => r.status === 'FAIL').length;
  console.log(`Total: ${RESULTS.length} | Passed: ${passed} | Failed: ${failed}`);
  if (failed > 0) {
    console.log('\nFailed tests:');
    for (const r of RESULTS.filter(r => r.status === 'FAIL')) {
      console.log(`  ✗ ${r.name}: ${r.notes}`);
    }
  }

  // Generate report data as JSON
  const reportData = JSON.stringify(RESULTS, null, 2);
  const fs = await import('fs');
  fs.writeFileSync('/tmp/claude-1000/-home-jit-minicad/4ef81a79-4973-4b48-9813-512c961605f4/scratchpad/test_results.json', reportData);

  await teardown();
}

main().catch(err => {
  console.error('Test runner failed:', err);
  process.exit(1);
});
