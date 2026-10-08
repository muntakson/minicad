# MiniCAD — Implemented Commands Report

**Generated:** 2026-10-07 23:50:53  
**Total Commands:** 117  
**Total Aliases:** 113  

---

## Summary by Category

| Category        | Count | Source File            |
|-----------------|------:|------------------------|
| Drawing         |    18 | `src/commands/draw.ts` |
| Modify          |    18 | `src/commands/modify.ts` |
| Settings/Utility|    34 | `src/commands/settings.ts` |
| Dimensions      |    12 | `src/commands/dimension.ts` |
| Annotation/Blocks|   10 | `src/commands/annotation.ts` |
| Inquiry         |     7 | `src/commands/inquiry.ts` |
| Trim/Extend     |     5 | `src/commands/trim-extend.ts` |
| Region/Boolean  |     4 | `src/commands/region.ts` |
| View            |     3 | `src/commands/view.ts` |
| Output/I/O      |     3 | `src/commands/output.ts` |
| Properties      |     1 | `src/commands/properties.ts` |
| Boundary        |     1 | `src/commands/boundary.ts` |
| Options         |     1 | `src/commands/options.ts` |

---

## Complete Command List

### Drawing (18 commands) — `src/commands/draw.ts`

| # | Command   | Alias(es)       | Description |
|--:|-----------|-----------------|-------------|
| 1 | LINE      | L               | Draw line segments between points |
| 2 | CIRCLE    | C               | Draw circle by center and radius |
| 3 | ARC       | A               | Draw arc (3-point, center-start-end, etc.) |
| 4 | PLINE     | PL              | Draw polyline with line/arc segments |
| 5 | RECTANG   | REC             | Draw rectangle by two corners |
| 6 | POLYGON   | POL             | Draw regular polygon (inscribed/circumscribed) |
| 7 | ELLIPSE   | EL              | Draw ellipse by axis endpoints and ratio |
| 8 | SPLINE    | SPL             | Draw spline curve through fit points |
| 9 | POINT     | PO              | Place point entity (uses PDMODE/PDSIZE) |
| 10 | TEXT     | DT              | Single-line text |
| 11 | MTEXT    | MT              | Multi-line text |
| 12 | DONUT    | DO              | Draw filled donut/ring |
| 13 | XLINE    | XL              | Construction line (infinite both directions) |
| 14 | RAY      | RA              | Construction ray (infinite one direction) |
| 15 | MLINE    | ML              | Multi-line (parallel offset polylines) |
| 16 | SOLID    | SO              | 2D filled solid (triangle/quad) |
| 17 | SKETCH   | —               | Freehand polyline with record increment |
| 18 | TRACE    | —               | Wide solid line segments |

### Modify (18 commands) — `src/commands/modify.ts`

| # | Command   | Alias(es)       | Description |
|--:|-----------|-----------------|-------------|
| 1 | MOVE      | M               | Move selected entities |
| 2 | COPY      | CO, CP          | Copy selected entities |
| 3 | ROTATE    | RO              | Rotate selected entities |
| 4 | SCALE     | SC              | Scale selected entities |
| 5 | MIRROR    | MI              | Mirror selected entities |
| 6 | OFFSET    | O               | Offset entity by distance |
| 7 | ARRAY     | AR              | Rectangular/polar array |
| 8 | ERASE     | E, DEL          | Delete selected entities |
| 9 | EXPLODE   | X               | Explode compound entities |
| 10 | JOIN     | J               | Join collinear/connected entities |
| 11 | LENGTHEN | LEN             | Change entity length |
| 12 | STRETCH  | S               | Stretch entities by displacement |
| 13 | PEDIT    | PE              | Polyline edit (join, open, close, reverse) |
| 14 | DDEDIT   | ED, TEXTEDIT    | Edit text content in place |
| 15 | DRAWORDER| DR              | Change entity draw order (front/back) |
| 16 | CHANGE   | -CH             | Change entity properties (point/layer/color/etc.) |
| 17 | CHPROP   | CH              | Change properties of selected entities |
| 18 | ALIGN    | AL              | Align entities using source/destination point pairs |

### Settings & Utility (34 commands) — `src/commands/settings.ts`

