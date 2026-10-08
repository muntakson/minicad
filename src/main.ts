import { Renderer } from './renderer';
import { createCommandEngine, zoomExtents } from './commands/index';
import { store } from './store';
import { findSnap } from './snap';
import { entityBounds, pointOnEntity as pointOnEntityCheck, getGripPoints, moveGrip, dist } from './geometry';
import { Point, Entity } from './types';

const canvas = document.getElementById('cad-canvas') as HTMLCanvasElement;
const cmdInput = document.getElementById('cmd-input') as HTMLInputElement;
const cmdHistory = document.getElementById('cmd-history') as HTMLDivElement;
const coordDisplay = document.getElementById('coord-display') as HTMLSpanElement;
const snapDisplay = document.getElementById('snap-display') as HTMLSpanElement;
const orthoDisplay = document.getElementById('ortho-display') as HTMLSpanElement;
const gridDisplay = document.getElementById('grid-display') as HTMLSpanElement;
const gridSnapDisplay = document.getElementById('gridsnap-display') as HTMLSpanElement;
const layerDisplay = document.getElementById('layer-display') as HTMLSpanElement;
const contextMenu = document.getElementById('context-menu') as HTMLDivElement;
const menubar = document.getElementById('menubar') as HTMLDivElement;

const renderer = new Renderer(canvas);

function appendHistory(msg: string) {
  const line = document.createElement('div');
  line.textContent = msg;
  cmdHistory.appendChild(line);
  cmdHistory.scrollTop = cmdHistory.scrollHeight;
}

function promptFn(msg: string) {
  appendHistory(msg);
}

function inputFn(prompt: string, _handler: (input: string) => boolean) {
  cmdInput.placeholder = prompt;
}

const engine = createCommandEngine(renderer, promptFn, inputFn);

// === CANVAS MOUSE HANDLING ===

let isPanning = false;
let panStart = { x: 0, y: 0 };
let panViewStart = { panX: 0, panY: 0 };

let isPanningCmd = false;

let isDraggingSelBox = false;
let selBoxStart: Point = { x: 0, y: 0 };
const SEL_BOX_THRESHOLD = 5;

// Grip editing state
let gripEdit: { entity: Entity; gripIndex: number; origin: Point } | null = null;

