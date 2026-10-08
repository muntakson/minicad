# MiniCAD — Phased Plan to Close the Biggest R14 Gaps

**Date:** 2026-10-07  
**Baseline:** 75 commands implemented, 22 R14 commands missing  
**Goal:** Close the highest-impact gaps for a laser-cutting CAD workflow

---

## Phase 1: Output & View Navigation (highest impact, lowest risk)

These are the most-requested features for any CAD tool — you can draw but can't produce output or navigate efficiently.

### 1.1 PLOT / PRINT command

**Why first:** Without output, drawings are trapped in the browser. Laser cutting requires DXF (already done), PDF, or SVG export.

**Approach — pure frontend SVG/PDF export (no backend needed):**

- **File:** new `src/commands/output.ts`, register in `src/commands/index.ts`
- **Command:** `PLOT` (aliases: `PRINT`, `PP`)
- **Options flow:**
  1. `Enter output format [SVG/PDF/DXF] <SVG>:`
  2. `Enter scale factor <1>:` (1:1, or Fit)
  3. `Include [All/Window/Selection] <All>:`
  4. For Window: pick two corners (reuse ZOOM Window's rubber-rect code)
- **SVG export path:**
  - Walk `store.entities`, call a new `entityToSVG(e: Entity): string` function in `src/geometry.ts` or a new `src/export-svg.ts`
  - Map entity types: line→`<line>`, circle→`<circle>`, arc→`<path>` with arc command, polyline→`<polyline>`/`<polygon>`, rect→`<rect>`, ellipse→`<ellipse>`, text→`<text>`, dimension→group of lines+text
  - Respect layer colors, linetypes (as `stroke-dasharray`), lineweights
  - Y-axis flip: SVG is Y-down, CAD is Y-up → apply `transform="scale(1,-1)"` on root `<g>` and adjust viewBox
  - Trigger download via `Blob` + `URL.createObjectURL` + click (same pattern as existing `dxfSave`)
- **PDF export path:**
  - Use [jsPDF](https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js) loaded from CDN, OR
  - Render to a hidden `<canvas>` using existing `Renderer` class (it already draws everything), then `canvas.toBlob('image/png')` → jsPDF `addImage`, OR
  - For vector PDF: generate SVG first, then use svg2pdf.js (available on cdnjs)
  - **Recommended:** Canvas-based PDF for Phase 1 (simplest, leverages existing renderer), vector SVG export as the primary laser-cutting output
- **DXF:** Already exists via backend — just call `dxfSave()`
- **Store changes:** none
- **Estimated size:** ~200 lines for SVG, ~80 lines for canvas-PDF wrapper, ~60 lines for command flow

### 1.2 ZOOM Previous / Scale / Center

**Why:** ZOOM currently only has All/Extents/Window. Missing Previous is a constant friction point.

**Approach:**

- **File:** modify `src/commands/view.ts` + `src/store.ts`
- **Store changes:**
  - Add `viewStack: ViewState[]` (max 20 entries) to `Store`
  - Push current view before every zoom change: `pushView()` method
  - `popView()` returns the last pushed view
- **New sub-commands in ZOOM:**
  - `P` / `Previous` — pop `viewStack`, restore view. If empty, prompt "No previous view"
  - `S` / `Scale` — prompt for scale factor (e.g., `2x` = zoom in 2x, `0.5x` = zoom out). Multiply `store.view.zoom` by factor, keep center
  - `C` / `Center` — pick a point, prompt for magnification. Set `panX`/`panY` so that point is centered
- **Update prompt:** `ZOOM [All/Extents/Window/Previous/Scale/Center] <Extents>:`
- **Estimated size:** ~60 lines

### 1.3 PAN — real interactive mode

**Why:** Currently a stub that prints "use middle mouse." A proper PAN command is essential.

**Approach:**

- **File:** modify `src/commands/view.ts` + `src/main.ts`
- Register `PAN` to enter a mode where left-click-drag pans (not just middle mouse)
- Set `store.tool = 'pan'`, then in `main.ts` mousemove handler: if `store.tool === 'pan'` and mouse is down, update `store.view.panX/panY`
- Press Enter or Esc to exit pan mode
- Also push view to `viewStack` before panning starts (so ZOOM Previous works)
- **Estimated size:** ~40 lines

### 1.4 COLOR command

**Why:** No way to set the current drawing color without editing entity properties after creation.

**Approach:**

- **File:** add to `src/commands/settings.ts`, add `currentColor: string` to `Store`
- **Command:** `COLOR` (alias: `COL`)
- Prompt: `Enter new color [ByLayer/1-7/hex] <ByLayer>:`
- Store the choice in `store.currentColor`
- Modify `makeEntity()` in `helpers.ts`: set `color: store.currentColor` instead of hardcoded `'bylayer'`
- **Estimated size:** ~25 lines

**Phase 1 total:** ~465 lines, 4 commands/enhancements  
**Phase 1 deliverable:** Drawings can be exported as SVG (vector, for laser cutting) or PDF. View navigation is fully functional.

---

## Phase 2: Boundary Detection & Region Operations

These enable the "closed profile" workflow central to laser cutting — detect outlines, compute areas, prepare geometry for cutting paths.

### 2.1 BOUNDARY command

**Why:** HATCH currently requires pre-selecting a closed boundary. Real CAD users click inside a region and expect the boundary to be detected automatically.

**Approach — ray-casting boundary walk:**

- **File:** new `src/commands/boundary.ts`, new function `detectBoundary()` in `src/geometry.ts`
- **Command:** `BOUNDARY` (alias: `BO`)
- **Algorithm:**
  1. User picks an internal point
  2. Cast a ray from pick point in +X direction
  3. Find all intersections with all visible entities (reuse `findIntersections` infrastructure)
  4. From the nearest intersection, walk the entity boundary:
     - At each intersection with another entity, turn to follow the entity that keeps the pick point on the left (smallest CCW angle)
     - Continue until returning to the start point
  5. Collect the boundary points → create a closed polyline, or just return the boundary for HATCH use
- **Simplification for Phase 2:** Support boundaries formed by lines, arcs, circles, polylines, and rects. Skip ellipses and splines (complex parametric intersection).
- **Integration with HATCH:** Add an "Internal point" option to HATCH: `Select objects or [Internal point]:` → call `detectBoundary()`, use result as hatch boundary
- **Store changes:** none
- **Estimated size:** ~250 lines (boundary walk algorithm is the core complexity)

### 2.2 REGION command

**Why:** Boolean operations (union, subtract, intersect) on closed profiles. Essential for complex laser-cut parts with cutouts.

**Approach:**

- **File:** new `src/commands/region.ts`, region boolean functions in `src/geometry.ts`
- **Command:** `REGION` (alias: `REG`) — converts closed polylines/rects/circles to region entities
- **New entity type:** Add `RegionEntity` to `types.ts`:
  ```
  interface RegionEntity extends BaseEntity {
    type: 'region';
    outerBoundary: Point[];
    holes: Point[][];
  }
  ```
- **Boolean commands (stretch goal):**
  - `UNION` — merge two overlapping regions
  - `SUBTRACT` — cut one region from another
  - `INTERSECT` — keep only the overlapping area
- **Algorithm:** Weiler-Atherton polygon clipping for boolean ops on point arrays. For Phase 2, support polygon-polygon operations only (no arc-aware clipping yet).
- **Rendering:** Draw outer boundary as closed polyline, holes as inner closed polylines (renderer already handles polylines)
- **Estimated size:** ~400 lines (Weiler-Atherton is substantial)

**Phase 2 total:** ~650 lines, 2-4 commands  
**Phase 2 deliverable:** Click inside a closed area to detect its boundary. Create regions from closed shapes. Basic boolean operations for complex profiles.

---

## Phase 3: Annotation & Text System

Proper annotation is needed for dimensioned laser-cutting drawings shared with fabricators.

### 3.1 STYLE command (text styles)

**Why:** Currently all text uses the same font/height. Real drawings need title blocks, notes, and dimension text at different sizes with different fonts.

**Approach:**

- **File:** add to `src/commands/settings.ts`, add text style infrastructure to `store.ts` and `types.ts`
- **New types:**
  ```
  interface TextStyle {
    name: string;
    fontFamily: string;    // CSS font-family
    height: number;        // default height
    widthFactor: number;   // 1.0 = normal
    oblique: number;       // degrees
  }
  ```
- **Store additions:**
  - `textStyles: TextStyle[]` — starts with `[{ name: 'Standard', fontFamily: 'monospace', height: 2.5, widthFactor: 1, oblique: 0 }]`
  - `currentTextStyle: string` — name of active style
- **Command:** `STYLE` (alias: `ST`)
  - Options: `[New/Set/List/Delete]`
  - New: prompt for name, font, height, width factor, oblique angle
  - Set: switch current style
- **Integration:** Modify TEXT and MTEXT commands to inherit `store.currentTextStyle` defaults
- **Renderer:** Apply `fontFamily`, `widthFactor` (via `ctx.scale`), and oblique (via `ctx.transform` skew) when drawing text
- **Estimated size:** ~120 lines

### 3.2 TOLERANCE command (GD&T)

**Why:** Geometric tolerances are used on fabrication drawings to specify manufacturing precision.

**Approach:**

- **File:** add to `src/commands/annotation.ts`
- **Command:** `TOLERANCE` (alias: `TOL`)
- Prompt for: geometric characteristic symbol (⌖ position, ⏀ concentricity, ⊥ perpendicularity, etc.), tolerance value, datum reference
- Create as a group of lines + text entities arranged in the standard GD&T frame format
- **Estimated size:** ~150 lines

### 3.3 Expand HATCH patterns

**Why:** Only 3 of 60+ R14 patterns are available.

**Approach:**

- Add the most common patterns used in mechanical/laser-cutting drawings:
  - `ANSI31` (existing), `ANSI32`–`ANSI38` (steel, brass, rubber, etc.)
  - `CROSS`, `EARTH`, `GRASS`, `HONEY`, `SQUARE`
- Each pattern is defined as a set of line angles/spacings in the renderer
- **File:** expand pattern definitions in `src/renderer.ts`
- **Estimated size:** ~100 lines of pattern data

**Phase 3 total:** ~370 lines, 2-3 commands  
**Phase 3 deliverable:** Text styles for professional drawings. GD&T symbols. More hatch patterns.

---

## Phase 4: File & Resource Management

Housekeeping commands that become important as drawings grow complex.

### 4.1 PURGE command

- **File:** add to `src/commands/settings.ts`
- **Command:** `PURGE` (alias: `PU`)
- Scan for: unused layers (no entities reference them), unused block definitions (no INSERT references them), unused groups (entity IDs no longer exist)
- Prompt: `Purge unused [Layers/Blocks/Groups/All] <All>:`
- Remove with confirmation per item or bulk confirm
- **Estimated size:** ~80 lines

### 4.2 WBLOCK command

- **File:** add to `src/commands/annotation.ts` (near BLOCK/INSERT)
- **Command:** `WBLOCK` (alias: `W`)
- Export a block definition to a standalone JSON file (MiniCAD native format) or use the DXF backend
- Prompt for block name → serialize `store.blockDefs.get(name)` → download as `.json` or `.dxf`
- **Estimated size:** ~50 lines

### 4.3 SAVEAS command

- **File:** add to `src/commands/settings.ts`
- **Command:** `SAVEAS`
- Prompt for filename and format (`DXF`, `SVG`, `JSON`)
- DXF → existing backend, SVG → reuse Phase 1 SVG export, JSON → serialize entire store state
- **Estimated size:** ~40 lines

### 4.4 VIEW command (named views)

- **File:** add to `src/commands/view.ts`, add `namedViews: Map<string, ViewState>` to `Store`
- **Command:** `VIEW` (alias: `V`)
- Options: `[Save/Restore/Delete/List]`
- Save: stores current `view` state under a name
- Restore: restores named view (also pushes to viewStack for ZOOM Previous)
- **Estimated size:** ~60 lines

### 4.5 RENAME command

- **File:** add to `src/commands/settings.ts`
- **Command:** `RENAME` (alias: `REN`)
- Options: `[Block/Layer/Group/View/Dimstyle]`
- Rename the named object, update all references (entities on that layer, block refs, group IDs)
- **Estimated size:** ~70 lines

**Phase 4 total:** ~300 lines, 5 commands  
**Phase 4 deliverable:** Clean up drawings, export blocks, save named views.

---

## Phase 5: Polish & Parity

Lower-priority commands that round out R14 coverage.

### 5.1 REGEN / REDRAW

- Force re-render by calling `renderer.render()` + `store.emit()`
- Trivial: ~10 lines

### 5.2 LIMITS command

- Set drawing boundary (minX, minY, maxX, maxY) in store
- Optionally restrict cursor to limits, or just use for ZOOM All
- ~30 lines

### 5.3 SETVAR command

- Expose store properties as named system variables
- Map variable names to store fields: `DIMTXT → currentDimStyle.textHeight`, `GRIDSIZE → gridSpacing`, etc.
- ~60 lines

### 5.4 STATUS / TIME

- Report entity count, layer count, extents, memory usage, session time
- ~40 lines

### 5.5 AUDIT command

- Check for: entities on deleted layers, orphaned block refs, duplicate IDs, degenerate geometry (zero-length lines, zero-radius circles)
- Auto-fix option
- ~80 lines

### 5.6 Enhance partial commands

- **RECTANG:** Add Chamfer/Fillet corner options
- **PLINE:** Add Width/Halfwidth options, proper arc bulge calculation
- **EXPLODE:** Add block and dimension explode
- **PEDIT:** Add Fit, Spline, Edit vertex
- **STRETCH:** Proper crossing-window grip detection
- **ZOOM:** Add Realtime (mouse-drag zoom) and Dynamic modes
- ~300 lines total across multiple files

**Phase 5 total:** ~520 lines  
**Phase 5 deliverable:** Full R14 2D command parity (minus 3D, which is out of scope).

---

## Summary

| Phase | Focus | Commands | Lines | Priority |
|-------|-------|----------|-------|----------|
| **1** | Output & Navigation | PLOT, ZOOM+, PAN+, COLOR | ~465 | **Critical** |
| **2** | Boundary & Regions | BOUNDARY, REGION, (UNION/SUBTRACT/INTERSECT) | ~650 | **High** |
| **3** | Annotation & Text | STYLE, TOLERANCE, HATCH+ | ~370 | **Medium** |
| **4** | File & Resources | PURGE, WBLOCK, SAVEAS, VIEW, RENAME | ~300 | **Medium** |
| **5** | Polish & Parity | REGEN, LIMITS, SETVAR, STATUS, AUDIT, partial-cmd enhancements | ~520 | **Low** |
| | **Total** | **~22 new commands + 8 enhanced** | **~2,305** | |

### Key architectural decisions

1. **SVG export is pure frontend** — no backend dependency, vector output ideal for laser cutting
2. **Boundary detection uses ray-casting + boundary walk** — standard computational geometry approach, builds on existing intersection infrastructure
3. **Region booleans use Weiler-Atherton** — polygon-only in Phase 2, arc-aware clipping deferred to Phase 5
4. **View stack is a simple array** — no complex state management, just push/pop ViewState objects
5. **All new commands follow existing patterns** — `engine.register()`, `engine.waitForClick()`, `engine.waitForInput()`, `store.pushUndo()`
