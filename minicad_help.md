# MiniCAD Help Guide

MiniCAD is a browser-based 2D CAD application styled after AutoCAD R14, built for laser cutting and CNC workflows.

---

## Basic Interaction

### Command Line
The command line is at the bottom of the screen. All commands are typed here.

- **Type a command** and press **Enter** or **Space** to execute
- Press **Enter** with empty input to repeat the last command
- Press **Escape** to cancel the current command
- **Right-click** on canvas also confirms/enters (same as pressing Enter)

### Mouse
| Action | Effect |
|--------|--------|
| Left click | Select entity / provide point during command |
| Left drag (left→right) | Window select (entities fully inside) |
| Left drag (right→left) | Crossing select (entities that overlap) |
| Middle drag | Pan the view |
| Scroll wheel | Zoom in/out |
| Right click | Confirm/Enter during active command |

### Keyboard Shortcuts
| Key | Function |
|-----|----------|
| Ctrl+Z | Undo |
| Ctrl+Y | Redo |
| F1 | Show command list |
| F3 | Toggle Object Snap (OSNAP) |
| F6 | Toggle coordinate display (Cartesian / Polar / Off) |
| F7 | Toggle grid visibility |
| F8 | Toggle Ortho mode (constrain to H/V) |
| F9 | Toggle Grid Snap |
| Escape | Cancel current command |

---

## How Multi-Step Commands Work

Many commands follow a **select → act** pattern with multiple phases. Understanding this pattern is key:

1. **Command prompts appear in the command line** at the bottom — always read them
2. **Click on the canvas** to provide points or select objects
3. **Press Enter** to confirm a selection phase and move to the next step
4. **Press Escape** to cancel at any time

Options shown in **[brackets]** can be typed. For example, if the prompt says `[Radius]:`, type `R` and press Enter.

---

## TRIM Command — Step by Step Example

### Scenario
You have two crossing lines and want to remove part of one line at the intersection.

```
      |
      |
------+------    ← two lines crossing
      |
      |
```

### Steps

**1. Start the command**
```
Command: TR  [Enter]
```
(or type `TRIM` and press Enter)

**2. Select cutting edges**
```
TRIM Select cutting edges (Enter for all):
```

The **cutting edge** is the line that acts as the "knife." Click on the line you want to use as the boundary.

```
1 edge(s) selected. Select more or Enter:
```

You can click more lines to add more cutting edges, or just **press Enter** to move on.

> **Tip:** If you press Enter immediately without selecting anything, ALL visible entities become cutting edges. This is often the fastest approach.

**3. Select the part to trim**
```
Select object to trim or <exit>:
```

Now click on **the side of the line you want to REMOVE**. The click position matters — the part of the line on the side you clicked gets trimmed away at the intersection.

```
      |
      |
------+          ← clicked on the right side → right portion removed
      |
      |
```

**4. Continue or finish**

After trimming, MiniCAD stays in trim mode. You can:
- **Click another line segment** to trim it too
- **Press Enter** to finish and exit the command

### Complete Example Flow
```
Command: TR                              ← type TR, press Enter
TRIM Select cutting edges (Enter for all):  ← press Enter (use all as edges)
Select object to trim or <exit>:         ← click on the part to remove
Trimmed
Select object to trim or <exit>:         ← click another part, or Enter to exit
```

---

## EXTEND Command — Step by Step

Works like TRIM but in reverse — extends a line to meet a boundary.

```
Command: EX                                    ← start EXTEND
EXTEND Select boundary edges (Enter for all):  ← press Enter or click boundaries
Select object to extend or <exit>:             ← click near the end to extend
```

Click near the **end of the line** that should grow. It extends toward the nearest boundary intersection.

---

## Common Command Reference

### Drawing Commands
| Command | Alias | Description |
|---------|-------|-------------|
| LINE | L | Draw line segments. Click points, Enter to finish |
| CIRCLE | C | Draw circle. Click center, then radius point |
| ARC | A | Draw arc. Three-point: start, second point, end |
| PLINE | PL | Draw polyline (connected segments). Enter to finish |
| RECTANG | REC | Draw rectangle. Click two opposite corners |
| POLYGON | POL | Regular polygon. Enter sides, center, radius |
| POINT | PO | Place point markers |
| TEXT | DT | Place text. Click position, enter height, enter text |
| MTEXT | MT | Multi-line text (use \n for line breaks) |
| HATCH | H | Fill a closed boundary with a pattern |