canvas.addEventListener('mousemove', (e) => {
  const rect = canvas.getBoundingClientRect();
  const sx = e.clientX - rect.left;
  const sy = e.clientY - rect.top;
  const world = store.screenToWorld(sx, sy);

  // Ortho constraint
  let constrained = world;
  if (store.orthoOn && engine.isActive) {
    constrained = applyOrtho(world);
  }

  // Snap
  const snap = findSnap(constrained, { x: sx, y: sy });
  renderer.snapResult = snap;
  renderer.cursorWorld = snap.point;

  // Coordinate display
  if (store.coordDisplayMode === 'cartesian') {
    const p = store.unitPrecision;
    coordDisplay.textContent = `${snap.point.x.toFixed(p)}, ${snap.point.y.toFixed(p)}, ${'0'.padEnd(p + 2, p > 0 ? '0' : '')}`;
  } else if (store.coordDisplayMode === 'polar') {
    const base = store.lastPoint;
    const dx = snap.point.x - base.x, dy = snap.point.y - base.y;
    const d = Math.hypot(dx, dy);
    const a = (Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360;
    coordDisplay.textContent = `${d.toFixed(store.unitPrecision)}<${a.toFixed(1)}°`;
  } else {
    coordDisplay.textContent = '';
  }

  if (isPanning || isPanningCmd) {
    const dx = (e.clientX - panStart.x) / store.view.zoom;
    const dy = (e.clientY - panStart.y) / store.view.zoom;
    store.view.panX = panViewStart.panX - dx;
    store.view.panY = panViewStart.panY + dy;
  }

  if (isDraggingSelBox) {
    renderer.selectionBox = { p1: selBoxStart, p2: snap.point };
  }

  if (gripEdit) {
    renderer.gripRubberBand = { start: gripEdit.origin, end: snap.point };
  }

  engine.handleMove(snap.point);
});

canvas.addEventListener('mousedown', (e) => {
  if (e.button === 1) {
    isPanning = true;
    panStart = { x: e.clientX, y: e.clientY };
    panViewStart = { panX: store.view.panX, panY: store.view.panY };
    canvas.style.cursor = 'grabbing';
    e.preventDefault();
    return;
  }
  if (e.button === 0 && store.tool === 'pan') {
    isPanningCmd = true;
    panStart = { x: e.clientX, y: e.clientY };
    panViewStart = { panX: store.view.panX, panY: store.view.panY };
    canvas.style.cursor = 'grabbing';
    e.preventDefault();
    return;
  }
  if (e.button === 0) {
    const snap = renderer.snapResult;
    const pt = snap ? snap.point : renderer.cursorWorld;

    // If grip edit is active, place the grip at new position
    if (gripEdit) {
      store.pushUndo('GRIP');
      moveGrip(gripEdit.entity, gripEdit.gripIndex, pt);
      store.emit();
      gripEdit = null;
      renderer.hotGrip = null;
      renderer.gripRubberBand = null;
      promptFn('');
      cmdInput.focus();
      return;
    }

    if (!engine.isActive) {
      // Check if click is on an existing grip
      const gripTol = 6 / store.view.zoom;
      for (const ent of store.entities) {
        if (!ent.visible || !ent.selected) continue;
        const grips = getGripPoints(ent);
        for (let gi = 0; gi < grips.length; gi++) {
          if (dist(pt, grips[gi]) <= gripTol) {
            gripEdit = { entity: ent, gripIndex: gi, origin: grips[gi] };
            renderer.hotGrip = { entityId: ent.id, gripIndex: gi };
            promptFn('** STRETCH **  Specify stretch point:');
            cmdInput.focus();
            return;
          }
        }
      }

      const tol = 10 / store.view.zoom;
      let hit: Entity | null = null;
      for (const ent of store.entities) {
        if (ent.visible && pointOnEntityCheck(pt, ent, tol)) {
          hit = ent; break;
        }
      }
      if (hit) {
        if (!e.shiftKey) store.clearSelection();
        hit.selected = !hit.selected;
        store.emit();
        const count = store.selectedEntities().length;
        if (count > 0) promptFn(`${count} found`);
      } else {
        isDraggingSelBox = true;
        selBoxStart = pt;
        store.clearSelection();
        store.emit();
      }
    } else {
      engine.handleClick(pt);
    }
    cmdInput.focus();
  }
});

canvas.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  showContextMenu(e.clientX, e.clientY);
});

canvas.addEventListener('mouseup', (e) => {
  if (e.button === 1) {
    isPanning = false;
    canvas.style.cursor = 'none';
  }
  if (e.button === 0 && isPanningCmd) {
    isPanningCmd = false;
    canvas.style.cursor = store.tool === 'pan' ? 'grab' : 'none';
  }
  if (e.button === 0 && isDraggingSelBox) {
    isDraggingSelBox = false;
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const endWorld = store.screenToWorld(sx, sy);
    const s1 = store.worldToScreen(selBoxStart);
    const s2 = store.worldToScreen(endWorld);
    const screenDist = Math.hypot(s2.x - s1.x, s2.y - s1.y);

    if (screenDist > SEL_BOX_THRESHOLD) {
      const leftToRight = s2.x > s1.x;
      const boxMinX = Math.min(selBoxStart.x, endWorld.x);
      const boxMaxX = Math.max(selBoxStart.x, endWorld.x);
      const boxMinY = Math.min(selBoxStart.y, endWorld.y);
      const boxMaxY = Math.max(selBoxStart.y, endWorld.y);

      for (const ent of store.entities) {
        if (!ent.visible) continue;
        const b = entityBounds(ent);
        if (!b) continue;
        if (leftToRight) {
          // Window: entity must be fully inside
          if (b.min.x >= boxMinX && b.max.x <= boxMaxX &&
              b.min.y >= boxMinY && b.max.y <= boxMaxY) {
            ent.selected = true;
          }
        } else {
          // Crossing: entity overlaps the box
          if (b.max.x >= boxMinX && b.min.x <= boxMaxX &&
              b.max.y >= boxMinY && b.min.y <= boxMaxY) {
            ent.selected = true;
          }
        }
      }
      const count = store.selectedEntities().length;
      if (count > 0) promptFn(`${count} found`);
      store.emit();
    }
    renderer.selectionBox = null;
  }
  cmdInput.focus();
});

canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  const rect = canvas.getBoundingClientRect();
  const sx = e.clientX - rect.left;
  const sy = e.clientY - rect.top;
  const worldBefore = store.screenToWorld(sx, sy);

  const factor = e.deltaY > 0 ? 0.9 : 1.1;
  store.view.zoom *= factor;
  store.view.zoom = Math.max(0.01, Math.min(1000, store.view.zoom));

  const worldAfter = store.screenToWorld(sx, sy);
  store.view.panX -= worldAfter.x - worldBefore.x;
  store.view.panY -= worldAfter.y - worldBefore.y;
}, { passive: false });

// === COMMAND HISTORY (Up/Down arrows) ===

const cmdHistoryList: string[] = [];
let cmdHistoryIdx = -1;

// === COMMAND LINE ===

function submitCommand() {
  const val = cmdInput.value;
  cmdInput.value = '';

  // Handle grip edit input
  if (gripEdit) {
    if (val.trim() === '') {
      // Enter confirms at current cursor position
      store.pushUndo('GRIP');
      moveGrip(gripEdit.entity, gripEdit.gripIndex, renderer.cursorWorld);
      store.emit();
      gripEdit = null;
      renderer.hotGrip = null;
      renderer.gripRubberBand = null;
      cmdInput.placeholder = 'Command:';
      return;
    }
    // Try to parse as coordinates
    const coordMatch = val.match(/^(-?[\d.]+)\s*,\s*(-?[\d.]+)$/);
    if (coordMatch) {
      const pt = { x: parseFloat(coordMatch[1]), y: parseFloat(coordMatch[2]) };
      store.pushUndo('GRIP');
      moveGrip(gripEdit.entity, gripEdit.gripIndex, pt);
      store.emit();
      gripEdit = null;
      renderer.hotGrip = null;
      renderer.gripRubberBand = null;
      cmdInput.placeholder = 'Command:';
      return;
    }
    // Relative coordinate
    const relMatch = val.match(/^@(-?[\d.]+)\s*,\s*(-?[\d.]+)$/);
    if (relMatch) {
      const pt = {
        x: gripEdit.origin.x + parseFloat(relMatch[1]),
        y: gripEdit.origin.y + parseFloat(relMatch[2]),
      };
      store.pushUndo('GRIP');
      moveGrip(gripEdit.entity, gripEdit.gripIndex, pt);
      store.emit();
      gripEdit = null;
      renderer.hotGrip = null;
      renderer.gripRubberBand = null;
      cmdInput.placeholder = 'Command:';
      return;
    }
    promptFn('Invalid point. Specify stretch point or press Escape:');
    return;
  }

  if (val.trim()) {
    appendHistory(`Command: ${val}`);
    cmdHistoryList.push(val);
    if (cmdHistoryList.length > 50) cmdHistoryList.shift();
  }
  cmdHistoryIdx = -1;
  engine.handleInput(val);
  cmdInput.placeholder = 'Command:';
}

cmdInput.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowUp') {
    e.preventDefault();
    if (cmdHistoryList.length === 0) return;
    if (cmdHistoryIdx === -1) cmdHistoryIdx = cmdHistoryList.length;
    if (cmdHistoryIdx > 0) {
      cmdHistoryIdx--;
      cmdInput.value = cmdHistoryList[cmdHistoryIdx];
    }
    return;
  }
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    if (cmdHistoryIdx === -1) return;
    if (cmdHistoryIdx < cmdHistoryList.length - 1) {
      cmdHistoryIdx++;
      cmdInput.value = cmdHistoryList[cmdHistoryIdx];
    } else {
      cmdHistoryIdx = -1;
      cmdInput.value = '';
    }
    return;
  }
  if (e.key === 'Enter') {
    e.preventDefault();
    submitCommand();
  } else if (e.key === ' ' && !cmdInput.value.includes(',') && !cmdInput.value.includes('@') && !cmdInput.value.includes('<')) {
    e.preventDefault();
    submitCommand();
  } else if (e.key === 'Escape') {
    if (contextMenu.classList.contains('open')) { contextMenu.classList.remove('open'); return; }
    closeAllMenus();
    if (gripEdit) {
      gripEdit = null;
      renderer.hotGrip = null;
      renderer.gripRubberBand = null;
      appendHistory('*Cancel*');
      cmdInput.value = '';
      cmdInput.placeholder = 'Command:';
      return;
    }
    engine.cancel();
    appendHistory('*Cancel*');
    cmdInput.value = '';
    cmdInput.placeholder = 'Command:';
  }
});

