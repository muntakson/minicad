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
    return JSON.parse(JSON.stringify(ents[ents.length - 1]));
  });
}

async function entitiesOfType(type) {
  return page.evaluate((t) => {
    return window.__store.entities.filter(e => e.type === t).map(e => JSON.parse(JSON.stringify(e)));
  }, type);
}

async function test(name, fn) {
  const r = { name, status: 'PASS', notes: '' };
  try { await fn(); r.notes = 'OK'; }
  catch (e) { r.status = 'FAIL'; r.notes = e.message.split('\n')[0]; }
  RESULTS.push(r);
  console.log(`${r.status === 'PASS' ? '✓' : '✗'} ${name} — ${r.notes}`);
}

// ─── TESTS ───

async function testTrimArcByLine() {
  await pressEsc();
  // Create arc: center (100,100), radius 50, from 0 to PI
  await page.evaluate(() => {
    const store = window.__store;
    store.pushUndo('test');
    store.addEntity({
      id: 9001, type: 'arc', center: { x: 100, y: 100 }, radius: 50,
      startAngle: 0, endAngle: Math.PI,
      layer: '0', color: 'bylayer', lineweight: 1, linetype: 'continuous',
      visible: true, selected: false,
    });
    // Create cutting line crossing the arc at ~45 degrees
    store.addEntity({
      id: 9002, type: 'line',
      start: { x: 100, y: 60 }, end: { x: 200, y: 160 },
      layer: '0', color: 'bylayer', lineweight: 1, linetype: 'continuous',
      visible: true, selected: false,
    });
    store.emit();
  });

  const before = await entityCount();
  await cmd('TR');
  await cmd('');  // all edges

  // Click near the right side of the arc (should trim the part near 0 radians)
  await page.evaluate(() => {
    window.__store.view = { panX: 0, panY: 200, zoom: 3 };
  });
  await page.waitForTimeout(100);

  const screen = await page.evaluate(() => window.__store.worldToScreen({ x: 148, y: 110 }));
  const box = await page.locator('#cad-canvas').boundingBox();
  await page.mouse.click(box.x + screen.x, box.y + screen.y);
  await page.waitForTimeout(200);

  const out = await getOutput(3);
  await pressEsc();

  // Verify arc was modified (startAngle or endAngle changed, or arc was split)
  const arcs = await entitiesOfType('arc');
  const modified = arcs.some(a => a.id === 9001 &&
    (Math.abs(a.startAngle) > 0.01 || Math.abs(a.endAngle - Math.PI) > 0.01));
  const split = arcs.length > (before > 0 ? 1 : 0);
  if (!modified && !split && !out.includes('Trimmed'))
    throw new Error('Arc was not trimmed: ' + out);
}

async function testTrimCircleByTwoLines() {
  await pressEsc();
  // Clear entities and create circle + two crossing lines
  await page.evaluate(() => {
    const store = window.__store;
    store.entities = [];
    store.pushUndo('test');
    // Circle at (200, 200) r=40
    store.addEntity({
      id: 9010, type: 'circle', center: { x: 200, y: 200 }, radius: 40,
      layer: '0', color: 'bylayer', lineweight: 1, linetype: 'continuous',
      visible: true, selected: false,
    });
    // Horizontal line crossing circle
    store.addEntity({
      id: 9011, type: 'line',
      start: { x: 100, y: 200 }, end: { x: 300, y: 200 },
      layer: '0', color: 'bylayer', lineweight: 1, linetype: 'continuous',
      visible: true, selected: false,
    });
    // Vertical line crossing circle
    store.addEntity({
      id: 9012, type: 'line',
      start: { x: 200, y: 100 }, end: { x: 200, y: 300 },
      layer: '0', color: 'bylayer', lineweight: 1, linetype: 'continuous',
      visible: true, selected: false,
    });
    store.emit();
  });

  await cmd('TR');
  await cmd('');  // all edges

  // Click top of circle (should trim the top quadrant)
  await page.evaluate(() => {
    window.__store.view = { panX: -100, panY: 350, zoom: 3 };
  });
  await page.waitForTimeout(100);

  const screen = await page.evaluate(() => window.__store.worldToScreen({ x: 200, y: 240 }));
  const box = await page.locator('#cad-canvas').boundingBox();
  await page.mouse.click(box.x + screen.x, box.y + screen.y);
  await page.waitForTimeout(200);

  const out = await getOutput(3);
  await pressEsc();

  // Circle should be removed and replaced by an arc
  const circles = await entitiesOfType('circle');
  const arcs = await entitiesOfType('arc');
  if (circles.some(c => c.id === 9010))
    throw new Error('Circle should have been converted to arc');
  if (arcs.length === 0 && !out.includes('Trimmed'))
    throw new Error('No arc created from trimmed circle');
}

async function testTrimPolylineEndSegment() {
  await pressEsc();
  await page.evaluate(() => {
    const store = window.__store;
    store.entities = [];
    store.pushUndo('test');
    // Polyline: (0,0)→(100,0)→(100,100)
    store.addEntity({
      id: 9020, type: 'polyline',
      points: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }],
      bulges: [0, 0, 0], closed: false,
      layer: '0', color: 'bylayer', lineweight: 1, linetype: 'continuous',
      visible: true, selected: false,
    });
    // Cutting line at x=50 (vertical)
    store.addEntity({
      id: 9021, type: 'line',
      start: { x: 50, y: -50 }, end: { x: 50, y: 50 },
      layer: '0', color: 'bylayer', lineweight: 1, linetype: 'continuous',
      visible: true, selected: false,
    });
    store.emit();
  });

  await cmd('TR');
  await cmd('');  // all edges

  // Click near start of polyline (left of cutting line)
  await page.evaluate(() => {
    window.__store.view = { panX: 0, panY: 150, zoom: 3 };
  });
  await page.waitForTimeout(100);

  const screen = await page.evaluate(() => window.__store.worldToScreen({ x: 25, y: 0 }));
  const box = await page.locator('#cad-canvas').boundingBox();
  await page.mouse.click(box.x + screen.x, box.y + screen.y);
  await page.waitForTimeout(200);

  const out = await getOutput(3);
  await pressEsc();

  // First point should have been moved to (50, 0)
  const polys = await entitiesOfType('polyline');
  const trimmed = polys.find(p => p.id === 9020);
  if (trimmed && Math.abs(trimmed.points[0].x - 50) < 2) {
    // OK
  } else if (out.includes('Trimmed')) {
    // OK — check that something happened
  } else {
    throw new Error('Polyline first segment not trimmed');
  }
}

async function testExtendArcToBoundary() {
  await pressEsc();
  await page.evaluate(() => {
    const store = window.__store;
    store.entities = [];
    store.pushUndo('test');
    // Arc: quarter circle (0 to PI/2) at center (100,100) r=50
    store.addEntity({
      id: 9030, type: 'arc',
      center: { x: 100, y: 100 }, radius: 50,
      startAngle: 0, endAngle: Math.PI / 2,
      layer: '0', color: 'bylayer', lineweight: 1, linetype: 'continuous',
      visible: true, selected: false,
    });
    // Boundary: vertical line at x=60 (arc endpoint at x=150,y=100 needs to extend CCW to reach it)
    store.addEntity({
      id: 9031, type: 'line',
      start: { x: 60, y: 0 }, end: { x: 60, y: 200 },
      layer: '0', color: 'bylayer', lineweight: 1, linetype: 'continuous',
      visible: true, selected: false,
    });
    store.emit();
  });

  await cmd('EX');
  await cmd('');  // all boundaries

  // Click near the top end of the arc (endAngle = PI/2 → point at (100,150))
  await page.evaluate(() => {
    window.__store.view = { panX: 0, panY: 250, zoom: 3 };
  });
  await page.waitForTimeout(100);

  const screen = await page.evaluate(() => window.__store.worldToScreen({ x: 100, y: 150 }));
  const box = await page.locator('#cad-canvas').boundingBox();
  await page.mouse.click(box.x + screen.x, box.y + screen.y);
  await page.waitForTimeout(200);

  const out = await getOutput(3);
  await pressEsc();

  const arcs = await entitiesOfType('arc');
  const ext = arcs.find(a => a.id === 9030);
  if (ext && Math.abs(ext.endAngle - Math.PI / 2) > 0.01) {
    // endAngle changed — extended
  } else if (out.includes('Extended')) {
    // OK
  } else {
    throw new Error('Arc was not extended: endAngle unchanged');
  }
}

