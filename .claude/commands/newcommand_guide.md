# MiniCAD New Command Implementation Guide

When adding a new command to MiniCAD, follow these rules strictly. Every bug we've fixed traces back to violating one of them.

---

## 0. Current State (163 commands across 14 modules)

| Module | File | Commands | Examples |
|--------|------|----------|----------|
| Draw | `src/commands/draw.ts` | 23 | LINE, CIRCLE, ARC, PLINE, TEXT, DTEXT, BHATCH, GRADIENT, WIPEOUT |
| Modify | `src/commands/modify.ts` | 31 | MOVE, COPY, ROTATE, SCALE, MIRROR, OFFSET, ARRAY, EXPLODE, OVERKILL, ARRAYPOLAR, ARRAYRECT, CONVERTPOLY, TEXTFIT |
| Trim/Extend | `src/commands/trim-extend.ts` | 5 | TRIM, EXTEND, BREAK, FILLET, CHAMFER |
| Dimension | `src/commands/dimension.ts` | 16 | DIMLINEAR, DIMALIGNED, DIMRADIUS, QDIM, DIMSPACE, DIMBREAK |
| Annotation | `src/commands/annotation.ts` | 12 | HATCH, BLOCK, INSERT, LEADER, ATTDEF, TEXTALIGN, SCALETEXT |
| Inquiry | `src/commands/inquiry.ts` | 10 | DIST, AREA, LIST, QSELECT, DBLIST, MASSPROP |
| Settings | `src/commands/settings.ts` | 52 | LAYER, OSNAP, UNDO, REDO, SETVAR, SELECTALL, FILTER, EXIT |
| View | `src/commands/view.ts` | 4 | ZOOM, PAN, VIEW, REGENALL |
| Properties | `src/commands/properties.ts` | 1 | PROPERTIES |
| Options | `src/commands/options.ts` | 1 | OPTIONS |
| Output | `src/commands/output.ts` | 3 | PLOT, EXPORT, IMPORT |
| Boundary | `src/commands/boundary.ts` | 1 | BOUNDARY |
| Region | `src/commands/region.ts` | 4 | REGION, UNION, SUBTRACT, INTERSECT |

**Entity types:** line, circle, arc, polyline, rect, text, ellipse, dimension, point, hatch, blockref, region

**Store properties of note:** `entities`, `layers`, `blockDefs`, `blockAttribs`, `groups`, `clipboard`, `clipboardBase`, `previousSelection`, `hiddenEntityIds`, `isolatedLayers`, `viewRes`, `aperture`, `qtextOn`, `attDispMode`, `fillOn`, `pdmode`, `pdsize`, `sessionStart`, `currentColor`, `currentTextStyle`, `currentDimStyle`, `dimStyles`, `textStyles`, `namedViews`, `drawingLimits`, `limitsOn`

**Ports:** Dev server on port 3010 (`npm run dev`), backend on port 3002.

---

## 1. Command Registration

Register in the appropriate module under `src/commands/`. Each module exports `registerXxxCommands(engine: CommandEngine)`.

```typescript
engine.register('COMMANDNAME', ['ALIAS1', 'ALIAS2'], () => {
  // command body
});
```

**Alias rules:**
- Check ALL existing registrations for alias collisions before adding. The first `register()` call wins — duplicates are silently ignored.
- Run `grep -rn "register(" src/commands/` to audit existing aliases.
- Single-letter aliases are high-collision risk (G, S, E, etc.).
- Known taken single-letter aliases: L(LINE), C(CIRCLE), A(ARC), B(BLOCK), E(ERASE), F(FILLET), G(GRID), H(HATCH), I(INSERT), J(JOIN), M(MOVE), O(OFFSET), P(PAN), R(REDRAW), S(STRETCH), U(UNDO), V(VIEW), W(WBLOCK), X(EXPLODE), Z(ZOOM), D(DIMSTYLE).

**Wiring:** New modules must be added to `src/commands/index.ts` inside `createCommandEngine()`. Existing modules are already wired — just add commands inside the register function.

---

## 2. The inputHandler Contract

This is where most bugs live. Every `inputHandler` function MUST:

### 2a. Handle empty string (Enter key)
```typescript
// WRONG — command gets stuck, only Escape works
engine.inputHandler = (input) => {
  if (input === 'r') { /* ... */ return true; }
  return false; // ← Enter falls through, nothing happens
};

// RIGHT — Enter exits or advances
engine.inputHandler = (input) => {
  if (input === '') { engine.complete(); return true; }
  if (input === 'r') { /* ... */ return true; }
  return false;
};
```