// Global keyboard — always focus command line when typing
document.addEventListener('keydown', (e) => {
  // Don't intercept if already focused on input
  if (document.activeElement === cmdInput) {
    if (e.key === 'F1') { e.preventDefault(); showHelp(); return; }
    if (e.key === 'F3') { e.preventDefault(); toggleOsnap(); return; }
    if (e.key === 'F6') { e.preventDefault(); toggleCoordDisplay(); return; }
    if (e.key === 'F7') { e.preventDefault(); engine.handleInput('GRID'); return; }
    if (e.key === 'F8') { e.preventDefault(); engine.handleInput('ORTHO'); return; }
    if (e.key === 'F9') { e.preventDefault(); toggleGridSnap(); return; }
    return;
  }

  // Ctrl shortcuts
  if (e.ctrlKey && e.key === 'z') { e.preventDefault(); engine.handleInput('UNDO'); return; }
  if (e.ctrlKey && e.key === 'y') { e.preventDefault(); engine.handleInput('REDO'); return; }

  if (e.key === 'Escape') {
    if (contextMenu.classList.contains('open')) { contextMenu.classList.remove('open'); return; }
    closeAllMenus();
    if (gripEdit) {
      gripEdit = null;
      renderer.hotGrip = null;
      renderer.gripRubberBand = null;
      appendHistory('*Cancel*');
      return;
    }
    engine.cancel();
    appendHistory('*Cancel*');
    return;
  }

  if (e.key === 'F1') { e.preventDefault(); showHelp(); return; }
  if (e.key === 'F3') { e.preventDefault(); toggleOsnap(); return; }
  if (e.key === 'F6') { e.preventDefault(); toggleCoordDisplay(); return; }
  if (e.key === 'F7') { e.preventDefault(); engine.handleInput('GRID'); return; }
  if (e.key === 'F8') { e.preventDefault(); engine.handleInput('ORTHO'); return; }
  if (e.key === 'F9') { e.preventDefault(); toggleGridSnap(); return; }

  // Enter/Space outside cmdInput — forward to engine (critical for multi-step commands
  // like TRIM where clicking the canvas steals focus from cmdInput)
  if (e.key === 'Enter') {
    e.preventDefault();
    cmdInput.focus();
    submitCommand();
    return;
  }
  if (e.key === ' ') {
    e.preventDefault();
    cmdInput.focus();
    submitCommand();
    return;
  }

  // Any printable key focuses the command line and forwards the character
  if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
    cmdInput.focus();
    cmdInput.value += e.key;
    e.preventDefault();
  }
});

// === STATUS BAR TOGGLES ===

snapDisplay.addEventListener('click', () => toggleOsnap());
orthoDisplay.addEventListener('click', () => { engine.handleInput('ORTHO'); });
gridDisplay.addEventListener('click', () => { engine.handleInput('GRID'); });
gridSnapDisplay.addEventListener('click', () => toggleGridSnap());

// === RENDER LOOP ===

function frame() {
  renderer.resize();
  renderer.render();

  // Status bar
  snapDisplay.textContent = store.snapModes.size > 0 ? 'OSNAP' : 'osnap';
  snapDisplay.className = store.snapModes.size > 0 ? 'status-toggle active' : 'status-toggle';
  orthoDisplay.textContent = store.orthoOn ? 'ORTHO' : 'ortho';
  orthoDisplay.className = store.orthoOn ? 'status-toggle active' : 'status-toggle';
  gridDisplay.textContent = store.gridOn ? 'GRID' : 'grid';
  gridDisplay.className = store.gridOn ? 'status-toggle active' : 'status-toggle';
  gridSnapDisplay.textContent = store.snapToGrid ? 'SNAP' : 'snap';
  gridSnapDisplay.className = store.snapToGrid ? 'status-toggle active' : 'status-toggle';
  const curLayer = store.currentLayer();
  layerDisplay.textContent = curLayer.name;
  layerDisplay.style.color = curLayer.color === '#ffffff' ? '#000' : curLayer.color;

  requestAnimationFrame(frame);
}