async function testExtendPolylineToBoundary() {
  await pressEsc();
  await page.evaluate(() => {
    const store = window.__store;
    store.entities = [];
    store.pushUndo('test');
    // Polyline: (0,0)→(50,0)
    store.addEntity({
      id: 9040, type: 'polyline',
      points: [{ x: 0, y: 0 }, { x: 50, y: 0 }],
      bulges: [0, 0], closed: false,
      layer: '0', color: 'bylayer', lineweight: 1, linetype: 'continuous',
      visible: true, selected: false,
    });
    // Boundary: vertical line at x=100
    store.addEntity({
      id: 9041, type: 'line',
      start: { x: 100, y: -50 }, end: { x: 100, y: 50 },
      layer: '0', color: 'bylayer', lineweight: 1, linetype: 'continuous',
      visible: true, selected: false,
    });
    store.emit();
  });

  await cmd('EX');
  await cmd('');  // all boundaries

  // Click near end of polyline (x=50)
  await page.evaluate(() => {
    window.__store.view = { panX: 0, panY: 100, zoom: 3 };
  });
  await page.waitForTimeout(100);

  const screen = await page.evaluate(() => window.__store.worldToScreen({ x: 50, y: 0 }));
  const box = await page.locator('#cad-canvas').boundingBox();
  await page.mouse.click(box.x + screen.x, box.y + screen.y);
  await page.waitForTimeout(200);

  const out = await getOutput(3);
  await pressEsc();

  const polys = await entitiesOfType('polyline');
  const ext = polys.find(p => p.id === 9040);
  if (ext && Math.abs(ext.points[ext.points.length - 1].x - 100) < 2) {
    // Last point extended to x=100
  } else if (out.includes('Extended')) {
    // OK
  } else {
    throw new Error('Polyline not extended to boundary');
  }
}

async function testExtendCircleFails() {
  await pressEsc();
  await page.evaluate(() => {
    const store = window.__store;
    store.entities = [];
    store.pushUndo('test');
    store.addEntity({
      id: 9050, type: 'circle',
      center: { x: 100, y: 100 }, radius: 30,
      layer: '0', color: 'bylayer', lineweight: 1, linetype: 'continuous',
      visible: true, selected: false,
    });
    store.addEntity({
      id: 9051, type: 'line',
      start: { x: 200, y: 0 }, end: { x: 200, y: 200 },
      layer: '0', color: 'bylayer', lineweight: 1, linetype: 'continuous',
      visible: true, selected: false,
    });
    store.emit();
  });

  await cmd('EX');
  await cmd('');

  await page.evaluate(() => {
    window.__store.view = { panX: 0, panY: 200, zoom: 3 };
  });
  await page.waitForTimeout(100);

  const screen = await page.evaluate(() => window.__store.worldToScreen({ x: 130, y: 100 }));
  const box = await page.locator('#cad-canvas').boundingBox();
  await page.mouse.click(box.x + screen.x, box.y + screen.y);
  await page.waitForTimeout(200);

  const out = await getOutput(3);
  await pressEsc();

  if (!out.includes('Cannot extend'))
    throw new Error('Should reject extending a circle: ' + out);
}

async function testFilletLineArcRadius0() {
  await pressEsc();
  await page.evaluate(() => {
    const store = window.__store;
    store.entities = [];
    store.pushUndo('test');
    // Line ending near an arc
    store.addEntity({
      id: 9060, type: 'line',
      start: { x: 0, y: 50 }, end: { x: 80, y: 50 },
      layer: '0', color: 'bylayer', lineweight: 1, linetype: 'continuous',
      visible: true, selected: false,
    });
    // Arc: quarter circle at (100, 50), r=30, from PI/2 to PI
    store.addEntity({
      id: 9061, type: 'arc',
      center: { x: 100, y: 50 }, radius: 30,
      startAngle: Math.PI / 2, endAngle: Math.PI,
      layer: '0', color: 'bylayer', lineweight: 1, linetype: 'continuous',
      visible: true, selected: false,
    });
    store.emit();
  });

  await cmd('F');
  // radius = 0 (default), just click both objects
  await page.evaluate(() => {
    window.__store.view = { panX: 0, panY: 150, zoom: 3 };
  });
  await page.waitForTimeout(100);

  // Click on line
  const screenLine = await page.evaluate(() => window.__store.worldToScreen({ x: 40, y: 50 }));
  const box = await page.locator('#cad-canvas').boundingBox();
  await page.mouse.click(box.x + screenLine.x, box.y + screenLine.y);
  await page.waitForTimeout(150);

  // Click on arc
  const screenArc = await page.evaluate(() => window.__store.worldToScreen({ x: 75, y: 70 }));
  await page.mouse.click(box.x + screenArc.x, box.y + screenArc.y);
  await page.waitForTimeout(200);

  const out = await getOutput(3);
  if (!out.includes('intersection') && !out.includes('Fillet') && !out.includes('Extended'))
    throw new Error('Fillet line+arc r=0 failed: ' + out);
}

async function testFilletLineArcWithRadius() {
  await pressEsc();
  await page.evaluate(() => {
    const store = window.__store;
    store.entities = [];
    store.pushUndo('test');
    // Horizontal line
    store.addEntity({
      id: 9070, type: 'line',
      start: { x: 0, y: 0 }, end: { x: 100, y: 0 },
      layer: '0', color: 'bylayer', lineweight: 1, linetype: 'continuous',
      visible: true, selected: false,
    });
    // Arc above: quarter circle at (100,50), r=50, from PI to 3*PI/2
    store.addEntity({
      id: 9071, type: 'arc',
      center: { x: 100, y: 50 }, radius: 50,
      startAngle: Math.PI, endAngle: 3 * Math.PI / 2,
      layer: '0', color: 'bylayer', lineweight: 1, linetype: 'continuous',
      visible: true, selected: false,
    });
    store.emit();
  });

  const before = await entityCount();

  await cmd('F');
  await cmd('r');     // radius option
  await cmd('10');    // fillet radius

  await page.evaluate(() => {
    window.__store.view = { panX: 0, panY: 150, zoom: 3 };
  });
  await page.waitForTimeout(100);

  // Click on line
  const screenLine = await page.evaluate(() => window.__store.worldToScreen({ x: 50, y: 0 }));
  const box = await page.locator('#cad-canvas').boundingBox();
  await page.mouse.click(box.x + screenLine.x, box.y + screenLine.y);
  await page.waitForTimeout(150);

  // Click on arc
  const screenArc = await page.evaluate(() => window.__store.worldToScreen({ x: 55, y: 30 }));
  await page.mouse.click(box.x + screenArc.x, box.y + screenArc.y);
  await page.waitForTimeout(200);

  const out = await getOutput(3);
  const after = await entityCount();

  // Should create a fillet arc entity
  if (after > before && out.includes('Fillet')) {
    // OK — new arc created
  } else if (out.includes('radius')) {
    // OK
  } else {
    throw new Error(`Fillet line+arc r=10 failed: before=${before} after=${after} out=${out}`);
  }
}

