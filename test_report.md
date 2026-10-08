# MiniCAD Command Test Report

**Date:** 2026-10-07  
**Test Framework:** Playwright (headless Chromium)  
**Server:** Vite dev server on localhost:3011  
**Result:** 66/66 PASSED

---

## Test Summary

| Category | Tests | Passed | Failed |
|----------|-------|--------|--------|
| Drawing Commands | 10 | 10 | 0 |
| Modify Commands | 13 | 13 | 0 |
| State Machine Bug Fixes | 14 | 14 | 0 |
| Dimension Commands | 5 | 5 | 0 |
| Settings Commands | 11 | 11 | 0 |
| View Commands | 2 | 2 | 0 |
| Inquiry Commands | 3 | 3 | 0 |
| Annotation/Block Commands | 3 | 3 | 0 |
| Other Commands | 2 | 2 | 0 |
| General Behavior | 3 | 3 | 0 |
| **Total** | **66** | **66** | **0** |

---

## Drawing Commands

| # | Test | Status | Notes |
|---|------|--------|-------|
| 1 | LINE — basic draw | PASS | Draw two-point line, Enter to finish |
| 2 | CIRCLE — basic draw | PASS | Click center, click radius |
| 3 | ARC — three point | PASS | Three-point arc creation |
| 4 | RECTANG — two corners | PASS | Two-corner rectangle |
| 5 | PLINE — polyline | PASS | Multi-point polyline, Enter to finish |
| 6 | TEXT — basic text | PASS | Position, height, rotation, content |
| 7 | POINT — place point | PASS | Click to place, Enter to exit |
| 8 | MTEXT — multiline text | PASS | Two-corner box, text with \n |
| 9 | POLYGON — 6 sides | PASS | Explicit 6 sides, inscribed, typed radius |
| 10 | POLYGON — Enter defaults | PASS | Enter defaults to 6 sides |

## Modify Commands

| # | Test | Status | Notes |
|---|------|--------|-------|
| 11 | ERASE — delete entity | PASS | Select + E deletes |
| 12 | MOVE — move entity | PASS | Base point + displacement |
| 13 | COPY — copy entity | PASS | Base point + displacement, Enter exits loop |
| 14 | ROTATE — by angle | PASS | Typed angle value |
| 15 | ROTATE — Enter cancels | PASS | Enter at angle prompt exits cleanly |
| 16 | SCALE — scale entity | PASS | Base point + scale factor |
| 17 | MIRROR — mirror entity | PASS | Mirror line + default No erase |
| 18 | OFFSET — parallel copy | PASS | Distance + select + side + Enter exits |
| 19 | TRIM — trim at intersection | PASS | Enter for all edges, click to trim, Enter exits |
| 20 | EXTEND — extend to boundary | PASS | Enter for all boundaries, click to extend |
| 21 | EXPLODE — break compound | PASS | Explode compound entities |
| 22 | JOIN — merge entities | PASS | Join touching entities |
| 23 | STRETCH — stretch entities | PASS | Base point + displacement |

## State Machine Bug Fix Tests

These tests specifically verify the bugs identified and fixed in multi-step commands.

| # | Test | Status | Bug Fixed |
|---|------|--------|-----------|
| 24 | BREAK — basic flow | PASS | Basic object selection and break |
| 25 | BREAK — [F]irst point option | PASS | Typing 'f' for first-point mode |
| 26 | BREAK — Enter exits (FIX) | PASS | **Enter at "second break point" now exits cleanly** |
| 27 | FILLET — Enter exits (FIX) | PASS | **Enter at initial prompt exits, next command starts normally** |
| 28 | FILLET — radius then select | PASS | Setting radius with 'r' option |
| 29 | FILLET — R handler cleared (FIX) | PASS | **'r' inputHandler cleared before selection phase** |
| 30 | CHAMFER — Enter exits (FIX) | PASS | **Enter at initial prompt exits cleanly** |
| 31 | CHAMFER — distance setting | PASS | Setting d1/d2 with 'd' option |
| 32 | LENGTHEN — Enter exits (FIX) | PASS | **Enter at mode prompt exits (was stuck before)** |
| 33 | LENGTHEN — Delta Enter exits (FIX) | PASS | **Enter at delta value prompt exits cleanly** |
| 34 | POLYGON — stale handler cleared (FIX) | PASS | **Sides inputHandler cleared after transitioning to click** |
| 35 | LAYER — invalid option caught (FIX) | PASS | **Invalid option shows error instead of command lookup** |
| 36 | GROUP — invalid option caught (FIX) | PASS | **Invalid option shows error instead of command lookup** |
| 37 | PEDIT — invalid option test | PASS | **Invalid submenu option shows error** |