| # | Command   | Alias(es)       | Description |
|--:|-----------|-----------------|-------------|
| 1 | LAYER     | LA              | Layer management (new, set, on/off, lock, color) |
| 2 | LINETYPE  | LT              | Set/manage linetypes |
| 3 | LINEWEIGHT| LW, LWEIGHT     | Set entity lineweight |
| 4 | OSNAP     | OS              | Object snap mode settings |
| 5 | ORTHO     | F8, OR          | Toggle orthogonal mode |
| 6 | GRID      | G               | Toggle/configure grid display |
| 7 | SNAP      | SN              | Toggle snap-to-grid |
| 8 | LTSCALE   | LTS             | Set linetype scale |
| 9 | COLOR     | COL             | Set current drawing color |
| 10 | STYLE    | ST              | Text style management |
| 11 | GROUP    | GR              | Entity grouping |
| 12 | MATCHPROP| MA              | Match properties between entities |
| 13 | RENAME   | REN             | Rename layers, styles, etc. |
| 14 | PURGE    | PU              | Purge unused layers/blocks |
| 15 | NEW      | —               | New drawing (clear all) |
| 16 | OOPS     | —               | Restore last erased entities |
| 17 | UNDO     | U, CTRL+Z       | Undo last operation |
| 18 | REDO     | CTRL+Y          | Redo undone operation |
| 19 | REGEN    | RE              | Regenerate display |
| 20 | REDRAW   | R               | Redraw display |
| 21 | LIMITS   | —               | Set drawing limits |
| 22 | SETVAR   | —               | Get/set system variables |
| 23 | STATUS   | —               | Show drawing statistics |
| 24 | AUDIT    | —               | Check drawing integrity |
| 25 | SAVE     | SA              | Save drawing as DXF |
| 26 | SAVEAS   | —               | Save drawing as new DXF |
| 27 | OPEN     | DN              | Open DXF file |
| 28 | UNITS    | UN              | Set unit type and precision |
| 29 | FILL     | —               | Toggle solid fill display |
| 30 | BASE     | —               | Set drawing base/insertion point |
| 31 | MULTIPLE | MUL             | Auto-repeat a command |
| 32 | DDPTYPE  | PTYPE           | Set point display mode and size |
| 33 | QTEXT    | QT              | Quick text mode (rectangles vs. glyphs) |
| 34 | ATTDISP  | —               | Attribute display control (Normal/ON/OFF) |

### Dimensions (12 commands) — `src/commands/dimension.ts`

| # | Command      | Alias(es) | Description |
|--:|--------------|-----------|-------------|
| 1 | DIMLINEAR    | DLI       | Linear (horizontal/vertical) dimension |
| 2 | DIMALIGNED   | DAL       | Aligned dimension along entity |
| 3 | DIMRADIUS    | DRA       | Radius dimension |
| 4 | DIMDIAMETER  | DDI       | Diameter dimension |
| 5 | DIMANGULAR   | DAN       | Angular dimension |
| 6 | DIMBASELINE  | DBL       | Baseline dimension chain |
| 7 | DIMCONTINUE  | DCO       | Continue dimension chain |
| 8 | DIMCENTER    | DCE       | Center mark for circles/arcs |
| 9 | DIMORDINATE  | DOR       | Ordinate dimension (X/Y datum) |
| 10 | DIMSTYLE    | D         | Dimension style management |
| 11 | DIMEDIT     | DED       | Edit dimension text/geometry |
| 12 | DIMTEDIT    | DIMTED    | Move/rotate dimension text |

### Annotation & Blocks (10 commands) — `src/commands/annotation.ts`

| # | Command   | Alias(es)   | Description |
|--:|-----------|-------------|-------------|
| 1 | HATCH     | H           | Hatch pattern fill |
| 2 | BLOCK     | B           | Define block from selection |
| 3 | INSERT    | I           | Insert block reference |
| 4 | MINSERT   | MI_INSERT   | Multiple insert (block array) |
| 5 | WBLOCK    | W           | Write block to separate file |
| 6 | LEADER    | LE          | Leader line with annotation |
| 7 | TOLERANCE | TOL         | GD&T tolerance frame |
| 8 | ATTDEF    | ATT         | Define block attribute |
| 9 | ATTEDIT   | ATE         | Edit block attribute values |
| 10 | ATTEXT   | DDATTEXT    | Extract attributes to CSV/text (BOM) |

### Inquiry (7 commands) — `src/commands/inquiry.ts`

| # | Command   | Alias(es) | Description |
|--:|-----------|-----------|-------------|
| 1 | DIST      | DI        | Measure distance between points |
| 2 | AREA      | AA        | Calculate area/perimeter |
| 3 | LIST      | LI, LS    | List entity properties |
| 4 | ID        | —         | Display point coordinates |
| 5 | DIVIDE    | DIV       | Divide entity into equal parts |
| 6 | MEASURE   | ME        | Place points at measured intervals |
| 7 | SELECT    | SEL       | Selection set management |

### Trim & Extend (5 commands) — `src/commands/trim-extend.ts`

| # | Command   | Alias(es) | Description |
|--:|-----------|-----------|-------------|
| 1 | TRIM      | TR        | Trim entity at cutting edge |
| 2 | EXTEND    | EX        | Extend entity to boundary |
| 3 | BREAK     | BR        | Break entity at point(s) |
| 4 | FILLET    | F         | Fillet (round) corner |
| 5 | CHAMFER   | CHA       | Chamfer (bevel) corner |

### Region & Boolean (4 commands) — `src/commands/region.ts`

| # | Command   | Alias(es) | Description |
|--:|-----------|-----------|-------------|
| 1 | REGION    | REG       | Create region from closed entities |
| 2 | UNION     | UNI       | Boolean union of regions |
| 3 | SUBTRACT  | SU        | Boolean subtraction of regions |
| 4 | INTERSECT | IN        | Boolean intersection of regions |