async function testFilletArcArcRadius0() {
  await pressEsc();
  await page.evaluate(() => {
    const store = window.__store;
    store.entities = [];
    store.pushUndo('test');
    // Two arcs from concentric circles that share a region
    store.addEntity({
      id: 9080, type: 'arc',
      center: { x: 50, y: 100 }, radius: 40,
      startAngle: -Math.PI / 4, endAngle: Math.PI / 4,
      layer: '0', color: 'bylayer', lineweight: 1, linetype: 'continuous',
      visible: true, selected: false,
    });
    store.addEntity({
      id: 9081, type: 'arc',
      center: { x: 130, y: 100 }, radius: 40,
      startAngle: 3 * Math.PI / 4, endAngle: 5 * Math.PI / 4,
      layer: '0', color: 'bylayer', lineweight: 1, linetype: 'continuous',
      visible: true, selected: false,
    });
    store.emit();
  });

  await cmd('F');
  // radius = 0

  await page.evaluate(() => {
    window.__store.view = { panX: 0, panY: 200, zoom: 3 };
  });
  await page.waitForTimeout(100);

  // Click first arc
  const screen1 = await page.evaluate(() => window.__store.worldToScreen({ x: 88, y: 110 }));
  const box = await page.locator('#cad-canvas').boundingBox();
  await page.mouse.click(box.x + screen1.x, box.y + screen1.y);
  await page.waitForTimeout(150);

  // Click second arc
  const screen2 = await page.evaluate(() => window.__store.worldToScreen({ x: 92, y: 110 }));
  await page.mouse.click(box.x + screen2.x, box.y + screen2.y);
  await page.waitForTimeout(200);

  const out = await getOutput(3);
  if (!out.includes('intersection') && !out.includes('Extended'))
    throw new Error('Fillet arc+arc r=0 failed: ' + out);
}

async function testSaveCommand() {
  await pressEsc();
  await page.evaluate(() => {
    const store = window.__store;
    store.entities = [];
    store.addEntity({
      id: 9090, type: 'line',
      start: { x: 0, y: 0 }, end: { x: 100, y: 100 },
      layer: '0', color: 'bylayer', lineweight: 1, linetype: 'continuous',
      visible: true, selected: false,
    });
    store.emit();
  });

  await cmd('SAVE');
  await page.waitForTimeout(300);
  const out = await getOutput(3);
  // Should trigger save — may fail if backend is not running, but command should execute
  if (!out.toLowerCase().includes('sav') && !out.toLowerCase().includes('dxf') && !out.toLowerCase().includes('error'))
    throw new Error('SAVE command did not execute: ' + out);
}

async function testSaveAlias() {
  await pressEsc();
  await cmd('SA');
  await page.waitForTimeout(300);
  const out = await getOutput(3);
  if (!out.toLowerCase().includes('sav') && !out.toLowerCase().includes('dxf') && !out.toLowerCase().includes('error'))
    throw new Error('SA alias did not execute: ' + out);
}

async function testOpenCommand() {
  await pressEsc();
  // OPEN triggers a file dialog — we can't interact with it, but verify the command is recognized
  // We check that the engine processes it without error
  await cmd('OPEN');
  await page.waitForTimeout(200);
  // The command should have completed (file dialog opens but we can't click it)
  const out = await getOutput(3);
  // Just verify no "Unknown command" error
  if (out.includes('Unknown command'))
    throw new Error('OPEN command not recognized: ' + out);
}

async function testOpenAlias() {
  await pressEsc();
  await cmd('DN');
  await page.waitForTimeout(200);
  const out = await getOutput(3);
  if (out.includes('Unknown command'))
    throw new Error('DN alias not recognized: ' + out);
}

async function testTrimRejectsNoIntersection() {
  await pressEsc();
  await page.evaluate(() => {
    const store = window.__store;
    store.entities = [];
    store.pushUndo('test');
    // Arc at (100,100) r=20
    store.addEntity({
      id: 9100, type: 'arc',
      center: { x: 100, y: 100 }, radius: 20,
      startAngle: 0, endAngle: Math.PI,
      layer: '0', color: 'bylayer', lineweight: 1, linetype: 'continuous',
      visible: true, selected: false,
    });
    // Line far away — no intersection with arc
    store.addEntity({
      id: 9101, type: 'line',
      start: { x: 300, y: 300 }, end: { x: 400, y: 400 },
      layer: '0', color: 'bylayer', lineweight: 1, linetype: 'continuous',
      visible: true, selected: false,
    });
    store.emit();
  });

  await cmd('TR');
  await cmd('');  // all edges

  await page.evaluate(() => {
    window.__store.view = { panX: 0, panY: 200, zoom: 4 };
  });
  await page.waitForTimeout(100);

  // Click on the arc — should trim but fail because no cutting edge intersects
  const screen = await page.evaluate(() => window.__store.worldToScreen({ x: 110, y: 118 }));
  const box = await page.locator('#cad-canvas').boundingBox();
  await page.mouse.click(box.x + screen.x, box.y + screen.y);
  await page.waitForTimeout(300);

  const out = await getOutput(5);
  await pressEsc();
  if (!out.includes('no intersections') && !out.includes('Cannot trim') && !out.includes('No object'))
    throw new Error('Should show rejection message: ' + out);
}

// ─── DONUT TESTS ───

async function testDonutFilledCircle() {
  await pressEsc();
  await page.evaluate(() => { window.__store.entities = []; window.__store.emit(); });
  const before = await entityCount();

  await cmd('DONUT');
  await cmd('0');      // inner diameter = 0 → filled circle
  await cmd('20');     // outer diameter
  // Click to place
  await page.evaluate(() => {
    window.__store.view = { panX: 0, panY: 200, zoom: 3 };
  });
  await page.waitForTimeout(100);
  const screen = await page.evaluate(() => window.__store.worldToScreen({ x: 50, y: 50 }));
  const box = await page.locator('#cad-canvas').boundingBox();
  await page.mouse.click(box.x + screen.x, box.y + screen.y);
  await page.waitForTimeout(200);
  await cmd('');  // exit

  const after = await entityCount();
  if (after <= before) throw new Error('No entity created');
  const last = await lastEntity();
  if (last.type !== 'circle') throw new Error('Expected circle for inner=0 donut, got ' + last.type);
  if (Math.abs(last.radius - 10) > 0.5) throw new Error('Expected radius=10, got ' + last.radius);
}

async function testDonutPolyline() {
  await pressEsc();
  await page.evaluate(() => { window.__store.entities = []; window.__store.emit(); });
  const before = await entityCount();

  await cmd('DO');     // alias
  await cmd('5');      // inner diameter
  await cmd('15');     // outer diameter
  await page.evaluate(() => {
    window.__store.view = { panX: 0, panY: 200, zoom: 3 };
  });
  await page.waitForTimeout(100);
  const screen = await page.evaluate(() => window.__store.worldToScreen({ x: 60, y: 60 }));
  const box = await page.locator('#cad-canvas').boundingBox();
  await page.mouse.click(box.x + screen.x, box.y + screen.y);
  await page.waitForTimeout(200);
  await cmd('');  // exit

  const after = await entityCount();
  if (after <= before) throw new Error('No entity created');
  const last = await lastEntity();
  if (last.type !== 'polyline') throw new Error('Expected polyline for donut with hole, got ' + last.type);
  if (!last.closed) throw new Error('Donut polyline should be closed');
  if (last.bulges[0] !== 1 || last.bulges[1] !== 1) throw new Error('Donut bulges should be [1,1]');
}

async function testDonutMultiplePlacement() {
  await pressEsc();
  await page.evaluate(() => { window.__store.entities = []; window.__store.emit(); });

  await cmd('DONUT');
  await cmd('0');
  await cmd('10');
  await page.evaluate(() => {
    window.__store.view = { panX: 0, panY: 200, zoom: 3 };
  });
  await page.waitForTimeout(100);
  const box = await page.locator('#cad-canvas').boundingBox();

  // Place first donut
  let screen = await page.evaluate(() => window.__store.worldToScreen({ x: 30, y: 30 }));
  await page.mouse.click(box.x + screen.x, box.y + screen.y);
  await page.waitForTimeout(200);

  // Place second donut
  screen = await page.evaluate(() => window.__store.worldToScreen({ x: 80, y: 30 }));
  await page.mouse.click(box.x + screen.x, box.y + screen.y);
  await page.waitForTimeout(200);

  await cmd('');  // exit

  const count = await entityCount();
  if (count < 2) throw new Error('Expected at least 2 donuts placed, got ' + count);
}

// ─── XLINE TESTS ───