// === ORTHO ===

function applyOrtho(world: Point): Point {
  const base = store.lastPoint;
  const dx = world.x - base.x;
  const dy = world.y - base.y;
  if (Math.abs(dx) >= Math.abs(dy)) {
    return { x: world.x, y: base.y };
  } else {
    return { x: base.x, y: world.y };
  }
}

// === DXF FILE I/O ===

const API_BASE = window.location.hostname === 'localhost' ? 'http://localhost:3002' : '';

async function dxfOpen() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.dxf';
  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file) return;
    promptFn(`Opening ${file.name}...`);
    const form = new FormData();
    form.append('file', file);
    try {
      const res = await fetch(`${API_BASE}/api/dxf/import`, { method: 'POST', body: form });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      store.pushUndo('OPEN');
      store.entities = data.entities;
      if (data.layers) {
        store.layers = data.layers.map((l: any) => ({
          name: l.name, color: l.color || '#ffffff',
          visible: true, locked: false, frozen: false, current: l.name === '0',
          lineweight: l.lineweight || 1,
        }));
      }
      store.emit();
      zoomExtents();
      promptFn(`Opened ${file.name}: ${data.count} entities`);
    } catch (e: any) {
      promptFn(`Error: ${e.message}`);
    }
  };
  input.click();
}

async function dxfSave() {
  promptFn('Saving DXF...');
  try {
    const res = await fetch(`${API_BASE}/api/dxf/export`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        entities: store.entities,
        layers: store.layers,
        filename: 'drawing.dxf',
      }),
    });
    if (!res.ok) throw new Error(await res.text());
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'drawing.dxf'; a.click();
    URL.revokeObjectURL(url);
    promptFn('DXF saved');
  } catch (e: any) {
    promptFn(`Error: ${e.message}`);
  }
}

// Expose to toolbar buttons and tests
(window as any).dxfOpen = dxfOpen;
(window as any).dxfSave = dxfSave;
(window as any).__store = store;
(window as any).__engine = engine;

// === FUNCTION KEY HELPERS ===