### View (3 commands) — `src/commands/view.ts`

| # | Command | Alias(es) | Description |
|--:|---------|-----------|-------------|
| 1 | ZOOM    | Z         | Zoom in/out/extents/window/previous |
| 2 | PAN     | P         | Pan view |
| 3 | VIEW    | V         | Named view save/restore |

### Output / I/O (3 commands) — `src/commands/output.ts`

| # | Command | Alias(es)   | Description |
|--:|---------|-------------|-------------|
| 1 | EXPORT  | EXP         | Export drawing to DXF |
| 2 | IMPORT  | IMP         | Import DXF file |
| 3 | PLOT    | PRINT, PP   | Plot/print drawing |

### Properties (1 command) — `src/commands/properties.ts`

| # | Command    | Alias(es) | Description |
|--:|------------|-----------|-------------|
| 1 | PROPERTIES | MO, PR    | Entity properties panel |

### Boundary (1 command) — `src/commands/boundary.ts`

| # | Command  | Alias(es) | Description |
|--:|----------|-----------|-------------|
| 1 | BOUNDARY | BO        | Create boundary polyline from enclosed area |

### Options (1 command) — `src/commands/options.ts`

| # | Command | Alias(es) | Description |
|--:|---------|-----------|-------------|
| 1 | OPTIONS | OP        | Application options/preferences |

---

## System Variables (SETVAR)

| Variable    | Default   | Description |
|-------------|-----------|-------------|
| DIMTXT      | 2.5       | Dimension text height |
| DIMASZ      | 2         | Dimension arrow size |
| DIMEXO      | 1.5       | Dimension extension line offset |
| DIMDEC      | 2         | Dimension decimal precision |
| GRIDSIZE    | 10        | Grid spacing |
| LTSCALE     | 1         | Linetype scale |
| ORTHOMODE   | 0         | Orthogonal mode (0=off, 1=on) |
| GRIDMODE    | 1         | Grid display (0=off, 1=on) |
| SNAPMODE    | 0         | Snap to grid (0=off, 1=on) |
| FILLMODE    | 1         | Solid fill display (0=off, 1=on) |
| PDMODE      | 3         | Point display mode |
| PDSIZE      | 5         | Point display size |
| QTEXTMODE   | 0         | Quick text mode (0=off, 1=on) |
| ATTDISP     | normal    | Attribute display (normal/on/off) |
| LUPREC      | 4         | Linear unit precision |
| LIMMIN      | 0,0       | Drawing limits lower-left (read-only) |
| LIMMAX      | 420,297   | Drawing limits upper-right (read-only) |

---

## Entity Types Supported

| Type      | Description |
|-----------|-------------|
| line      | Line segment (start → end) |
| circle    | Circle (center + radius) |
| arc       | Circular arc (center, radius, angles) |
| polyline  | Multi-segment line/arc path |
| rect      | Rectangle (two corners) |
| text      | Single/multi-line text |
| ellipse   | Ellipse (major axis + ratio) |
| point     | Point marker (PDMODE/PDSIZE) |
| dimension | Linear, aligned, angular, radial dimensions |
| hatch     | Hatch pattern / solid fill |
| blockref  | Block reference (insert with attributes) |
| region    | Closed boundary region (boolean ops) |
| spline    | Spline curve through fit points |

---

## Test Coverage

| Test File                    | Tests | Status |
|------------------------------|------:|--------|
| test_commands.mjs            |    —  | Legacy |
| test_menus.mjs               |    —  | Legacy |
| test_new_commands.mjs        |    —  | Legacy |
| test_tier2.mjs               |    —  | Legacy |
| test_tier3.mjs               |    —  | Legacy |
| test_tier4.mjs               |    —  | Legacy |
| test_tier5_commands.mjs      |   54  | ✅ Pass |
| test_tier6_commands.mjs      |   43  | ✅ Pass |
| test_tier7_commands.mjs      |   35  | ✅ Pass |
| test_tier8_commands.mjs      |   38  | ✅ Pass |
| test_tier9_commands.mjs      |   49  | ✅ Pass |

**Tier 5–9 Total: 219 tests passing**

---

## Implementation Timeline

| Round | Commands Added              | Tier  | Total |
|-------|-----------------------------|-------|------:|
| 1–4   | Initial 75 commands         | 1–4   |    75 |
| 5     | +6 (CHPROP, CHANGE, DIMEDIT, DIMTEDIT, ATTDEF, ATTEDIT) | 5 | 81 → …105 |
| 6     | +3 (MLINE, SOLID, MINSERT)  | 6     |   108 |
| 7     | +3 (SKETCH, TRACE, FILL)    | 7     |   111 |
| 8     | +3 (BASE, MULTIPLE, DDPTYPE)| 8     |   114 |
| 9     | +3 (QTEXT, ATTDISP, ATTEXT) | 9     |   117 |
