# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

MiniCAD is a browser-based 2D CAD application styled after AutoCAD R14, built for laser cutting workflows. It uses an HTML5 Canvas renderer with an AutoCAD-style command line interface and supports DXF file import/export through a Python backend.

## Commands

```bash
# Frontend (Vite + TypeScript)
npm run dev          # Start dev server on port 3010
npm run build        # Production build to dist/
npm run preview      # Preview production build
npx tsc --noEmit     # Type-check without emitting

# Backend (FastAPI + ezdxf)
cd backend && bash start.sh   # Starts uvicorn on port 3002 with --reload
pip install -r backend/requirements.txt  # Backend dependencies

# Tests (Playwright, standalone — no test framework)
node test_tier15_commands.mjs  # Run a single tier (dev server must be running)
for f in test_commands.mjs test_menus.mjs test_tier*.mjs; do echo "=== $f ==="; node "$f" 2>&1 | tail -5; done  # Run all
```

No test framework or linter is configured. Tests are standalone Node.js scripts using Playwright.

## Architecture

The frontend is a single-page canvas app with no framework — all rendering is manual Canvas 2D.

### Coordinate system
World coordinates are Y-up (CAD standard). The `store.worldToScreen` / `screenToWorld` methods flip Y for canvas rendering. All entity geometry is stored in world coordinates.

### Key modules

- **`src/types.ts`** — Entity discriminated union (`line | circle | arc | polyline | rect | text | ellipse | dimension | point | hatch | blockref | region`), snap modes, layer/view types. Every entity extends `BaseEntity` with `id`, `layer`, `color`, `selected`, `visible`.

- **`src/store.ts`** — Global singleton `store`. Holds entity array, layers, view state (pan/zoom), undo/redo stacks (100-entry cap, JSON deep-copy), snap modes, ortho/grid state, block definitions, clipboard, groups. Emits change notifications via a simple listener pattern. Exposed as `window.__store` in browser.

- **`src/commands/`** — 287 registered commands across 18 modules with 175 aliases. `CommandEngine` (in `engine.ts`) implements the AutoCAD command-line interaction model. Commands are registered with names and aliases (e.g., `LINE`/`L`, `CIRCLE`/`C`). Multi-step commands use `waitForClick` / `waitForInput` / `onMove` callbacks. Coordinate input parsing supports absolute (`x,y`), relative (`@x,y`), and polar (`@dist<angle`). Engine exposed as `window.__engine` in browser.

  | Module | File | Count | Examples |
  |--------|------|-------|----------|
  | Settings | `settings.ts` | 78 | LAYER, OSNAP, UNDO, REDO, SELECTALL, FILTER, EXIT, LAYOFF, LAYERSTATE, MIRRTEXT, DSETTINGS, LAYOUT, RECOVER, CLOSEALL, VPOINT |
  | Modify | `modify.ts` | 35 | MOVE, COPY, ROTATE, SCALE, MIRROR, OFFSET, ARRAY, OVERKILL, XPLODE, ARRAYPATH, TORIENT, REFEDIT |
  | Legacy | `legacy.ts` | 31 | 3DFACE, 3DMESH, SURFREV, HIDE, SHADE, RENDER, MENU, APPLOAD, VBARUN |
  | Compat | `compat.ts` | 30 | TOOLBAR, MENUBAR, CUI, HYPERLINK, SCALELISTEDIT, ISOPLANE, ELEV, THICKNESS, DELAY |
  | Draw | `draw.ts` | 24 | LINE, CIRCLE, ARC, PLINE, TEXT, BHATCH, GRADIENT, WIPEOUT, HELIX |
  | Dimension | `dimension.ts` | 21 | DIMLINEAR, DIMALIGNED, DIMRADIUS, QDIM, DIMSPACE, MLEADER, MLEADERSTYLE, MLEADEREDIT, DIMINSPECT |
  | Annotation | `annotation.ts` | 15 | HATCH, BLOCK, INSERT, LEADER, ATTDEF, TEXTALIGN, HATCHEDIT, QLEADER, FIELD |
  | Xref | `xref.ts` | 12 | XREF, XBIND, XCLIP, IMAGEATTACH, TABLE, TABLESTYLE, BATTMAN |
  | Viewport | `viewport.ts` | 11 | PLAN, DVIEW, MVIEW, MSPACE, PSPACE, CHSPACE, UCS, UCSMAN, SHAPE |
  | Inquiry | `inquiry.ts` | 10 | DIST, AREA, LIST, QSELECT, DBLIST, MASSPROP |
  | Trim/Extend | `trim-extend.ts` | 5 | TRIM, EXTEND, BREAK, FILLET, CHAMFER |
  | View | `view.ts` | 4 | ZOOM, PAN, VIEW, REGENALL |
  | Region | `region.ts` | 4 | REGION, UNION, SUBTRACT, INTERSECT |
  | Output | `output.ts` | 3 | PLOT, EXPORT, IMPORT |
  | Boundary | `boundary.ts` | 2 | BOUNDARY, BPOLY |
  | Options | `options.ts` | 1 | OPTIONS |
  | Properties | `properties.ts` | 1 | PROPERTIES |

- **`src/commands/helpers.ts`** — Entity manipulation: `makeEntity`, `moveEntity`, `rotateEntity`, `scaleEntity`, `mirrorEntity`, `offsetEntity`, `entityEndpoints`, `joinToPline`.

- **`src/renderer.ts`** — Canvas rendering: entities, dot grid, full-screen crosshair cursor, snap markers (yellow, R14 style), rubber-band previews, selection box (green=window, blue=crossing).

- **`src/snap.ts`** — Object snap engine. Tests each entity for snap points (endpoint, midpoint, center, perpendicular, nearest, quadrant) and pairwise intersection snaps. 15px screen-space tolerance.

- **`src/geometry.ts`** — Pure math utilities: distance, intersection (line-line, line-circle, circle-circle), closest-point-on-line/circle, entity bounds, point-on-entity hit testing.

- **`src/main.ts`** — Wires canvas events (mouse, wheel, keyboard), command input, status bar toggles, and DXF file I/O via `fetch` to the backend. Selection: left-to-right drag = window select (fully inside), right-to-left = crossing select (overlaps). Contains `showHelp()` which must be updated when adding commands.

### Backend

`backend/main.py` is a FastAPI server providing two endpoints:
- `POST /api/dxf/import` — Accepts a DXF file upload, converts entities to frontend JSON using ezdxf
- `POST /api/dxf/export` — Accepts entity JSON, writes a DXF file and returns it as a download

The frontend connects to port 3002 in development (`API_BASE` in `main.ts`).

### Entity lifecycle
Entities are created via `makeEntity()` in `src/commands/helpers.ts`, which assigns an auto-incrementing ID, inherits the current layer, and sets defaults. Undo snapshots the entire entity array via `store.pushUndo()` before mutations.

### Adding new commands
New commands go in the appropriate module under `src/commands/`. Each module exports `registerXxxCommands(engine: CommandEngine)`, already wired in `src/commands/index.ts`. Check alias collisions against all 175+ existing aliases before adding — single-letter aliases are high collision risk. See `.claude/commands/newcommand_guide.md` for the full implementation guide with pitfalls.