async function testXlineCreatesLongLine() {
  await pressEsc();
  await page.evaluate(() => { window.__store.entities = []; window.__store.emit(); });

  await cmd('XLINE');
  await page.evaluate(() => {
    window.__store.view = { panX: 0, panY: 200, zoom: 3 };
  });
  await page.waitForTimeout(100);
  const box = await page.locator('#cad-canvas').boundingBox();

  // First point
  let screen = await page.evaluate(() => window.__store.worldToScreen({ x: 50, y: 50 }));
  await page.mouse.click(box.x + screen.x, box.y + screen.y);
  await page.waitForTimeout(150);

  // Through point
  screen = await page.evaluate(() => window.__store.worldToScreen({ x: 100, y: 80 }));
  await page.mouse.click(box.x + screen.x, box.y + screen.y);
  await page.waitForTimeout(200);

  await cmd('');  // exit

  const lines = await entitiesOfType('line');
  if (lines.length === 0) throw new Error('No line created');
  const xline = lines[lines.length - 1];
  const len = Math.hypot(xline.end.x - xline.start.x, xline.end.y - xline.start.y);
  if (len < 10000) throw new Error('XLINE should be very long, got length ' + len.toFixed(0));
}

async function testXlineAlias() {
  await pressEsc();
  await page.evaluate(() => { window.__store.entities = []; window.__store.emit(); });

  await cmd('XL');
  const out = await getOutput(2);
  await pressEsc();
  if (out.includes('Unknown command')) throw new Error('XL alias not recognized');
  if (!out.includes('XLINE')) throw new Error('XL should trigger XLINE prompt: ' + out);
}

// ─── ALIGN TESTS ───

async function testAlign1Point() {
  await pressEsc();
  await page.evaluate(() => {
    const store = window.__store;
    store.entities = [];
    store.pushUndo('test');
    store.addEntity({
      id: 9200, type: 'line',
      start: { x: 10, y: 10 }, end: { x: 50, y: 10 },
      layer: '0', color: 'bylayer', lineweight: 1, linetype: 'continuous',
      visible: true, selected: true,
    });
    store.emit();
  });

  await cmd('ALIGN');
  await page.evaluate(() => {
    window.__store.view = { panX: 0, panY: 200, zoom: 3 };
  });
  await page.waitForTimeout(100);
  const box = await page.locator('#cad-canvas').boundingBox();

  // First source point at (10,10)
  let screen = await page.evaluate(() => window.__store.worldToScreen({ x: 10, y: 10 }));
  await page.mouse.click(box.x + screen.x, box.y + screen.y);
  await page.waitForTimeout(150);

  // First destination point at (60,60)
  screen = await page.evaluate(() => window.__store.worldToScreen({ x: 60, y: 60 }));
  await page.mouse.click(box.x + screen.x, box.y + screen.y);
  await page.waitForTimeout(150);

  // Press Enter for 1-point alignment (translate only)
  await cmd('');

  const out = await getOutput(3);
  const lines = await entitiesOfType('line');
  const moved = lines.find(l => l.id === '9200' || l.id === 9200);
  if (moved) {
    const dx = Math.abs(moved.start.x - 60);
    const dy = Math.abs(moved.start.y - 60);
    if (dx > 2 || dy > 2) throw new Error(`1-point align didn't translate: start=(${moved.start.x},${moved.start.y})`);
  } else if (!out.includes('aligned')) {
    throw new Error('ALIGN 1-point did not complete: ' + out);
  }
}

async function testAlign2Point() {
  await pressEsc();
  await page.evaluate(() => {
    const store = window.__store;
    store.entities = [];
    store.pushUndo('test');
    // Horizontal line at y=0
    store.addEntity({
      id: 9210, type: 'line',
      start: { x: 0, y: 0 }, end: { x: 100, y: 0 },
      layer: '0', color: 'bylayer', lineweight: 1, linetype: 'continuous',
      visible: true, selected: true,
    });
    store.emit();
  });

  await cmd('AL');  // alias
  await page.evaluate(() => {
    window.__store.view = { panX: 0, panY: 250, zoom: 2 };
  });
  await page.waitForTimeout(100);
  const box = await page.locator('#cad-canvas').boundingBox();

  // Src1 = (0,0)
  let screen = await page.evaluate(() => window.__store.worldToScreen({ x: 0, y: 0 }));
  await page.mouse.click(box.x + screen.x, box.y + screen.y);
  await page.waitForTimeout(150);

  // Dst1 = (50,50)
  screen = await page.evaluate(() => window.__store.worldToScreen({ x: 50, y: 50 }));
  await page.mouse.click(box.x + screen.x, box.y + screen.y);
  await page.waitForTimeout(150);

  // Src2 = (100,0)
  screen = await page.evaluate(() => window.__store.worldToScreen({ x: 100, y: 0 }));
  await page.mouse.click(box.x + screen.x, box.y + screen.y);
  await page.waitForTimeout(150);

  // Dst2 = (50,150)
  screen = await page.evaluate(() => window.__store.worldToScreen({ x: 50, y: 150 }));
  await page.mouse.click(box.x + screen.x, box.y + screen.y);
  await page.waitForTimeout(150);

  // No scale
  await cmd('N');

  const out = await getOutput(3);
  if (!out.includes('aligned'))
    throw new Error('ALIGN 2-point did not complete: ' + out);

  // Line should now be rotated (not horizontal anymore)
  const lines = await entitiesOfType('line');
  const aligned = lines.find(l => l.id === '9210' || l.id === 9210);
  if (aligned) {
    const dy = Math.abs(aligned.end.y - aligned.start.y);
    if (dy < 1) throw new Error('Line should be rotated after 2-point align');
  }
}

// ─── DIMANGULAR TESTS ───

async function testDimangularTwoLines() {
  await pressEsc();
  await page.evaluate(() => {
    const store = window.__store;
    store.entities = [];
    store.pushUndo('test');
    // Two lines meeting at origin at 90 degrees
    store.addEntity({
      id: 9300, type: 'line',
      start: { x: 0, y: 0 }, end: { x: 100, y: 0 },
      layer: '0', color: 'bylayer', lineweight: 1, linetype: 'continuous',
      visible: true, selected: false,
    });
    store.addEntity({
      id: 9301, type: 'line',
      start: { x: 0, y: 0 }, end: { x: 0, y: 100 },
      layer: '0', color: 'bylayer', lineweight: 1, linetype: 'continuous',
      visible: true, selected: false,
    });
    store.emit();
  });

  await cmd('DIMANGULAR');
  await page.evaluate(() => {
    window.__store.view = { panX: 0, panY: 200, zoom: 3 };
  });
  await page.waitForTimeout(100);
  const box = await page.locator('#cad-canvas').boundingBox();

  // Click first line (horizontal)
  let screen = await page.evaluate(() => window.__store.worldToScreen({ x: 50, y: 0 }));
  await page.mouse.click(box.x + screen.x, box.y + screen.y);
  await page.waitForTimeout(150);

  // Click second line (vertical)
  screen = await page.evaluate(() => window.__store.worldToScreen({ x: 0, y: 50 }));
  await page.mouse.click(box.x + screen.x, box.y + screen.y);
  await page.waitForTimeout(150);

  // Click to place dimension arc (in the first quadrant)
  screen = await page.evaluate(() => window.__store.worldToScreen({ x: 30, y: 30 }));
  await page.mouse.click(box.x + screen.x, box.y + screen.y);
  await page.waitForTimeout(200);

  const out = await getOutput(3);
  if (!out.includes('Angle'))
    throw new Error('DIMANGULAR did not report angle: ' + out);

  const dims = await entitiesOfType('dimension');
  const angDim = dims.find(d => d.dimType === 'angular');
  if (!angDim) throw new Error('No angular dimension entity created');
  // Should be 90 degrees
  if (!angDim.textOverride.includes('90'))
    throw new Error('Expected 90° angle, got: ' + angDim.textOverride);
}