### Modify Commands
| Command | Alias | Description |
|---------|-------|-------------|
| ERASE | E | Delete selected entities |
| MOVE | M | Move entities. Select → base point → destination |
| COPY | CO | Copy entities. Select → base point → destination |
| ROTATE | RO | Rotate entities. Select → base point → angle |
| SCALE | SC | Scale entities. Select → base point → factor |
| MIRROR | MI | Mirror entities across a line |
| OFFSET | O | Create parallel copy at a distance |
| TRIM | TR | Trim entity at intersection (see example above) |
| EXTEND | EX | Extend entity to a boundary |
| BREAK | BR | Break an entity at one or two points |
| FILLET | F | Round corner between two lines. Use [R] to set radius |
| CHAMFER | CHA | Bevel corner between two lines. Use [D] to set distances |
| EXPLODE | X | Break compound objects into individual entities |
| JOIN | J | Merge touching entities into one polyline |
| LENGTHEN | LEN | Change length of a line or arc |
| STRETCH | S | Stretch selected entities by displacement |
| PEDIT | PE | Edit polyline (Close/Open/Join/Reverse/Width) |

### Dimension Commands
| Command | Alias | Description |
|---------|-------|-------------|
| DIMLINEAR | DLI | Horizontal/vertical dimension between two points |
| DIMALIGNED | DAL | Dimension aligned to two points |
| DIMRADIUS | DRA | Radius dimension on a circle/arc |
| DIMDIAMETER | DDI | Diameter dimension on a circle/arc |
| DIMCONTINUE | DCO | Continue from last dimension's endpoint |
| DIMSTYLE | D | Configure dimension text size, arrows, precision |

### View Commands
| Command | Alias | Description |
|---------|-------|-------------|
| ZOOM | Z | Zoom. Options: [All/Extents/Window] |
| PAN | P | Click and drag to pan the view |

### Settings Commands
| Command | Alias | Description |
|---------|-------|-------------|
| LAYER | LA | Manage layers (New/Set/Color/ON/OFF/Lock) |
| LINETYPE | LT | Set entity linetype (continuous/dashed/center/etc.) |
| LINEWEIGHT | LW | Set entity line width |
| MATCHPROP | MA | Copy properties from one entity to others |
| OSNAP | OS | Configure object snap modes |
| GRID | G | Toggle grid display and set spacing |
| UNITS | UN | Set decimal precision |
| OPTIONS | OP | Change grid spacing, precision settings |
| GROUP | G | Create/manage named entity groups |
| PROPERTIES | MO | View/edit properties of selected entity |

### Inquiry Commands
| Command | Alias | Description |
|---------|-------|-------------|
| DIST | DI | Measure distance between two points |
| LIST | LI | Show detailed info about selected entities |
| DIVIDE | DIV | Place point markers at equal intervals on an entity |

### Block Commands
| Command | Alias | Description |
|---------|-------|-------------|
| BLOCK | B | Define a block from selected entities |
| INSERT | I | Insert a block by name at a point |

---

## FILLET Example (Rounding a Corner)

```
Command: F                               ← start FILLET
FILLET Current radius = 0. Select first object or [Radius]:
R                                        ← type R, Enter to set radius
Specify fillet radius: 5                 ← enter radius value
Fillet radius = 5. Select first object:  ← click first line
Select second object:                    ← click second line
```

With radius = 0, FILLET extends/trims two lines to meet at their intersection (useful for cleaning up corners).

---

## Tips for CNC/Laser Workflows

1. **Use LAYER (LA)** to organize cut vs engrave layers with different colors
2. **Use OFFSET (O)** to create parallel paths for kerf compensation  
3. **Use FILLET with radius 0** to clean up corner intersections
4. **Use EXPLODE (X)** to break rectangles/polylines into individual lines before export
5. **Use TRIM (TR) with Enter** to skip edge selection — all entities become cutting edges
6. **Save/Open DXF** with the toolbar buttons (folder icon = open, disk icon = save)

---

## Coordinate Input

During any command that asks for a point, you can type coordinates instead of clicking:

| Format | Example | Meaning |
|--------|---------|---------|
| `x,y` | `100,50` | Absolute coordinates |
| `@x,y` | `@10,20` | Relative to last point |
| `@dist<angle` | `@50<45` | Polar: distance and angle from last point |

---

## Status Bar

The bottom status bar shows:
- **Coordinates** — current cursor position (toggle format with F6)
- **Layer name** — click to manage layers
- **OSNAP** — click or F3 to toggle object snap
- **GRID** — click or F7 to toggle grid
- **SNAP** — click or F9 to toggle grid snap
- **ORTHO** — click or F8 to toggle orthogonal constraint