function showHelp() {
  appendHistory('--- MiniCAD Help (287 commands) ---');
  appendHistory('Drawing: LINE(L) CIRCLE(C) ARC(A) PLINE(PL) RECTANG(REC) POLYGON(POL) ELLIPSE(EL) SPLINE(SPL) POINT(PO) TEXT(DT) DTEXT HELIX(HX)');
  appendHistory('         MLINE(ML) SOLID(SO) DONUT(DO) XLINE(XL) RAY(RA) SKETCH TRACE REVCLOUD(RC) BHATCH(BH) GRADIENT WIPEOUT MTEXT(MT)');
  appendHistory('Modify:  MOVE(M) COPY(CO) ROTATE(RO) SCALE(SC) MIRROR(MI) OFFSET(O) ARRAY(AR) ARRAYPOLAR ARRAYRECT ARRAYPATH ERASE(E) EXPLODE(X) XPLODE(XP)');
  appendHistory('         TXTEXP BURST OVERKILL FLATTEN NCOPY CONVERTPOLY TEXTFIT TORIENT REFEDIT(REFE) STRETCH(S) ALIGN(AL)');
  appendHistory('Edit:    TRIM(TR) EXTEND(EX) BREAK(BR) FILLET(F) CHAMFER(CHA) JOIN(J) LENGTHEN(LEN) PEDIT(PE) DDEDIT(ED) DRAWORDER(DR) SPLINEDIT(SPE)');
  appendHistory('Dim:     DIMLINEAR(DLI) DIMALIGNED(DAL) DIMRADIUS(DRA) DIMDIAMETER(DDI) DIMOVERRIDE(DOV) QDIM DIMSPACE DIMBREAK MLEADER(MLD)');
  appendHistory('         MLEADERSTYLE(MLS) MLEADEREDIT(MLE) DIMINSPECT(DINSP) DIMREASSOCIATE');
  appendHistory('Annot:   TEXTALIGN(TA) SCALETEXT HATCHEDIT(HE) QLEADER(QL) FIELD(FI) TABLE(TB) TABLESTYLE(TS) TINSERT(TI)');
  appendHistory('Blocks:  BLOCK(B) INSERT(I) MINSERT WBLOCK(WB) ATTDEF(ATT) ATTEDIT(ATE) ATTEXT ATTDISP BATTMAN SHAPE(SHP)');
  appendHistory('Xref:    XREF(XR) XBIND(XB) XCLIP IMAGEATTACH(IAT) IMAGEADJUST(IAD) IMAGECLIP(ICL) IMAGEFRAME REVCLOUDPROPERTIES(RCP)');
  appendHistory('I/O:     EXPORT(EXP) IMPORT(IMP) PLOT(PP) PASTESPEC ETRANSMIT');
  appendHistory('View:    ZOOM(Z) PAN(P) VIEW(V) REGENALL(REA) VPOINT(VP) PLAN DVIEW DDVPOINT');
  appendHistory('Viewport: MVIEW(MV) VPCLIP MSPACE(MS) PSPACE(PS) CHSPACE LAYOUT(LAY)');
  appendHistory('Layers:  LAYOFF LAYON LAYFRZ LAYTHW LAYLCK LAYULK LAYDEL LAYMRG LAYERSTATE(LAS) LAYWALK LAYERP(LP)');
  appendHistory('Select:  SELECT(SEL) QSELECT(QS) SELECTALL DESELECTALL SELECTPREVIOUS(SELECTP) SELECTSIMILAR(SELSIM) ADDSELECTED FILTER');
  appendHistory('Object:  ISOLATEOBJECTS HIDEOBJECTS UNISOLATEOBJECTS LAYMCUR LAYISO LAYUNISO HYPERLINK(HYP)');
  appendHistory('Inquiry: DIST(DI) AREA(AA) LIST(LI) DIVIDE(DIV) DBLIST MASSPROP ID');
  appendHistory('Coord:   UCS UCSMAN ISOPLANE ELEV THICKNESS');
  appendHistory('Settings: LAYER(LA) LINETYPE(LT) LINEWEIGHT(LW) OSNAP(OS) GRID(G) UNITS(UN) FILL DDPTYPE QTEXT(QT) MATCHPROP(MA) VIEWRES APERTURE');
  appendHistory('         DSETTINGS(DS) DDGRIPS SCALELISTEDIT(SLE) DRAGMODE BLIPMODE HANDLES REINIT');
  appendHistory('Utility: BASE MULTIPLE(MUL) SETVAR STATUS AUDIT PURGE(PU) RENAME(REN) CAL(QC) TIME COPYCLIP PASTECLIP CUTCLIP ABOUT EXIT QSAVE');
  appendHistory('         DWGPROPS MIRRTEXT TEXTTOFRONT(TTF) CLEANSCREEN BPOLY(BP) BOUNDARY(BO) SCRIPT(SCR) SHELL OBJECTSCALE PAGESETUP RECOVER CLOSEALL CONVERT DELAY');
  appendHistory('Region:  REGION(REG) UNION(UNI) SUBTRACT(SU) INTERSECT(IN)');
  appendHistory('Compat:  TOOLBAR MENUBAR CUI CUSTOMIZE SYSWINDOWS PLOTTERMANAGER PLOTSTYLE CONVERTCTB ADCENTER(ADC) TOOLPALETTES(TP) QUICKCALC(QCA)');
  appendHistory('         DATAEXTRACTION(DX) EATTEXT DRAWINGRECOVERY TABLETCONFIG TABLET COMPILE');
  appendHistory('3D/Rend: 3DFACE 3DMESH 3DPOLY 3DSIN SURFREV SURFTAB1 SURFTAB2 EDGESURF RULESURF TABSURF REVSURF HIDE SHADE RENDER LIGHT SCENE RPREF');
  appendHistory('Script:  MENU MENULOAD MENUUNLOAD TBCONFIG APPLOAD ARX VBARUN VBAIDE VBALOAD RESUME GRAPHSCR TEXTSCR MSLIDE VSLIDE');
  appendHistory('Shortcuts: Ctrl+Z=Undo Ctrl+Y=Redo  F3=Osnap F6=Coords F7=Grid F8=Ortho F9=GridSnap');
}