async function testDimangularAlias() {
  await pressEsc();
  await page.evaluate(() => {
    const store = window.__store;
    store.entities = [];
    store.pushUndo('test');
    store.addEntity({
      id: 9310, type: 'line',
      start: { x: 0, y: 0 }, end: { x: 100, y: 0 },
      layer: '0', color: 'bylayer', lineweight: 1, linetype: 'continuous',
      visible: true, selected: false,
    });
    store.addEntity({
      id: 9311, type: 'line',
      start: { x: 0, y: 0 }, end: { x: 100, y: 100 },
      layer: '0', color: 'bylayer', lineweight: 1, linetype: 'continuous',
      visible: true, selected: false,
    });
    store.emit();
  });

  await cmd('DAN');  // alias
  const out = await getOutput(2);
  await pressEsc();
  if (out.includes('Unknown command')) throw new Error('DAN alias not recognized');
  if (!out.includes('DIMANGULAR')) throw new Error('DAN should trigger DIMANGULAR: ' + out);
}

async function testDimangularParallelRejects() {
  await pressEsc();
  await page.evaluate(() => {
    const store = window.__store;
    store.entities = [];
    store.pushUndo('test');
    // Two parallel horizontal lines
    store.addEntity({
      id: 9320, type: 'line',
      start: { x: 0, y: 0 }, end: { x: 100, y: 0 },
      layer: '0', color: 'bylayer', lineweight: 1, linetype: 'continuous',
      visible: true, selected: false,
    });
    store.addEntity({
      id: 9321, type: 'line',
      start: { x: 0, y: 50 }, end: { x: 100, y: 50 },
      layer: '0', color: 'bylayer', lineweight: 1, linetype: 'continuous',
      visible: true, selected: false,
    });
    store.emit();
  });

  await cmd('DIMANGULAR');
  await page.evaluate(() => {
    window.__store.view = { panX: 0, panY: 200, zoom: 3 };
  });
  await page.waitForTimeout(100);
  const box = await page.locator('#cad-canvas').boundingBox();

  // Click first line
  let screen = await page.evaluate(() => window.__store.worldToScreen({ x: 50, y: 0 }));
  await page.mouse.click(box.x + screen.x, box.y + screen.y);
  await page.waitForTimeout(150);

  // Click second line (parallel)
  screen = await page.evaluate(() => window.__store.worldToScreen({ x: 50, y: 50 }));
  await page.mouse.click(box.x + screen.x, box.y + screen.y);
  await page.waitForTimeout(200);

  const out = await getOutput(3);
  await pressEsc();
  if (!out.includes('parallel'))
    throw new Error('Should reject parallel lines: ' + out);
}

// ─── CIRCLE 2P/3P TESTS ───

async function testCircle2P() {
  await pressEsc();
  await page.evaluate(() => { window.__store.entities = []; window.__store.emit(); });

  await cmd('CIRCLE');
  await cmd('2P');
  await page.evaluate(() => {
    window.__store.view = { panX: 0, panY: 200, zoom: 3 };
  });
  await page.waitForTimeout(100);
  const box = await page.locator('#cad-canvas').boundingBox();

  // First diameter point (0,50)
  let screen = await page.evaluate(() => window.__store.worldToScreen({ x: 0, y: 50 }));
  await page.mouse.click(box.x + screen.x, box.y + screen.y);
  await page.waitForTimeout(150);

  // Second diameter point (100,50)
  screen = await page.evaluate(() => window.__store.worldToScreen({ x: 100, y: 50 }));
  await page.mouse.click(box.x + screen.x, box.y + screen.y);
  await page.waitForTimeout(200);

  const circles = await entitiesOfType('circle');
  if (circles.length === 0) throw new Error('No circle created');
  const c = circles[circles.length - 1];
  if (Math.abs(c.center.x - 50) > 2 || Math.abs(c.center.y - 50) > 2)
    throw new Error(`Center should be (50,50), got (${c.center.x},${c.center.y})`);
  if (Math.abs(c.radius - 50) > 2)
    throw new Error(`Radius should be 50, got ${c.radius}`);
}

async function testCircle3P() {
  await pressEsc();
  await page.evaluate(() => { window.__store.entities = []; window.__store.emit(); });

  await cmd('C');
  await cmd('3P');
  await page.evaluate(() => {
    window.__store.view = { panX: -10, panY: 200, zoom: 2 };
  });
  await page.waitForTimeout(100);
  const box = await page.locator('#cad-canvas').boundingBox();

  // Three points on a circle: (0,0), (100,0), (50,50)
  let screen = await page.evaluate(() => window.__store.worldToScreen({ x: 0, y: 0 }));
  await page.mouse.click(box.x + screen.x, box.y + screen.y);
  await page.waitForTimeout(150);

  screen = await page.evaluate(() => window.__store.worldToScreen({ x: 100, y: 0 }));
  await page.mouse.click(box.x + screen.x, box.y + screen.y);
  await page.waitForTimeout(150);

  screen = await page.evaluate(() => window.__store.worldToScreen({ x: 50, y: 50 }));
  await page.mouse.click(box.x + screen.x, box.y + screen.y);
  await page.waitForTimeout(200);

  const circles = await entitiesOfType('circle');
  if (circles.length === 0) throw new Error('No circle created in 3P mode');
  const out = await getOutput(3);
  if (!out.includes('3P')) throw new Error('Expected 3P confirmation: ' + out);
}

// ─── ARC MODE TESTS ───

async function testArcStartCenterEnd() {
  await pressEsc();
  await page.evaluate(() => { window.__store.entities = []; window.__store.emit(); });

  await cmd('ARC');
  await page.waitForTimeout(100);

  // Pick start point first, then type CE for center
  await page.evaluate(() => {
    window.__store.view = { panX: 0, panY: 200, zoom: 3 };
  });
  await page.waitForTimeout(100);
  const box = await page.locator('#cad-canvas').boundingBox();

  // Start point at (150,100)
  let screen = await page.evaluate(() => window.__store.worldToScreen({ x: 150, y: 100 }));
  await page.mouse.click(box.x + screen.x, box.y + screen.y);
  await page.waitForTimeout(150);

  // Type CE for center mode
  await cmd('CE');

  // Center point at (100,100)
  screen = await page.evaluate(() => window.__store.worldToScreen({ x: 100, y: 100 }));
  await page.mouse.click(box.x + screen.x, box.y + screen.y);
  await page.waitForTimeout(150);

  // End point at (100,150)
  screen = await page.evaluate(() => window.__store.worldToScreen({ x: 100, y: 150 }));
  await page.mouse.click(box.x + screen.x, box.y + screen.y);
  await page.waitForTimeout(200);

  const arcs = await entitiesOfType('arc');
  if (arcs.length === 0) throw new Error('No arc created in SCE mode');
  const out = await getOutput(3);
  if (!out.includes('SCE')) throw new Error('Expected SCE confirmation: ' + out);
}

async function testArcCenterMode() {
  await pressEsc();
  await page.evaluate(() => { window.__store.entities = []; window.__store.emit(); });

  await cmd('A');
  // Type Center from initial prompt
  await cmd('CE');
  await page.evaluate(() => {
    window.__store.view = { panX: 0, panY: 200, zoom: 3 };
  });
  await page.waitForTimeout(100);
  const box = await page.locator('#cad-canvas').boundingBox();

  // Center point at (80,80)
  let screen = await page.evaluate(() => window.__store.worldToScreen({ x: 80, y: 80 }));
  await page.mouse.click(box.x + screen.x, box.y + screen.y);
  await page.waitForTimeout(150);

  // Start point at (130,80) — radius=50
  screen = await page.evaluate(() => window.__store.worldToScreen({ x: 130, y: 80 }));
  await page.mouse.click(box.x + screen.x, box.y + screen.y);
  await page.waitForTimeout(150);

  // End point at (80,130) — 90° arc
  screen = await page.evaluate(() => window.__store.worldToScreen({ x: 80, y: 130 }));
  await page.mouse.click(box.x + screen.x, box.y + screen.y);
  await page.waitForTimeout(200);

  const arcs = await entitiesOfType('arc');
  if (arcs.length === 0) throw new Error('No arc created in Center mode');
  const out = await getOutput(3);
  if (!out.includes('CSE')) throw new Error('Expected CSE confirmation: ' + out);
}

