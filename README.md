# MiniCAD

**Free, web-based 2D CAD — AutoCAD R14 for the browser.**

MiniCAD is a faithful recreation of AutoCAD R14's 2D drafting environment that runs entirely in your web browser. No installation, no license fees, no subscription. Just open the page and start drawing.

Built for **small machine shops** — if you run a 2D CNC router or laser cutter and need your customers to send you real, dimensioned drawings instead of napkin sketches, give them MiniCAD. They'll feel right at home if they've ever used AutoCAD, and the learning curve is gentle if they haven't.

## Why MiniCAD?

A single AutoCAD seat costs thousands of dollars a year. Your customers shouldn't need one just to draw a bracket or a panel cutout. MiniCAD gives them the same command-line workflow and precision tools that AutoCAD R14 made legendary — the version many machinists still consider the best for pure 2D work — at zero cost, on any device with a browser.

**Fully DXF compatible.** Customers draw in MiniCAD, export a `.dxf` file, and send it to your shop. You open it in your CAM software, nest the parts, and cut. No file format headaches, no version mismatches.

## AutoCAD R14 Commands

MiniCAD implements the real AutoCAD commands with the same names, aliases, and workflow. If you know AutoCAD, you already know MiniCAD.

### Draw

| Command | Alias | Description |
|---------|-------|-------------|
| `LINE` | `L` | Draw line segments (with Close/Undo) |
| `CIRCLE` | `C` | Circle by center + radius or diameter |
| `ARC` | `A` | Three-point arc |
| `RECTANG` | `REC` | Rectangle by two corners |
| `PLINE` | `PL` | Polyline (with Close/Undo) |
| `TEXT` | `DT` | Single-line text |

### Modify

| Command | Alias | Description |
|---------|-------|-------------|
| `ERASE` | `E` | Delete selected objects |
| `MOVE` | `M` | Move objects by base point + displacement |
| `COPY` | `CO` | Copy objects (multiple copies supported) |
| `ROTATE` | `RO` | Rotate by angle or pick point |
| `SCALE` | `SC` | Scale by factor |
| `MIRROR` | `MI` | Mirror across a line (keep or erase source) |
| `OFFSET` | `O` | Offset lines, circles, arcs by distance |
| `TRIM` | `TR` | Trim to cutting edges |
| `EXTEND` | `EX` | Extend to boundary edges |
| `BREAK` | `BR` | Break an entity at two points |
| `FILLET` | `F` | Fillet or extend lines to intersection |
| `CHAMFER` | `CHA` | Chamfer two lines |

### Dimension

| Command | Alias | Description |
|---------|-------|-------------|
| `DIMLINEAR` | `DLI` | Horizontal/vertical dimension |
| `DIMALIGNED` | `DAL` | Aligned dimension |
| `DIMRADIUS` | `DRA` | Radius dimension |
| `DIMDIAMETER` | `DDI` | Diameter dimension |

### Inquiry & View

| Command | Alias | Description |
|---------|-------|-------------|
| `DIST` | `DI` | Measure distance and angle between two points |
| `LIST` | `LI` | List properties of selected objects |
| `ZOOM` | `Z` | Zoom extents / zoom all |
| `UNDO` | `U` | Undo (Ctrl+Z) |
| `REDO` | | Redo (Ctrl+Y) |

### Coordinate Input

Just like AutoCAD R14, you can type coordinates directly:

- **Absolute:** `100,50` — go to point (100, 50)
- **Relative:** `@30,20` — move 30 right and 20 up from last point
- **Polar:** `@50<45` — move 50 units at 45 degrees from last point

## OSNAP — Precision Without Effort

This is where MiniCAD shines. The **Object Snap** system works exactly like AutoCAD R14 — as you move your cursor near geometry, snap points are detected and highlighted with the classic yellow markers:

| Snap | Marker | What it finds |
|------|--------|---------------|
| **Endpoint** | ▫ Square | End of a line, arc, or polyline segment |
| **Midpoint** | △ Triangle | Middle of a line or arc |
| **Center** | ⊕ Circle+cross | Center of a circle or arc |
| **Intersection** | ✕ X-cross | Where two entities cross |
| **Perpendicular** | ⌐ Right angle | Perpendicular foot from last point |
| **Nearest** | ◇ Diamond | Closest point on any entity |
| **Tangent** | ○— Circle+line | Tangent point on circle or arc |
| **Quadrant** | ◇ Rotated square | 0°, 90°, 180°, 270° on circle or arc |

- **F3** toggles all OSNAP on/off
- **Snap overrides:** type `END`, `MID`, `CEN`, `INT`, `PER`, `NEA`, `TAN`, or `QUA` mid-command for a one-shot snap
- Click **OSNAP** in the status bar to toggle

Combined with **ORTHO** (F8) for horizontal/vertical constraint, you get the same precision drafting experience that made AutoCAD R14 the gold standard.

## Selection — Window and Crossing

Selection works exactly like AutoCAD R14:

- **Click** an entity to select it (Shift+click to add/remove)
- **Drag left-to-right** (green box) — **Window select:** only entities fully inside the box are selected
- **Drag right-to-left** (blue dashed box) — **Crossing select:** any entity that touches the box is selected

## For Shop Owners

### The problem

Your customer calls and says "I need a plate with four holes cut." You ask them to send a drawing. They send you:
- A photo of a hand sketch on graph paper
- A PowerPoint slide with approximate dimensions
- "Can you just figure it out from the part I'm sending?"

### The solution

Send them your MiniCAD link. They open it in their browser — no download, no account — and draw their part using real CAD tools with real dimensions. They export a DXF, email it to you, and you load it directly into your CAM software.

**What your customers get:**
- Real precision — OSNAP means points land exactly where they should
- Real dimensions — DIMLINEAR, DIMRADIUS, etc. so nothing is ambiguous
- Real file format — DXF export that your CAM software reads natively
- Familiar interface — anyone who has touched AutoCAD will be productive in minutes

**What you get:**
- No more guessing dimensions from blurry photos
- No more redrawing customer sketches
- DXF files that go straight to your nesting software
- Happy customers who feel empowered

## Quick Start

```bash
# Install and run
npm install
npm run dev            # Frontend on http://localhost:3010

# DXF import/export requires the backend
cd backend
pip install -r requirements.txt
bash start.sh          # Backend on http://localhost:3002
```

Open `http://localhost:3010` in your browser. Type `L` and press Enter to start drawing a line. That's it.

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| F3 | Toggle OSNAP |
| F8 | Toggle ORTHO |
| Ctrl+Z | Undo |
| Ctrl+Y | Redo |
| Escape | Cancel current command |
| Middle mouse | Pan |
| Scroll wheel | Zoom in/out |
| Right-click | Finish/Enter (during commands) |
| Space or Enter | Execute command / repeat last command |

## License

MIT