function toggleOsnap() {
  if (store.snapModes.size > 0) {
    store.snapModes.clear();
    promptFn('Osnap OFF');
  } else {
    store.snapModes = new Set(['endpoint', 'midpoint', 'center', 'intersection', 'perpendicular', 'quadrant', 'nearest']);
    promptFn('Osnap ON');
  }
}

function toggleCoordDisplay() {
  const modes: Array<'cartesian' | 'polar' | 'off'> = ['cartesian', 'polar', 'off'];
  const idx = modes.indexOf(store.coordDisplayMode);
  store.coordDisplayMode = modes[(idx + 1) % modes.length];
  promptFn(`Coordinate display: ${store.coordDisplayMode.toUpperCase()}`);
}

function toggleGridSnap() {
  store.snapToGrid = !store.snapToGrid;
  promptFn(`Grid Snap ${store.snapToGrid ? 'ON' : 'OFF'}`);
}

// === DROPDOWN MENUS ===

let activeMenu: HTMLElement | null = null;

function closeAllMenus() {
  document.querySelectorAll('.menu-dropdown').forEach(d => d.classList.remove('open'));
  document.querySelectorAll('#menubar > span').forEach(s => s.classList.remove('menu-open'));
  activeMenu = null;
}

function openMenu(span: HTMLElement) {
  closeAllMenus();
  const dropdown = span.querySelector('.menu-dropdown') as HTMLElement;
  if (!dropdown) return;
  dropdown.classList.add('open');
  span.classList.add('menu-open');
  activeMenu = span;
  // Position dropdown at left edge of the span
  const rect = span.getBoundingClientRect();
  dropdown.style.left = '0px';
}

menubar.addEventListener('mousedown', (e) => {
  // Don't intercept clicks on menu items — let the click handler process those
  if ((e.target as HTMLElement).closest('.menu-item') || (e.target as HTMLElement).closest('.menu-sep')) return;
  const span = (e.target as HTMLElement).closest('#menubar > span') as HTMLElement;
  if (!span) return;
  e.preventDefault();
  e.stopPropagation();
  if (activeMenu === span) {
    closeAllMenus();
  } else {
    openMenu(span);
  }
});

menubar.addEventListener('mouseover', (e) => {
  if (!activeMenu) return;
  const span = (e.target as HTMLElement).closest('#menubar > span') as HTMLElement;
  if (span && span !== activeMenu) {
    openMenu(span);
  }
});

// Handle menu item clicks
menubar.addEventListener('click', (e) => {
  const item = (e.target as HTMLElement).closest('.menu-item') as HTMLElement;
  if (!item || item.classList.contains('disabled')) return;
  e.stopPropagation();
  closeAllMenus();
  const cmdName = item.dataset.cmd;
  const action = item.dataset.action;
  if (cmdName) {
    engine.handleInput(cmdName);
    cmdInput.focus();
  } else if (action) {
    handleMenuAction(action);
    cmdInput.focus();
  }
});

function handleMenuAction(action: string) {
  switch (action) {
    case 'new':
      store.pushUndo('NEW');
      store.entities = [];
      store.emit();
      promptFn('New drawing');
      break;
    case 'open': dxfOpen(); break;
    case 'save': dxfSave(); break;
    case 'exit': promptFn('Close the browser tab to exit.'); break;
    case 'selectall':
      for (const e of store.entities) if (e.visible) e.selected = true;
      store.emit();
      promptFn(`${store.selectedEntities().length} selected`);
      break;
    case 'deselectall':
      store.clearSelection();
      store.emit();
      break;
    case 'zoomall':
      engine.handleInput('ZOOM');
      engine.handleInput('a');
      break;
    case 'help': showHelp(); break;
    case 'f3': toggleOsnap(); break;
    case 'f7': engine.handleInput('GRID'); break;
    case 'f8': engine.handleInput('ORTHO'); break;
    case 'f9': toggleGridSnap(); break;
  }
}

// Close menus when clicking outside
document.addEventListener('mousedown', (e) => {
  if (activeMenu && !(e.target as HTMLElement).closest('#menubar')) {
    closeAllMenus();
  }
  if (contextMenu.classList.contains('open') && !(e.target as HTMLElement).closest('#context-menu')) {
    contextMenu.classList.remove('open');
  }
});