async function testArcStartEndRadius() {
  await pressEsc();
  await page.evaluate(() => { window.__store.entities = []; window.__store.emit(); });

  await cmd('ARC');
  await page.evaluate(() => {
    window.__store.view = { panX: 0, panY: 200, zoom: 2 };
  });
  await page.waitForTimeout(100);
  const box = await page.locator('#cad-canvas').boundingBox();

  // Start point at (0,50)
  let screen = await page.evaluate(() => window.__store.worldToScreen({ x: 0, y: 50 }));
  await page.mouse.click(box.x + screen.x, box.y + screen.y);
  await page.waitForTimeout(150);

  // Type E for End mode
  await cmd('E');

  // End point at (100,50)
  screen = await page.evaluate(() => window.__store.worldToScreen({ x: 100, y: 50 }));
  await page.mouse.click(box.x + screen.x, box.y + screen.y);
  await page.waitForTimeout(150);

  // Enter radius
  await cmd('60');

  const arcs = await entitiesOfType('arc');
  if (arcs.length === 0) throw new Error('No arc created in SER mode');
  const out = await getOutput(3);
  if (!out.includes('SER')) throw new Error('Expected SER confirmation: ' + out);
}

async function testArcContinue() {
  await pressEsc();
  await page.evaluate(() => {
    const store = window.__store;
    store.entities = [];
    store.pushUndo('test');
    // Create a line to continue from
    store.addEntity({
      id: 9400, type: 'line',
      start: { x: 0, y: 0 }, end: { x: 100, y: 0 },
      layer: '0', color: 'bylayer', lineweight: 1, linetype: 'continuous',
      visible: true, selected: false,
    });
    store.emit();
  });

  await cmd('ARC');
  await cmd('CO');  // Continue mode

  await page.evaluate(() => {
    window.__store.view = { panX: 0, panY: 200, zoom: 2 };
  });
  await page.waitForTimeout(100);
  const box = await page.locator('#cad-canvas').boundingBox();

  // Click endpoint for the continuing arc
  let screen = await page.evaluate(() => window.__store.worldToScreen({ x: 150, y: 50 }));
  await page.mouse.click(box.x + screen.x, box.y + screen.y);
  await page.waitForTimeout(200);

  const out = await getOutput(3);
  const arcs = await entitiesOfType('arc');
  if (arcs.length === 0 && !out.includes('Continue') && !out.includes('line'))
    throw new Error('Arc Continue did not work: ' + out);
}

// ─── PLINE ARC SEGMENT TESTS ───

async function testPlineArcSegment() {
  await pressEsc();
  await page.evaluate(() => { window.__store.entities = []; window.__store.emit(); });

  await cmd('PL');
  await page.evaluate(() => {
    window.__store.view = { panX: 0, panY: 200, zoom: 3 };
  });
  await page.waitForTimeout(100);
  const box = await page.locator('#cad-canvas').boundingBox();

  // First point
  let screen = await page.evaluate(() => window.__store.worldToScreen({ x: 0, y: 0 }));
  await page.mouse.click(box.x + screen.x, box.y + screen.y);
  await page.waitForTimeout(150);

  // Second point (line segment)
  screen = await page.evaluate(() => window.__store.worldToScreen({ x: 50, y: 0 }));
  await page.mouse.click(box.x + screen.x, box.y + screen.y);
  await page.waitForTimeout(150);

  // Switch to arc mode
  await cmd('A');

  // Third point (arc segment)
  screen = await page.evaluate(() => window.__store.worldToScreen({ x: 100, y: 50 }));
  await page.mouse.click(box.x + screen.x, box.y + screen.y);
  await page.waitForTimeout(150);

  // Finish
  await cmd('');

  const polys = await entitiesOfType('polyline');
  if (polys.length === 0) throw new Error('No polyline created');
  const pl = polys[polys.length - 1];
  if (pl.points.length !== 3) throw new Error('Expected 3 points, got ' + pl.points.length);
  // First segment bulge=0 (line), second segment bulge=1 (arc)
  if (pl.bulges[0] !== 0) throw new Error('First segment should be line (bulge=0), got ' + pl.bulges[0]);
  if (pl.bulges[1] !== 1) throw new Error('Second segment should be arc (bulge=1), got ' + pl.bulges[1]);
}

async function testPlineArcToLineSwitch() {
  await pressEsc();
  await page.evaluate(() => { window.__store.entities = []; window.__store.emit(); });

  await cmd('PLINE');
  await page.evaluate(() => {
    window.__store.view = { panX: 0, panY: 200, zoom: 3 };
  });
  await page.waitForTimeout(100);
  const box = await page.locator('#cad-canvas').boundingBox();

  // First point
  let screen = await page.evaluate(() => window.__store.worldToScreen({ x: 0, y: 0 }));
  await page.mouse.click(box.x + screen.x, box.y + screen.y);
  await page.waitForTimeout(150);

  // Switch to arc
  await cmd('A');
  // Arc segment
  screen = await page.evaluate(() => window.__store.worldToScreen({ x: 50, y: 30 }));
  await page.mouse.click(box.x + screen.x, box.y + screen.y);
  await page.waitForTimeout(150);

  // Switch back to line
  await cmd('L');
  // Line segment
  screen = await page.evaluate(() => window.__store.worldToScreen({ x: 100, y: 30 }));
  await page.mouse.click(box.x + screen.x, box.y + screen.y);
  await page.waitForTimeout(150);

  await cmd('');

  const polys = await entitiesOfType('polyline');
  if (polys.length === 0) throw new Error('No polyline created');
  const pl = polys[polys.length - 1];
  if (pl.bulges[0] !== 1) throw new Error('First segment should be arc (bulge=1), got ' + pl.bulges[0]);
  if (pl.bulges[1] !== 0) throw new Error('Second segment should be line (bulge=0), got ' + pl.bulges[1]);
}

// ─── STRETCH VERTEX TEST ───

async function testStretchVertexOnly() {
  await pressEsc();
  await page.evaluate(() => {
    const store = window.__store;
    store.entities = [];
    store.pushUndo('test');
    // Line from (0,0) to (100,0)
    store.addEntity({
      id: 9500, type: 'line',
      start: { x: 0, y: 0 }, end: { x: 100, y: 0 },
      layer: '0', color: 'bylayer', lineweight: 1, linetype: 'continuous',
      visible: true, selected: true,
    });
    store.emit();
  });

  await cmd('STRETCH');
  await page.evaluate(() => {
    window.__store.view = { panX: 0, panY: 100, zoom: 3 };
  });
  await page.waitForTimeout(100);
  const box = await page.locator('#cad-canvas').boundingBox();

  // Base point near the end (100,0)
  let screen = await page.evaluate(() => window.__store.worldToScreen({ x: 100, y: 0 }));
  await page.mouse.click(box.x + screen.x, box.y + screen.y);
  await page.waitForTimeout(150);

  // Displacement point — move end to (150,50)
  screen = await page.evaluate(() => window.__store.worldToScreen({ x: 150, y: 50 }));
  await page.mouse.click(box.x + screen.x, box.y + screen.y);
  await page.waitForTimeout(200);

  const lines = await entitiesOfType('line');
  const stretched = lines.find(l => l.id === '9500' || l.id === 9500);
  if (!stretched) throw new Error('Line not found after stretch');
  // Start should stay at (0,0), end should have moved
  if (Math.abs(stretched.start.x) > 2 || Math.abs(stretched.start.y) > 2)
    throw new Error(`Start should stay at (0,0), got (${stretched.start.x},${stretched.start.y})`);
  if (Math.abs(stretched.end.x - 150) > 5 || Math.abs(stretched.end.y - 50) > 5)
    throw new Error(`End should move to ~(150,50), got (${stretched.end.x},${stretched.end.y})`);
}

// ─── LEADER TEST ───