### 2b. Return `true` for invalid input in menu-style prompts
```typescript
// WRONG — falls through to command lookup, may start LINE/CIRCLE/etc.
engine.inputHandler = (input) => {
  if (input === 'c') { /* close */ return true; }
  return false; // ← typing "L" starts LINE command!
};

// RIGHT — show error, stay in the menu
engine.inputHandler = (input) => {
  if (input === '') { engine.complete(); return true; }
  if (input === 'c') { /* close */ return true; }
  engine.prompt('Invalid option. [Close/Open]:');
  return true; // ← swallow invalid input
};
```

### 2c. Clear stale handlers when transitioning phases
```typescript
// WRONG — 'r' handler persists into selection phase
engine.inputHandler = (input) => {
  if (input === 'r') { setRadius(); return true; }
  return false;
};
doSelectObject(engine); // sets waitForClick but inputHandler lingers!

// RIGHT — clear before transition
engine.inputHandler = (input) => {
  if (input === 'r') {
    engine.inputHandler = null; // ← clear self
    setRadius();
    return true;
  }
  return false;
};
```

### 2d. waitForInput → waitForClick transition (critical)

When a `waitForInput` callback calls `waitForClick`, the old inputHandler **stays active** and swallows all subsequent typed input — including coordinates.

```typescript
// WRONG — nameInput handler catches '50,100' as a block name
engine.waitForInput('Block name:', (nameInput) => {
  engine.prompt('Specify point:');
  engine.waitForClick((pt) => { /* ... */ }); // inputHandler still = nameInput!
  return true;
});

// RIGHT — clear inputHandler before switching to waitForClick
engine.waitForInput('Block name:', (nameInput) => {
  engine.inputHandler = null; // ← MUST clear before waitForClick
  engine.prompt('Specify point:');
  engine.waitForClick((pt) => { /* ... */ });
  return true;
});
```

### 2e. Handle NaN from parseFloat
```typescript
// RIGHT — show error
engine.inputHandler = (input) => {
  if (input === '') { engine.complete(); return true; }
  const val = parseFloat(input);
  if (isNaN(val)) { engine.prompt('Requires a number'); return true; }
  doSomething(val);
  return true;
};
```

---

## 3. Click + Input Simultaneous Setup

Many commands need both `waitForClick` and `inputHandler` at the same time (e.g., "click to select, or type 'r' for radius"):

```typescript
engine.prompt('Select object or [Radius]:');
engine.inputHandler = (input) => {
  if (input === '') { engine.complete(); return true; }
  if (input.toLowerCase() === 'r') {
    engine.inputHandler = null;
    handleRadius();
    return true;
  }
  return false; // allow coordinate input to reach clickHandler
};
engine.waitForClick((pt) => {
  // handle click
});
```

---

## 4. Recursive Loop Pattern

For commands that repeat (TRIM, OFFSET, COPY), use a recursive function:

```typescript
function doSelectLoop(engine: CommandEngine, state: SomeState) {
  engine.prompt('Select object or <exit>:');
  engine.inputHandler = (input) => {
    if (input === '') { engine.complete(); return true; }
    return false;
  };
  engine.waitForClick((pt) => {
    // process click...
    doSelectLoop(engine, state); // recurse for next iteration
  });
}
```

---

## 5. Entity Creation

```typescript
store.pushUndo('COMMAND_NAME'); // BEFORE any mutations
const entity = makeEntity({
  type: 'line',
  start: p1,
  end: p2,
} as any);
store.addEntity(entity);
store.emit(); // trigger re-render
```

- `makeEntity()` assigns auto-incrementing ID and inherits current layer
- `store.pushUndo()` snapshots the entity array — call once before batch changes
- `store.emit()` notifies listeners to re-render
- All geometry is in world coordinates (Y-up)

---

## 6. Rubber-Band Preview

```typescript
engine.onMove((p) => {
  engine.renderer.rubberBand = { start: basePoint, end: p };    // line
  engine.renderer.rubberCircle = { center, radius: dist(c, p) }; // circle
  engine.renderer.rubberArc = { center, radius, startAngle, endAngle }; // arc
  engine.renderer.rubberRect = { p1: corner1, p2: p };           // rect (note: p1/p2 keys)
  engine.renderer.rubberPolyline = [...points, p];                // polyline
  engine.renderer.rubberEllipse = { center, majorX, majorY, ratio }; // ellipse
  engine.renderer.selectionBox = { p1, p2 };                      // selection rectangle
  engine.renderer.preview = (ctx) => { /* custom drawing */ };     // custom preview callback
});
```