// === CONTEXT MENU (Right-Click) ===

function showContextMenu(x: number, y: number) {
  const items: string[] = [];
  if (engine.isActive) {
    const lastCmd = store.lastCommand || '';
    items.push(`<div class="menu-item" data-ctx="enter">Enter</div>`);
    items.push(`<div class="menu-item" data-ctx="cancel">Cancel</div>`);
  } else {
    const lastCmd = store.lastCommand;
    if (lastCmd) {
      items.push(`<div class="menu-item" data-ctx="repeat">Repeat ${lastCmd}</div>`);
      items.push(`<div class="menu-sep"></div>`);
    }
    const hasSel = store.selectedEntities().length > 0;
    if (hasSel) {
      items.push(`<div class="menu-item" data-ctx="cmd:MOVE">Move</div>`);
      items.push(`<div class="menu-item" data-ctx="cmd:COPY">Copy</div>`);
      items.push(`<div class="menu-item" data-ctx="cmd:ERASE">Erase</div>`);
      items.push(`<div class="menu-item" data-ctx="cmd:ROTATE">Rotate</div>`);
      items.push(`<div class="menu-item" data-ctx="cmd:SCALE">Scale</div>`);
      items.push(`<div class="menu-item" data-ctx="cmd:MIRROR">Mirror</div>`);
      items.push(`<div class="menu-sep"></div>`);
      items.push(`<div class="menu-item" data-ctx="cmd:PROPERTIES">Properties</div>`);
      items.push(`<div class="menu-sep"></div>`);
      items.push(`<div class="menu-item" data-ctx="deselect">Deselect All</div>`);
    } else {
      items.push(`<div class="menu-item" data-ctx="selectall">Select All</div>`);
      items.push(`<div class="menu-sep"></div>`);
      items.push(`<div class="menu-item" data-ctx="zoomall">Zoom All</div>`);
      items.push(`<div class="menu-item" data-ctx="cmd:ZOOM">Zoom Window</div>`);
      items.push(`<div class="menu-item" data-ctx="cmd:PAN">Pan</div>`);
    }
  }
  contextMenu.innerHTML = items.join('');
  contextMenu.style.left = x + 'px';
  contextMenu.style.top = y + 'px';
  contextMenu.classList.add('open');

  // Clamp to viewport
  requestAnimationFrame(() => {
    const rect = contextMenu.getBoundingClientRect();
    if (rect.right > window.innerWidth) contextMenu.style.left = (window.innerWidth - rect.width - 2) + 'px';
    if (rect.bottom > window.innerHeight) contextMenu.style.top = (window.innerHeight - rect.height - 2) + 'px';
  });
}

contextMenu.addEventListener('click', (e) => {
  const item = (e.target as HTMLElement).closest('.menu-item') as HTMLElement;
  if (!item) return;
  contextMenu.classList.remove('open');
  const ctx = item.dataset.ctx;
  if (!ctx) return;
  if (ctx === 'enter') {
    engine.handleInput('');
  } else if (ctx === 'cancel') {
    engine.cancel();
    appendHistory('*Cancel*');
  } else if (ctx === 'repeat') {
    if (store.lastCommand) engine.handleInput(store.lastCommand);
  } else if (ctx.startsWith('cmd:')) {
    engine.handleInput(ctx.slice(4));
  } else if (ctx === 'selectall') {
    for (const ent of store.entities) if (ent.visible) ent.selected = true;
    store.emit();
    promptFn(`${store.selectedEntities().length} selected`);
  } else if (ctx === 'deselect') {
    store.clearSelection();
    store.emit();
  } else if (ctx === 'zoomall') {
    engine.handleInput('ZOOM');
    engine.handleInput('a');
  }
  cmdInput.focus();
});

// === INIT ===

renderer.resize();
store.view = { panX: -200, panY: 200, zoom: 2 };
appendHistory('MiniCAD — AutoCAD R14 style web CAD');
appendHistory('Type a command or press F1 for help.');
requestAnimationFrame(frame);

// Hide system cursor over canvas
canvas.style.cursor = 'none';

// Focus command line on load
cmdInput.focus();