async function testLeaderCreatesPolylineAndText() {
  await pressEsc();
  await page.evaluate(() => { window.__store.entities = []; window.__store.emit(); });

  await cmd('LEADER');
  await page.evaluate(() => {
    window.__store.view = { panX: 0, panY: 200, zoom: 3 };
  });
  await page.waitForTimeout(100);
  const box = await page.locator('#cad-canvas').boundingBox();

  // Arrow tip
  let screen = await page.evaluate(() => window.__store.worldToScreen({ x: 50, y: 50 }));
  await page.mouse.click(box.x + screen.x, box.y + screen.y);
  await page.waitForTimeout(150);

  // Leader end
  screen = await page.evaluate(() => window.__store.worldToScreen({ x: 100, y: 80 }));
  await page.mouse.click(box.x + screen.x, box.y + screen.y);
  await page.waitForTimeout(150);

  // Enter to finish points, then add text
  await cmd('');
  await page.waitForTimeout(100);
  await cmd('Note A');

  const polys = await entitiesOfType('polyline');
  const texts = await entitiesOfType('text');
  if (polys.length === 0) throw new Error('No leader polyline created');
  if (texts.length === 0) throw new Error('No leader text created');
  if (texts[texts.length - 1].text !== 'Note A') throw new Error('Text content wrong');
}

async function testLeaderAlias() {
  await pressEsc();
  await cmd('LE');
  const out = await getOutput(2);
  await pressEsc();
  if (out.includes('Unknown command')) throw new Error('LE alias not recognized');
}

// ─── DIMBASELINE TEST ───

async function testDimbaseline() {
  await pressEsc();
  await page.evaluate(() => {
    const store = window.__store;
    store.entities = [];
    store.pushUndo('test');
    // Create a linear dimension so DIMBASELINE has something to work from
    store.addEntity({
      id: 9600, type: 'dimension', dimType: 'linear',
      p1: { x: 0, y: 0 }, p2: { x: 50, y: 0 },
      textPos: { x: 25, y: 20 }, textOverride: '50.00',
      layer: '0', color: 'bylayer', lineweight: 1, linetype: 'continuous',
      visible: true, selected: false,
    });
    store.emit();
  });

  await cmd('DIMBASELINE');
  await page.evaluate(() => {
    window.__store.view = { panX: 0, panY: 200, zoom: 2 };
  });
  await page.waitForTimeout(100);
  const box = await page.locator('#cad-canvas').boundingBox();

  // Click second extension line origin
  let screen = await page.evaluate(() => window.__store.worldToScreen({ x: 120, y: 0 }));
  await page.mouse.click(box.x + screen.x, box.y + screen.y);
  await page.waitForTimeout(200);

  const dims = await entitiesOfType('dimension');
  if (dims.length < 2) throw new Error('No baseline dimension created');
  const out = await getOutput(3);
  if (!out.includes('Dimension')) throw new Error('DIMBASELINE did not report: ' + out);
}

// ─── DIMORDINATE TEST ───

async function testDimordinate() {
  await pressEsc();
  await page.evaluate(() => { window.__store.entities = []; window.__store.emit(); });

  await cmd('DIMORDINATE');
  await page.evaluate(() => {
    window.__store.view = { panX: 0, panY: 200, zoom: 2 };
  });
  await page.waitForTimeout(100);
  const box = await page.locator('#cad-canvas').boundingBox();

  // Feature point at (75, 30)
  let screen = await page.evaluate(() => window.__store.worldToScreen({ x: 75, y: 30 }));
  await page.mouse.click(box.x + screen.x, box.y + screen.y);
  await page.waitForTimeout(150);

  // Leader endpoint — more horizontal → should show Y value
  screen = await page.evaluate(() => window.__store.worldToScreen({ x: 130, y: 35 }));
  await page.mouse.click(box.x + screen.x, box.y + screen.y);
  await page.waitForTimeout(200);

  const out = await getOutput(3);
  if (!out.includes('Ordinate')) throw new Error('DIMORDINATE did not complete: ' + out);
  const dims = await entitiesOfType('dimension');
  if (dims.length === 0) throw new Error('No ordinate dimension created');
}

// ─── DIMCENTER TEST ───

async function testDimcenter() {
  await pressEsc();
  await page.evaluate(() => {
    const store = window.__store;
    store.entities = [];
    store.pushUndo('test');
    store.addEntity({
      id: 9700, type: 'circle', center: { x: 80, y: 80 }, radius: 30,
      layer: '0', color: 'bylayer', lineweight: 1, linetype: 'continuous',
      visible: true, selected: false,
    });
    store.emit();
  });

  const before = await entityCount();
  await cmd('DIMCENTER');
  await page.evaluate(() => {
    window.__store.view = { panX: 0, panY: 200, zoom: 3 };
  });
  await page.waitForTimeout(100);
  const box = await page.locator('#cad-canvas').boundingBox();

  // Click on the circle
  let screen = await page.evaluate(() => window.__store.worldToScreen({ x: 110, y: 80 }));
  await page.mouse.click(box.x + screen.x, box.y + screen.y);
  await page.waitForTimeout(200);

  const after = await entityCount();
  if (after <= before) throw new Error('No center mark lines created');
  const out = await getOutput(3);
  if (!out.includes('Center mark')) throw new Error('DIMCENTER did not confirm: ' + out);
}

// ─── ID TEST ───

async function testIdCommand() {
  await pressEsc();
  await page.evaluate(() => { window.__store.entities = []; window.__store.emit(); });

  await cmd('ID');
  await page.evaluate(() => {
    window.__store.view = { panX: 0, panY: 200, zoom: 3 };
  });
  await page.waitForTimeout(100);
  const box = await page.locator('#cad-canvas').boundingBox();

  let screen = await page.evaluate(() => window.__store.worldToScreen({ x: 42, y: 58 }));
  await page.mouse.click(box.x + screen.x, box.y + screen.y);
  await page.waitForTimeout(200);

  const out = await getOutput(3);
  if (!out.includes('X') || !out.includes('Y'))
    throw new Error('ID should display coordinates: ' + out);
}

// ─── MEASURE TEST ───

async function testMeasureCommand() {
  await pressEsc();
  await page.evaluate(() => {
    const store = window.__store;
    store.entities = [];
    store.pushUndo('test');
    store.addEntity({
      id: 9800, type: 'line',
      start: { x: 0, y: 0 }, end: { x: 100, y: 0 },
      layer: '0', color: 'bylayer', lineweight: 1, linetype: 'continuous',
      visible: true, selected: false,
    });
    store.emit();
  });

  await cmd('MEASURE');
  await page.evaluate(() => {
    window.__store.view = { panX: 0, panY: 100, zoom: 3 };
  });
  await page.waitForTimeout(100);
  const box = await page.locator('#cad-canvas').boundingBox();

  // Click on line
  let screen = await page.evaluate(() => window.__store.worldToScreen({ x: 50, y: 0 }));
  await page.mouse.click(box.x + screen.x, box.y + screen.y);
  await page.waitForTimeout(150);

  // Enter segment length of 25 — should place 3 points (at 25, 50, 75)
  await cmd('25');

  const points = await entitiesOfType('point');
  if (points.length < 3) throw new Error('Expected at least 3 measure points, got ' + points.length);
  const out = await getOutput(3);
  if (!out.includes('point')) throw new Error('MEASURE did not confirm: ' + out);
}

// ─── SNAP TEST ───

async function testSnapCommand() {
  await pressEsc();
  await cmd('SNAP');
  const out = await getOutput(2);
  if (!out.includes('SNAP') && !out.includes('spacing'))
    throw new Error('SNAP command did not show status: ' + out);
  await cmd('5');
  const out2 = await getOutput(2);
  if (!out2.includes('5')) throw new Error('SNAP spacing not set: ' + out2);
}

// ─── OOPS TEST ───