## Dimension Commands

| # | Test | Status | Notes |
|---|------|--------|-------|
| 38 | DIMSTYLE — status | PASS | Shows DIMTXT, DIMASZ, etc. |
| 39 | DIMLINEAR — dimension | PASS | Two extension points + placement |
| 40 | DIMALIGNED — dimension | PASS | Aligned dimension creation |
| 41 | DIMRADIUS — dimension | PASS | Radius dimension on circle/arc |
| 42 | DIMDIAMETER — dimension | PASS | Diameter dimension on circle/arc |

## Settings Commands

| # | Test | Status | Notes |
|---|------|--------|-------|
| 43 | LAYER — basic flow | PASS | List layers, invalid option handling |
| 44 | LAYER — new layer | PASS | Create "TestLayer" |
| 45 | LINETYPE — type list | PASS | Show types, Enter to exit |
| 46 | LINEWEIGHT — weight set | PASS | Enter to exit |
| 47 | MATCHPROP — start | PASS | Source selection prompt |
| 48 | GROUP — basic flow | PASS | List, invalid option handling |
| 49 | OSNAP — set modes | PASS | Set end,mid,cen |
| 50 | ORTHO — toggle | PASS | Toggle on/off |
| 51 | GRID — toggle | PASS | Toggle on/off |
| 52 | UNDO/REDO | PASS | Both directions |
| 53 | UNITS — precision | PASS | Set to 4 decimal places |

## View Commands

| # | Test | Status | Notes |
|---|------|--------|-------|
| 54 | ZOOM — zoom all | PASS | Z + A for zoom all |
| 55 | PAN — start pan | PASS | Pan mode activation |

## Inquiry Commands

| # | Test | Status | Notes |
|---|------|--------|-------|
| 56 | DIST — measure | PASS | Distance between two coordinate points |
| 57 | LIST — entity info | PASS | Entity information display |
| 58 | DIVIDE — divide entity | PASS | Divide entity flow |

## Annotation/Block Commands

| # | Test | Status | Notes |
|---|------|--------|-------|
| 59 | HATCH — start | PASS | Hatch command initiation |
| 60 | BLOCK — start | PASS | Block definition prompt |
| 61 | INSERT — start | PASS | Block insertion prompt |

## Other Commands

| # | Test | Status | Notes |
|---|------|--------|-------|
| 62 | PROPERTIES — view | PASS | Properties command start |
| 63 | OPTIONS — settings | PASS | Options command start |

## General Behavior

| # | Test | Status | Notes |
|---|------|--------|-------|
| 64 | Function keys (F3/F7/F8/F9) | PASS | OSNAP, Grid, Ortho, Snap toggles |
| 65 | Escape cancels all commands | PASS | L, C, TR, BR, F all cancelled cleanly |
| 66 | Enter repeats last command | PASS | Empty Enter restarts last command |

---

## Bugs Fixed in This Session

### Engine Level (`engine.ts`)
- **Empty Enter during active command** — Previously fell through to "repeat last command" logic. Now silently swallowed, letting each command decide what Enter means.

### BREAK (`trim-extend.ts`)
- Added Enter-to-exit at "Specify second break point" prompt
- Cleared inputHandler after `[F]irst point` option to prevent unbounded re-nesting

### FILLET (`trim-extend.ts`)
- Added Enter-to-exit at initial prompt
- Cleared `[R]adius` inputHandler before entering selection phase

### CHAMFER (`trim-extend.ts`)
- Added Enter-to-exit at initial prompt
- Cleared `[D]istance` inputHandler before entering selection phase

### LENGTHEN (`modify.ts`)
- Added Enter-to-exit at mode prompt (command was stuck — only Escape worked)
- Added Enter-to-exit at each inner value prompt (delta/percent/total)
- Invalid number input now shows error instead of falling through to command lookup

### ROTATE (`modify.ts`)
- Added Enter-to-cancel at rotation angle prompt

### PEDIT (`modify.ts`)
- Unrecognized submenu options now show error instead of falling through to command lookup

### POLYGON (`draw.ts`)
- Cleared outer inputHandler after sides parsed, preventing re-entrant side-count parsing
- Added Enter-to-cancel at radius prompt

### LAYER (`settings.ts`)
- Unrecognized options show error instead of falling through to command lookup

### GROUP (`settings.ts`)
- Fixed alias collision with GRID (both used `G`; GROUP now uses `GR`)
- Unrecognized options show error instead of falling through to command lookup