**Always clean up** when the command completes or cancels:
```typescript
engine.renderer.rubberBand = null;
engine.onCancel(() => { engine.renderer.rubberBand = null; });
```

---

## 7. Command Completion

```typescript
engine.complete(); // normal exit — clears all handlers, sets tool='idle'
engine.cancel();   // abnormal exit — calls cancelHandler first, then clears
```

---

## 8. Selection Pattern

```typescript
engine.requireSelection((sel) => {
  // sel is guaranteed non-empty
  // proceed with command using sel
});
```

`requireSelection` checks for existing selection first; if none, enters a selection loop.

---

## 9. Helper Functions (src/commands/helpers.ts)

Available entity manipulation helpers already imported in most modules:

- `makeEntity(partial)` — create entity with auto ID and current layer
- `moveEntity(e, dx, dy)` — translate entity (handles all 12 types)
- `rotateEntity(e, center, angle)` — rotate entity around point
- `scaleEntity(e, center, factor)` — scale entity from point
- `mirrorEntity(e, p1, p2)` — mirror entity across line
- `offsetEntity(e, distance)` — offset entity
- `rotatePoint(p, center, angle)` — rotate a single point
- `entityEndpoints(e)` — get start/end points of entity
- `entityToPoints(e)` — get all points of entity
- `ptsEqual(p1, p2)` — compare points with tolerance
- `joinToPline(entities)` — join entities into a polyline

Geometry helpers from `src/geometry.ts`:
- `dist(p1, p2)` — distance between points
- `angle(p1, p2)` — angle from p1 to p2
- `polarPoint(base, distance, angle)` — point at polar coordinates
- `midpoint(p1, p2)` — midpoint
- `pointOnEntity(point, entity, tolerance)` — hit test
- `entityBounds(entity)` — bounding box {min, max}
- `isHorizontalDim(p1, p2, textPos)` — dimension direction detection
- `closestPointOnLine`, `lineLineIntersection`, `lineCircleIntersections`, `circleCircleIntersections`

---

## 10. Store Properties for New Commands

When a command needs persistent state, add properties to `src/store.ts` class. Examples:
- `clipboard: Entity[]` / `clipboardBase: Point` — for COPYCLIP/PASTECLIP
- `previousSelection: string[]` — for SELECTPREVIOUS
- `hiddenEntityIds: Set<string>` — for ISOLATEOBJECTS/HIDEOBJECTS
- `isolatedLayers: string[]` — for LAYISO/LAYUNISO

---

## 11. Types Checklist (new entity types only)

When adding a new entity type:
1. Add to discriminated union in `src/types.ts`
2. Add `entityBounds()` case in `src/geometry.ts`
3. Add `pointOnEntity()` case in `src/geometry.ts`
4. Add snap points in `src/snap.ts`
5. Add draw method in `src/renderer.ts`
6. Add transform cases in `src/commands/helpers.ts` (moveEntity, rotateEntity, scaleEntity, mirrorEntity)
7. Add DXF import/export in `backend/main.py`

---

## 12. Spatial Determination: Use Nearest Point, Not Midpoint

When a user click determines a mode based on direction from a line, compare against the **nearest point on the segment**, not the midpoint.

```typescript
// RIGHT — use nearest point on segment via isHorizontalDim() from geometry.ts
import { isHorizontalDim } from '../geometry';
const horizontal = isHorizontalDim(p1, p2, textPos);
```

---

## 13. Common Pitfalls Summary

| Pitfall | What Happens | Fix |
|---------|-------------|-----|
| inputHandler doesn't handle `''` | Command stuck, only Escape works | Always handle empty input |
| inputHandler returns `false` for invalid menu input | Accidentally starts another command | Return `true` with error message |
| Stale inputHandler from prior phase | Old option keys intercept new phase | Set `engine.inputHandler = null` before transition |
| `waitForInput` → `waitForClick` without clearing | Typed coordinates swallowed as text | Set `engine.inputHandler = null` before `waitForClick` |
| parseFloat on non-numeric returns false | Input tried as command name | Return `true` with "Requires a number" |
| Duplicate alias | Second command's alias silently ignored | Grep all registrations first |
| Missing `store.pushUndo()` | Operation can't be undone | Call before any entity mutation |
| Missing `store.emit()` | Canvas doesn't re-render | Call after entity changes |
| Rubber-band not cleared | Ghost preview persists after command | Null out in complete path AND onCancel |
| Midpoint-based direction check | Off-center clicks pick wrong mode | Use `isHorizontalDim()` nearest-point projection |

---

## 14. Update Help Text

After adding commands, update `showHelp()` in `src/main.ts` (around line 542) to include the new command and aliases in the appropriate category line.