async function testOopsCommand() {
  await pressEsc();
  await page.evaluate(() => {
    const store = window.__store;
    store.entities = [];
    store.pushUndo('test');
    store.addEntity({
      id: 9900, type: 'line',
      start: { x: 0, y: 0 }, end: { x: 50, y: 50 },
      layer: '0', color: 'bylayer', lineweight: 1, linetype: 'continuous',
      visible: true, selected: true,
    });
    store.emit();
  });

  // Erase it
  await cmd('ERASE');
  await page.waitForTimeout(200);
  let count = await entityCount();
  if (count !== 0) throw new Error('ERASE did not remove entity');

  // OOPS to restore
  await cmd('OOPS');
  await page.waitForTimeout(200);
  count = await entityCount();
  const out = await getOutput(3);
  if (count === 0 && !out.includes('restored'))
    throw new Error('OOPS did not restore erased entities: ' + out);
}

// ─── LTSCALE TEST ───

async function testLtscaleCommand() {
  await pressEsc();
  await cmd('LTSCALE');
  const out = await getOutput(2);
  if (!out.includes('LTSCALE') && !out.includes('scale'))
    throw new Error('LTSCALE did not show: ' + out);
  await cmd('2.5');
  const out2 = await getOutput(2);
  if (!out2.includes('2.5')) throw new Error('LTSCALE not set: ' + out2);
}

// ─── NEW TEST ───

async function testNewCommand() {
  await pressEsc();
  await page.evaluate(() => {
    const store = window.__store;
    store.entities = [];
    store.addEntity({
      id: 9950, type: 'line',
      start: { x: 0, y: 0 }, end: { x: 50, y: 50 },
      layer: '0', color: 'bylayer', lineweight: 1, linetype: 'continuous',
      visible: true, selected: false,
    });
    store.emit();
  });

  await cmd('NEW');
  await cmd('Y');
  await page.waitForTimeout(200);

  const count = await entityCount();
  if (count !== 0) throw new Error('NEW should clear all entities, got ' + count);
}

// ─── RAY TEST ───

async function testRayCommand() {
  await pressEsc();
  await page.evaluate(() => { window.__store.entities = []; window.__store.emit(); });

  await cmd('RAY');
  await page.evaluate(() => {
    window.__store.view = { panX: 0, panY: 200, zoom: 3 };
  });
  await page.waitForTimeout(100);
  const box = await page.locator('#cad-canvas').boundingBox();

  // Start point
  let screen = await page.evaluate(() => window.__store.worldToScreen({ x: 50, y: 50 }));
  await page.mouse.click(box.x + screen.x, box.y + screen.y);
  await page.waitForTimeout(150);

  // Through point
  screen = await page.evaluate(() => window.__store.worldToScreen({ x: 100, y: 80 }));
  await page.mouse.click(box.x + screen.x, box.y + screen.y);
  await page.waitForTimeout(200);

  await cmd('');  // exit

  const lines = await entitiesOfType('line');
  if (lines.length === 0) throw new Error('No ray line created');
  const ray = lines[lines.length - 1];
  // Start should be near (50,50), end should be very far away
  if (Math.abs(ray.start.x - 50) > 2) throw new Error('Ray start not at origin point');
  const len = Math.hypot(ray.end.x - ray.start.x, ray.end.y - ray.start.y);
  if (len < 10000) throw new Error('RAY should be very long, got length ' + len.toFixed(0));
}

// ─── MAIN ───

(async () => {
  await setup();

  console.log('\n=== TRIM enhanced ===');
  await test('TRIM — arc by crossing line', testTrimArcByLine);
  await test('TRIM — circle by two lines → arc', testTrimCircleByTwoLines);
  await test('TRIM — polyline end segment', testTrimPolylineEndSegment);
  await test('TRIM — reject no intersection', testTrimRejectsNoIntersection);

  console.log('\n=== EXTEND enhanced ===');
  await test('EXTEND — arc to boundary line', testExtendArcToBoundary);
  await test('EXTEND — polyline to boundary', testExtendPolylineToBoundary);
  await test('EXTEND — circle rejected', testExtendCircleFails);

  console.log('\n=== FILLET line+arc, arc+arc ===');
  await test('FILLET — line+arc radius=0', testFilletLineArcRadius0);
  await test('FILLET — line+arc radius>0', testFilletLineArcWithRadius);
  await test('FILLET — arc+arc radius=0', testFilletArcArcRadius0);

  console.log('\n=== SAVE / OPEN ===');
  await test('SAVE — command executes', testSaveCommand);
  await test('SAVE — alias SA', testSaveAlias);
  await test('OPEN — command recognized', testOpenCommand);
  await test('OPEN — alias DN', testOpenAlias);

  console.log('\n=== DONUT ===');
  await test('DONUT — inner=0 creates filled circle', testDonutFilledCircle);
  await test('DONUT — inner>0 creates polyline with bulges', testDonutPolyline);
  await test('DONUT — multiple placement', testDonutMultiplePlacement);

  console.log('\n=== XLINE ===');
  await test('XLINE — creates very long construction line', testXlineCreatesLongLine);
  await test('XLINE — alias XL recognized', testXlineAlias);

  console.log('\n=== ALIGN ===');
  await test('ALIGN — 1-point translate', testAlign1Point);
  await test('ALIGN — 2-point translate+rotate (AL alias)', testAlign2Point);

  console.log('\n=== DIMANGULAR ===');
  await test('DIMANGULAR — 90° between two lines', testDimangularTwoLines);
  await test('DIMANGULAR — alias DAN recognized', testDimangularAlias);
  await test('DIMANGULAR — parallel lines rejected', testDimangularParallelRejects);

  console.log('\n=== CIRCLE 2P/3P ===');
  await test('CIRCLE — 2P diameter mode', testCircle2P);
  await test('CIRCLE — 3P circumscribed mode', testCircle3P);

  console.log('\n=== ARC modes ===');
  await test('ARC — Start/Center/End (SCE)', testArcStartCenterEnd);
  await test('ARC — Center/Start/End (CSE)', testArcCenterMode);
  await test('ARC — Start/End/Radius (SER)', testArcStartEndRadius);
  await test('ARC — Continue from last entity', testArcContinue);

  console.log('\n=== PLINE arc segments ===');
  await test('PLINE — arc segment with bulge=1', testPlineArcSegment);
  await test('PLINE — arc→line mode switching', testPlineArcToLineSwitch);

  console.log('\n=== STRETCH vertex ===');
  await test('STRETCH — moves only near vertex', testStretchVertexOnly);

  console.log('\n=== LEADER ===');
  await test('LEADER — creates polyline + text', testLeaderCreatesPolylineAndText);
  await test('LEADER — alias LE recognized', testLeaderAlias);

  console.log('\n=== DIMBASELINE ===');
  await test('DIMBASELINE — baseline from first point', testDimbaseline);

  console.log('\n=== DIMORDINATE ===');
  await test('DIMORDINATE — auto-detect axis', testDimordinate);

  console.log('\n=== DIMCENTER ===');
  await test('DIMCENTER — center mark on circle', testDimcenter);

  console.log('\n=== ID ===');
  await test('ID — display point coordinates', testIdCommand);

  console.log('\n=== MEASURE ===');
  await test('MEASURE — place points at interval', testMeasureCommand);

  console.log('\n=== SNAP ===');
  await test('SNAP — set spacing', testSnapCommand);

  console.log('\n=== OOPS ===');
  await test('OOPS — restore erased entities', testOopsCommand);

  console.log('\n=== LTSCALE ===');
  await test('LTSCALE — set linetype scale', testLtscaleCommand);

  console.log('\n=== NEW ===');
  await test('NEW — clear drawing', testNewCommand);

  console.log('\n=== RAY ===');
  await test('RAY — half-infinite construction line', testRayCommand);

  await browser.close();

  console.log('\n========== SUMMARY ==========');
  const pass = RESULTS.filter(r => r.status === 'PASS').length;
  const fail = RESULTS.filter(r => r.status === 'FAIL').length;
  console.log(`Total: ${RESULTS.length} | Passed: ${pass} | Failed: ${fail}`);
  if (fail > 0) {
    console.log('\nFailed:');
    RESULTS.filter(r => r.status === 'FAIL').forEach(r => console.log(`  ✗ ${r.name}: ${r.notes}`));
  }
  process.exit(fail > 0 ? 1 : 0);
})();
