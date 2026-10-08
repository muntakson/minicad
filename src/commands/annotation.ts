import { Point, Entity, BlockRefEntity, AttributeDef, TextEntity, HatchEntity } from '../types';
import { store } from '../store';
import { polarPoint, pointOnEntity } from '../geometry';
import { CommandEngine } from './engine';
import { makeEntity, moveEntity } from './helpers';
import { detectBoundary } from '../boundary';

function entityToBoundary(e: Entity): Point[] | null {
  switch (e.type) {
    case 'polyline':
      if (!e.closed || e.points.length < 3) return null;
      return e.points.map(p => ({ ...p }));
    case 'rect': {
      const x1 = Math.min(e.corner1.x, e.corner2.x);
      const y1 = Math.min(e.corner1.y, e.corner2.y);
      const x2 = Math.max(e.corner1.x, e.corner2.x);
      const y2 = Math.max(e.corner1.y, e.corner2.y);
      return [{ x: x1, y: y1 }, { x: x2, y: y1 }, { x: x2, y: y2 }, { x: x1, y: y2 }];
    }
    case 'circle': {
      const pts: Point[] = [];
      for (let i = 0; i < 36; i++) {
        const a = (2 * Math.PI * i) / 36;
        pts.push(polarPoint(e.center, e.radius, a));
      }
      return pts;
    }
    default:
      return null;
  }
}

export function registerAnnotationCommands(engine: CommandEngine) {

  // === HATCH ===
  engine.register('HATCH', ['H'], () => {
    const sel = store.selectedEntities();
    if (sel.length > 0) {
      const boundaries: Point[][] = [];
      for (const e of sel) {
        const b = entityToBoundary(e);
        if (b) boundaries.push(b);
      }
      if (boundaries.length === 0) {
        engine.prompt('No valid closed boundaries found. Select objects or [Internal point]:');
        promptHatchMode([]);
        return;
      }
      promptPattern(boundaries);
    } else {
      engine.prompt('HATCH Select objects or [Internal point] <Internal>:');
      promptHatchMode([]);
    }

    function promptHatchMode(boundaries: Point[][]) {
      engine.waitForInput('Select or I:', (input) => {
        const lower = input.toLowerCase();
        if (lower === 'i' || lower === 'internal' || lower === '') {
          engine.prompt('Pick internal point:');
          const pickInternal = () => {
            engine.waitForClick((pt) => {
              const boundary = detectBoundary(pt, store.entities);
              if (!boundary || boundary.length < 3) {
                engine.prompt('Could not detect boundary. Pick another point or Enter to continue:');
                engine.inputHandler = (inp) => {
                  if (inp === '') {
                    if (boundaries.length > 0) {
                      promptPattern(boundaries);
                    } else {
                      engine.prompt('No boundaries detected');
                      engine.complete();
                    }
                    return true;
                  }
                  return false;
                };
                pickInternal();
                return;
              }
              boundaries.push(boundary.map(p => ({ ...p })));
              engine.prompt(`Boundary ${boundaries.length} detected (${boundary.length} vertices). Pick another point or Enter to continue:`);
              engine.inputHandler = (inp) => {
                if (inp === '') {
                  promptPattern(boundaries);
                  return true;
                }
                return false;
              };
              pickInternal();
            });
          };
          pickInternal();
          return true;
        }
        engine.prompt('Select boundary objects, then press Enter:');
        engine.requireSelection((sel2) => {
          for (const e of sel2) {
            const b = entityToBoundary(e);
            if (b) boundaries.push(b);
          }
          if (boundaries.length === 0) {
            engine.prompt('No valid closed boundaries found');
            engine.complete();
            return;
          }
          promptPattern(boundaries);
        });
        return true;
      });
    }

    function promptPattern(boundaries: Point[][]) {
      const VALID_PATTERNS = ['SOLID', 'ANSI31', 'ANSI32', 'ANSI33', 'ANSI34', 'ANSI35', 'ANSI36', 'ANSI37', 'ANSI38',
                              'CROSS', 'SQUARE', 'HONEY', 'EARTH', 'GRASS', 'DOTS'];
      engine.prompt(`${boundaries.length} boundary(ies). Patterns: ${VALID_PATTERNS.join(', ')}`);
      engine.prompt('Enter pattern name <SOLID>:');
      engine.waitForInput('Pattern <SOLID>:', (input) => {
        const patternName = input.trim().toUpperCase() || 'SOLID';
        if (!VALID_PATTERNS.includes(patternName)) {
          engine.prompt(`Unknown pattern "${patternName}", using SOLID`);
        }
        const validPattern = VALID_PATTERNS.includes(patternName) ? patternName : 'SOLID';

        if (validPattern === 'SOLID') {
          askAngle(boundaries, validPattern, 1);
        } else {
          engine.prompt('Enter pattern scale <1>:');
          engine.waitForInput('Scale <1>:', (scaleInput) => {
            const patternScale = parseFloat(scaleInput) || 1;
            askAngle(boundaries, validPattern, patternScale);
            return true;
          });
        }
        return true;
      });
    }

    function askAngle(boundaries: Point[][], patternName: string, patternScale: number) {
      engine.prompt('Enter pattern angle <0>:');
      engine.waitForInput('Angle <0>:', (angleInput) => {
        const patternAngle = parseFloat(angleInput) || 0;
        store.pushUndo('HATCH');
        store.addEntity(makeEntity({
          type: 'hatch',
          boundaries,
          patternName,
          patternScale,
          patternAngle,
        } as any));
        store.clearSelection();
        engine.prompt('Hatch created');
        engine.complete();
        return true;
      });
    }
  });

  // === BLOCK ===
  engine.register('BLOCK', ['B'], () => {
    engine.prompt('BLOCK Enter block name:');
    engine.waitForInput('Block name:', (nameInput) => {
      const blockName = nameInput.trim();
      if (!blockName) {
        engine.prompt('Block name required');
        engine.complete();
        return true;
      }
      if (store.blockDefs.has(blockName)) {
        engine.prompt(`Block "${blockName}" already exists. Redefining.`);
      }
      engine.inputHandler = null;
      engine.prompt('Specify base point:');
      engine.waitForClick((base) => {
        engine.requireSelection((sel) => {
          store.pushUndo('BLOCK');
          const copies: Entity[] = JSON.parse(JSON.stringify(sel));
          for (const c of copies) {
            moveEntity(c, -base.x, -base.y);
          }
          store.blockDefs.set(blockName, copies);
          // Transfer pending attribute definitions to this block
          const pending = store.blockAttribs.get('__pending__');
          if (pending && pending.length > 0) {
            store.blockAttribs.set(blockName, [...pending]);
            store.blockAttribs.delete('__pending__');
          }
          for (const e of sel) store.removeEntity(e.id);
          store.clearSelection();
          const attCount = store.blockAttribs.get(blockName)?.length || 0;
          engine.prompt(`Block "${blockName}" defined with ${copies.length} object(s)${attCount ? `, ${attCount} attribute(s)` : ''}`);
          engine.complete();
        });
      });
      return true;
    });
  });

  // === WBLOCK (write block to file) ===
  engine.register('WBLOCK', ['W'], () => {
    const names = Array.from(store.blockDefs.keys());
    if (names.length === 0) {
      engine.prompt('No block definitions found');
      engine.complete();
      return;
    }
    engine.prompt(`WBLOCK Available blocks: ${names.join(', ')}`);
    engine.prompt('Enter block name to export:');
    engine.waitForInput('Block name:', (nameInput) => {
      const blockName = nameInput.trim();
      if (!blockName) { engine.complete(); return true; }
      const def = store.blockDefs.get(blockName);
      if (!def) {
        engine.prompt(`Block "${blockName}" not found`);
        engine.complete();
        return true;
      }
      engine.prompt('Export format [JSON/DXF] <JSON>:');
      engine.waitForInput('Format:', (fmtInput) => {
        const fmt = fmtInput.toLowerCase() || 'json';
        if (fmt === 'dxf') {
          (window as any).dxfSave();
          engine.prompt('Use DXF export with block selected');
          engine.complete();
          return true;
        }
        const data = { blockName, entities: def };
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${blockName}.json`;
        a.click();
        URL.revokeObjectURL(url);
        engine.prompt(`Block "${blockName}" exported as ${blockName}.json`);
        engine.complete();
        return true;
      });
      return true;
    });
  });

  // === LEADER ===
  engine.register('LEADER', ['LE'], () => {
    engine.prompt('LEADER Specify leader start point:');
    const pts: Point[] = [];
    engine.waitForClick((p1) => {
      pts.push(p1);
      const nextLeaderPoint = () => {
        engine.prompt('Specify next point or press Enter to add text:');
        engine.onMove((p) => {
          engine.renderer.rubberPolyline = [...pts, p];
        });
        engine.inputHandler = (input) => {
          if (input === '') {
            engine.renderer.rubberPolyline = null;
            if (pts.length < 2) { engine.prompt('Need at least 2 points'); engine.complete(); return true; }
            engine.prompt('Enter annotation text <empty>:');
            engine.waitForInput('Text:', (text) => {
              store.pushUndo('LEADER');
              store.addEntity(makeEntity({
                type: 'polyline', points: [...pts], bulges: pts.map(() => 0), closed: false,
              } as any));
              if (text.trim()) {
                const lastPt = pts[pts.length - 1];
                store.addEntity(makeEntity({
                  type: 'text', position: { x: lastPt.x + 2, y: lastPt.y + 2 }, text: text.trim(),
                  height: store.currentDimStyle.textHeight, rotation: 0,
                } as any));
              }
              engine.prompt('Leader created');
              engine.complete();
              return true;
            });
            return true;
          }
          const pt = engine.parseCoordinate(input);
          if (pt) { engine.handleClick(pt); return true; }
          return false;
        };
        engine.waitForClick((p) => {
          pts.push(p);
          engine.renderer.rubberPolyline = [...pts];
          nextLeaderPoint();
        });
      };
      nextLeaderPoint();
    });
  });

  // === INSERT ===
  engine.register('INSERT', ['I'], () => {
    engine.prompt('INSERT Enter block name:');
    const names = Array.from(store.blockDefs.keys());
    if (names.length > 0) {
      engine.prompt(`Available blocks: ${names.join(', ')}`);
    }
    engine.waitForInput('Block name:', (nameInput) => {
      const blockName = nameInput.trim();
      if (!blockName) { engine.complete(); return true; }
      if (!store.blockDefs.has(blockName)) {
        engine.prompt(`Block "${blockName}" not found`);
        engine.complete();
        return true;
      }
      engine.inputHandler = null;
      engine.prompt('Specify insertion point:');
      engine.waitForClick((insertPoint) => {
        engine.prompt('Enter X scale factor <1>:');
        engine.waitForInput('X scale <1>:', (xInput) => {
          const scaleX = parseFloat(xInput) || 1;
          engine.prompt(`Enter Y scale factor <${scaleX}>:`);
          engine.waitForInput(`Y scale <${scaleX}>:`, (yInput) => {
            const scaleY = parseFloat(yInput) || scaleX;
            engine.prompt('Specify rotation angle <0>:');
            engine.waitForInput('Rotation <0>:', (rotInput) => {
              const rotation = parseFloat(rotInput) || 0;
              store.pushUndo('INSERT');
              const entity = makeEntity({
                type: 'blockref',
                blockName,
                insertPoint,
                scaleX,
                scaleY,
                rotation,
              } as any) as BlockRefEntity;

              const attDefs = store.blockAttribs.get(blockName);
              if (attDefs && attDefs.length > 0) {
                entity.attributes = [];
                const promptAttr = (i: number) => {
                  if (i >= attDefs.length) {
                    store.addEntity(entity as any);
                    engine.prompt(`Block "${blockName}" inserted with ${entity.attributes!.length} attribute(s)`);
                    engine.complete();
                    return;
                  }
                  const def = attDefs[i];
                  engine.prompt(`${def.prompt} <${def.defaultValue}>:`);
                  engine.waitForInput(`${def.tag}:`, (val) => {
                    entity.attributes!.push({ tag: def.tag, value: val || def.defaultValue });
                    promptAttr(i + 1);
                    return true;
                  });
                };
                promptAttr(0);
              } else {
                store.addEntity(entity as any);
                engine.prompt(`Block "${blockName}" inserted`);
                engine.complete();
              }
              return true;
            });
            return true;
          });
          return true;
        });
      });
      return true;
    });
  });

  // === MINSERT — Multiple block insert in rectangular array ===
  engine.register('MINSERT', ['MI_INSERT'], () => {
    engine.prompt('MINSERT Enter block name:');
    const names = Array.from(store.blockDefs.keys());
    if (names.length > 0) {
      engine.prompt(`Available blocks: ${names.join(', ')}`);
    }
    engine.waitForInput('Block name:', (nameInput) => {
      const blockName = nameInput.trim();
      if (!blockName) { engine.complete(); return true; }
      if (!store.blockDefs.has(blockName)) {
        engine.prompt(`Block "${blockName}" not found`);
        engine.complete();
        return true;
      }
      engine.prompt('Specify insertion point:');
      engine.waitForClick((insertPoint) => {
        engine.prompt('Enter X scale factor <1>:');
        engine.waitForInput('X scale <1>:', (xInput) => {
          const scaleX = parseFloat(xInput) || 1;
          engine.prompt(`Enter Y scale factor <${scaleX}>:`);
          engine.waitForInput(`Y scale <${scaleX}>:`, (yInput) => {
            const scaleY = parseFloat(yInput) || scaleX;
            engine.prompt('Specify rotation angle <0>:');
            engine.waitForInput('Rotation <0>:', (rotInput) => {
              const rotation = parseFloat(rotInput) || 0;
              engine.prompt('Enter number of rows (---) <1>:');
              engine.waitForInput('Rows <1>:', (rowInput) => {
                const rows = Math.max(1, parseInt(rowInput) || 1);
                engine.prompt('Enter number of columns (|||) <1>:');
                engine.waitForInput('Columns <1>:', (colInput) => {
                  const cols = Math.max(1, parseInt(colInput) || 1);
                  if (rows === 1 && cols === 1) {
                    store.pushUndo('MINSERT');
                    store.addEntity(makeEntity({
                      type: 'blockref', blockName, insertPoint, scaleX, scaleY, rotation,
                    } as any));
                    engine.prompt(`Block "${blockName}" inserted (1x1)`);
                    engine.complete();
                    return true;
                  }
                  const promptSpacing = () => {
                    if (rows > 1) {
                      engine.prompt('Specify distance between rows:');
                      engine.waitForInput('Row distance:', (rdInput) => {
                        const rowDist = parseFloat(rdInput) || 0;
                        if (cols > 1) {
                          engine.prompt('Specify distance between columns:');
                          engine.waitForInput('Column distance:', (cdInput) => {
                            const colDist = parseFloat(cdInput) || 0;
                            doMinsert(blockName, insertPoint, scaleX, scaleY, rotation, rows, cols, rowDist, colDist);
                            return true;
                          });
                        } else {
                          doMinsert(blockName, insertPoint, scaleX, scaleY, rotation, rows, cols, rowDist, 0);
                        }
                        return true;
                      });
                    } else {
                      engine.prompt('Specify distance between columns:');
                      engine.waitForInput('Column distance:', (cdInput) => {
                        const colDist = parseFloat(cdInput) || 0;
                        doMinsert(blockName, insertPoint, scaleX, scaleY, rotation, rows, cols, 0, colDist);
                        return true;
                      });
                    }
                  };
                  promptSpacing();
                  return true;
                });
                return true;
              });
              return true;
            });
            return true;
          });
          return true;
        });
      });
      return true;
    });

    function doMinsert(blockName: string, base: Point, sx: number, sy: number, rot: number,
                       rows: number, cols: number, rowDist: number, colDist: number) {
      store.pushUndo('MINSERT');
      const rad = rot * Math.PI / 180;
      const cosR = Math.cos(rad), sinR = Math.sin(rad);
      let count = 0;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const dx = c * colDist;
          const dy = r * rowDist;
          const rx = dx * cosR - dy * sinR;
          const ry = dx * sinR + dy * cosR;
          store.addEntity(makeEntity({
            type: 'blockref',
            blockName,
            insertPoint: { x: base.x + rx, y: base.y + ry },
            scaleX: sx,
            scaleY: sy,
            rotation: rot,
          } as any));
          count++;
        }
      }
      engine.prompt(`MINSERT: ${count} block(s) inserted in ${rows}x${cols} array`);
      engine.complete();
    }
  });

  // === TOLERANCE (GD&T) ===
  const GDT_SYMBOLS: Record<string, { symbol: string; name: string }> = {
    pos: { symbol: '⌖', name: 'Position' },
    con: { symbol: '◎', name: 'Concentricity' },
    sym: { symbol: '⌯', name: 'Symmetry' },
    par: { symbol: '∥', name: 'Parallelism' },
    per: { symbol: '⟂', name: 'Perpendicularity' },
    ang: { symbol: '∠', name: 'Angularity' },
    cyl: { symbol: '⌭', name: 'Cylindricity' },
    fla: { symbol: '⏥', name: 'Flatness' },
    cir: { symbol: '○', name: 'Circularity' },
    str: { symbol: '⌒', name: 'Straightness' },
    run: { symbol: '↗', name: 'Runout' },
    tot: { symbol: '↗↗', name: 'Total runout' },
    pro: { symbol: '⌓', name: 'Profile (line)' },
    prs: { symbol: '⌓', name: 'Profile (surface)' },
  };

  engine.register('TOLERANCE', ['TOL'], () => {
    const keys = Object.keys(GDT_SYMBOLS);
    engine.prompt('TOLERANCE Geometric characteristic:');
    engine.prompt(`  ${keys.map(k => `${k}=${GDT_SYMBOLS[k].name}`).join(', ')}`);
    engine.prompt('Enter symbol code:');
    engine.waitForInput('Symbol:', (symInput) => {
      const lower = symInput.toLowerCase();
      const entry = GDT_SYMBOLS[lower];
      if (!entry) {
        engine.prompt(`Unknown symbol "${symInput}". Use: ${keys.join(', ')}`);
        engine.complete();
        return true;
      }
      engine.prompt(`${entry.name} (${entry.symbol}). Enter tolerance value:`);
      engine.waitForInput('Tolerance:', (tolInput) => {
        if (!tolInput) { engine.complete(); return true; }
        engine.prompt('Enter datum reference (A/B/C or Enter for none):');
        engine.waitForInput('Datum:', (datumInput) => {
          const datum = datumInput.trim().toUpperCase();
          engine.prompt('Specify insertion point:');
          engine.waitForClick((pos) => {
            store.pushUndo('TOLERANCE');
            const h = store.currentDimStyle.textHeight;
            const frameW = h * (datum ? 8 : 6);
            const frameH = h * 1.8;

            // GD&T frame: outer rectangle
            store.addEntity(makeEntity({
              type: 'rect',
              corner1: pos,
              corner2: { x: pos.x + frameW, y: pos.y + frameH },
            } as any));

            // Vertical divider after symbol cell
            const div1X = pos.x + h * 2;
            store.addEntity(makeEntity({
              type: 'line',
              start: { x: div1X, y: pos.y },
              end: { x: div1X, y: pos.y + frameH },
            } as any));

            // Symbol text
            store.addEntity(makeEntity({
              type: 'text',
              position: { x: pos.x + h * 0.3, y: pos.y + h * 0.4 },
              text: entry.symbol,
              height: h,
              rotation: 0,
            } as any));

            // Tolerance value
            store.addEntity(makeEntity({
              type: 'text',
              position: { x: div1X + h * 0.3, y: pos.y + h * 0.4 },
              text: tolInput,
              height: h,
              rotation: 0,
            } as any));

            if (datum) {
              // Vertical divider before datum cell
              const div2X = pos.x + h * 5;
              store.addEntity(makeEntity({
                type: 'line',
                start: { x: div2X, y: pos.y },
                end: { x: div2X, y: pos.y + frameH },
              } as any));

              // Datum letter
              store.addEntity(makeEntity({
                type: 'text',
                position: { x: div2X + h * 0.5, y: pos.y + h * 0.4 },
                text: datum,
                height: h,
                rotation: 0,
              } as any));
            }

            engine.prompt(`Tolerance frame created: ${entry.name} ${tolInput}${datum ? ' datum ' + datum : ''}`);
            engine.complete();
          });
          return true;
        });
        return true;
      });
      return true;
    });
  });

  // === ATTDEF ===
  engine.register('ATTDEF', ['ATT'], () => {
    engine.prompt('ATTDEF Enter attribute tag (identifier):');
    engine.waitForInput('Tag:', (tagInput) => {
      const tag = tagInput.trim().toUpperCase();
      if (!tag) { engine.prompt('Tag required'); engine.complete(); return true; }
      engine.prompt('Enter attribute prompt:');
      engine.waitForInput('Prompt:', (promptInput) => {
        const prompt = promptInput.trim() || tag;
        engine.prompt('Enter default value <empty>:');
        engine.waitForInput('Default:', (defaultInput) => {
          const defaultValue = defaultInput.trim();
          engine.prompt('Invisible? [Yes/No] <No>:');
          engine.waitForInput('Invisible:', (invisInput) => {
            const invisible = invisInput.toLowerCase() === 'y' || invisInput.toLowerCase() === 'yes';
            engine.prompt('Specify insertion point:');
            engine.waitForClick((pos) => {
              engine.prompt(`Enter text height <${store.currentDimStyle.textHeight}>:`);
              engine.waitForInput('Height:', (hInput) => {
                const height = parseFloat(hInput) || store.currentDimStyle.textHeight;

                const attDef: AttributeDef = { tag, prompt, defaultValue, invisible };

                store.pushUndo('ATTDEF');
                store.addEntity(makeEntity({
                  type: 'text',
                  position: pos,
                  text: `{ATT:${tag}} ${defaultValue || tag}`,
                  height,
                  rotation: 0,
                } as any));

                // Store the attribute definition keyed by tag for pickup during BLOCK
                if (!store.blockAttribs.has('__pending__')) {
                  store.blockAttribs.set('__pending__', []);
                }
                store.blockAttribs.get('__pending__')!.push(attDef);

                engine.prompt(`Attribute "${tag}" defined (prompt: "${prompt}", default: "${defaultValue}", invisible: ${invisible})`);
                engine.complete();
                return true;
              });
            });
            return true;
          });
          return true;
        });
        return true;
      });
      return true;
    });
  });

  // === ATTEDIT ===
  engine.register('ATTEDIT', ['ATE'], () => {
    engine.prompt('ATTEDIT Select block reference to edit attributes:');
    engine.waitForClick((pt) => {
      const tol = 10 / store.view.zoom;
      const blockRef = store.entities.find(e =>
        e.visible && e.type === 'blockref' && pointOnEntity(pt, e, tol)
      ) as BlockRefEntity | undefined;
      if (!blockRef) {
        engine.prompt('No block reference found');
        engine.complete();
        return;
      }
      if (!blockRef.attributes || blockRef.attributes.length === 0) {
        // Check if block has attribute definitions
        const defs = store.blockAttribs.get(blockRef.blockName);
        if (!defs || defs.length === 0) {
          engine.prompt(`Block "${blockRef.blockName}" has no attributes`);
          engine.complete();
          return;
        }
        // Initialize attributes from definitions
        blockRef.attributes = defs.map(d => ({ tag: d.tag, value: d.defaultValue }));
      }
      engine.prompt(`--- Block "${blockRef.blockName}" Attributes ---`);
      for (const attr of blockRef.attributes) {
        engine.prompt(`  ${attr.tag} = "${attr.value}"`);
      }
      doAttrEdit(engine, blockRef, 0);
    });
  });

  // === ATTEXT (Attribute Extraction) ===
  engine.register('ATTEXT', ['DDATTEXT'], () => {
    const blockRefs = store.entities.filter(e => e.type === 'blockref') as BlockRefEntity[];
    if (blockRefs.length === 0) {
      engine.prompt('ATTEXT No block references found in drawing');
      engine.complete();
      return;
    }

    const withAttribs = blockRefs.filter(br => {
      if (br.attributes && br.attributes.length > 0) return true;
      const defs = store.blockAttribs.get(br.blockName);
      return defs && defs.length > 0;
    });

    if (withAttribs.length === 0) {
      engine.prompt('ATTEXT No block references with attributes found');
      engine.complete();
      return;
    }

    for (const br of withAttribs) {
      if ((!br.attributes || br.attributes.length === 0)) {
        const defs = store.blockAttribs.get(br.blockName);
        if (defs) {
          br.attributes = defs.map(d => ({ tag: d.tag, value: d.defaultValue }));
        }
      }
    }

    const allTags = new Set<string>();
    for (const br of withAttribs) {
      if (br.attributes) {
        for (const a of br.attributes) allTags.add(a.tag);
      }
    }
    const tagList = Array.from(allTags).sort();

    engine.prompt(`ATTEXT Found ${withAttribs.length} block(s) with attributes`);
    engine.prompt(`Tags: ${tagList.join(', ')}`);
    engine.prompt('Output format [CDF/SDF] <CDF>:');
    engine.waitForInput('Format:', (fmtInput) => {
      const fmt = fmtInput.toUpperCase() || 'CDF';
      if (fmt !== 'CDF' && fmt !== 'SDF') {
        engine.prompt('Invalid format. Use CDF (comma-delimited) or SDF (space-delimited).');
        engine.complete();
        return true;
      }

      const sep = fmt === 'CDF' ? ',' : '  ';
      const header = ['BLOCK_NAME', 'X', 'Y', 'LAYER', ...tagList].join(sep);
      const rows: string[] = [header];

      for (const br of withAttribs) {
        const vals: string[] = [
          br.blockName,
          br.insertPoint.x.toFixed(4),
          br.insertPoint.y.toFixed(4),
          br.layer,
        ];
        for (const tag of tagList) {
          const attr = br.attributes?.find(a => a.tag === tag);
          vals.push(attr ? attr.value : '');
        }
        rows.push(vals.join(sep));
      }

      const csv = rows.join('\n');

      engine.prompt(`\n--- Attribute Extract (${fmt}) ---`);
      for (const row of rows) {
        engine.prompt(row);
      }
      engine.prompt(`--- ${rows.length - 1} record(s) ---`);

      try {
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `attributes.${fmt === 'CDF' ? 'csv' : 'txt'}`;
        a.click();
        URL.revokeObjectURL(url);
        engine.prompt('File download initiated');
      } catch {
        engine.prompt('(Copy text from command history to save)');
      }

      engine.complete();
      return true;
    });
  });

  // === TEXTALIGN ===
  engine.register('TEXTALIGN', ['TA'], () => {
    engine.prompt('TEXTALIGN Alignment option [Left/Center/Right/Top/Middle/Bottom/Distribute] <Left>:');
    engine.waitForInput('Alignment:', (input) => {
      const opt = input === '' ? 'LEFT' : input.toUpperCase();
      engine.requireSelection((sel) => {
        const texts = sel.filter(e => e.type === 'text') as TextEntity[];
        if (texts.length === 0) { engine.prompt('No text entities selected'); engine.complete(); return; }
        store.pushUndo('TEXTALIGN');
        if (opt === 'LEFT' || opt === 'L') {
          const minX = Math.min(...texts.map(t => t.position.x));
          for (const t of texts) t.position = { ...t.position, x: minX };
        } else if (opt === 'RIGHT' || opt === 'R') {
          const maxX = Math.max(...texts.map(t => t.position.x));
          for (const t of texts) t.position = { ...t.position, x: maxX };
        } else if (opt === 'CENTER' || opt === 'C') {
          const minX = Math.min(...texts.map(t => t.position.x));
          const maxX = Math.max(...texts.map(t => t.position.x));
          const cx = (minX + maxX) / 2;
          for (const t of texts) t.position = { ...t.position, x: cx };
        } else if (opt === 'TOP' || opt === 'T') {
          const maxY = Math.max(...texts.map(t => t.position.y));
          for (const t of texts) t.position = { ...t.position, y: maxY };
        } else if (opt === 'MIDDLE' || opt === 'MI') {
          const minY = Math.min(...texts.map(t => t.position.y));
          const maxY = Math.max(...texts.map(t => t.position.y));
          const cy = (minY + maxY) / 2;
          for (const t of texts) t.position = { ...t.position, y: cy };
        } else if (opt === 'BOTTOM' || opt === 'B') {
          const minY = Math.min(...texts.map(t => t.position.y));
          for (const t of texts) t.position = { ...t.position, y: minY };
        } else if (opt === 'DISTRIBUTE' || opt === 'D') {
          if (texts.length < 2) { engine.prompt('Need at least 2 text entities to distribute'); engine.complete(); return; }
          texts.sort((a, b) => b.position.y - a.position.y);
          const topY = texts[0].position.y;
          const botY = texts[texts.length - 1].position.y;
          const step = (topY - botY) / (texts.length - 1);
          for (let i = 0; i < texts.length; i++) {
            texts[i].position = { ...texts[i].position, y: topY - step * i };
          }
        } else {
          engine.prompt('Unknown option: ' + input);
          engine.complete();
          return;
        }
        store.clearSelection();
        store.emit();
        engine.prompt(`TEXTALIGN: ${texts.length} text(s) aligned (${opt})`);
        engine.complete();
      });
      return true;
    });
  });

  // === SCALETEXT ===
  engine.register('SCALETEXT', [], () => {
    engine.requireSelection((sel) => {
      const texts = sel.filter(e => e.type === 'text') as TextEntity[];
      if (texts.length === 0) { engine.prompt('No text entities selected'); engine.complete(); return; }
      engine.prompt('Enter new height or scale factor [Height/Scale] <Scale>:');
      engine.waitForInput('Option:', (input) => {
        const opt = input === '' ? 'SCALE' : input.toUpperCase();
        if (opt === 'SCALE' || opt === 'S') {
          engine.prompt('Enter scale factor <2>:');
          engine.waitForInput('Factor:', (val) => {
            const factor = val === '' ? 2 : parseFloat(val);
            if (isNaN(factor) || factor <= 0) { engine.prompt('Invalid scale factor'); engine.complete(); return true; }
            store.pushUndo('SCALETEXT');
            for (const t of texts) t.height *= factor;
            store.clearSelection();
            store.emit();
            engine.prompt(`SCALETEXT: ${texts.length} text(s) scaled by ${factor}x`);
            engine.complete();
            return true;
          });
        } else if (opt === 'HEIGHT' || opt === 'H') {
          engine.prompt('Enter new text height:');
          engine.waitForInput('Height:', (val) => {
            const h = parseFloat(val);
            if (isNaN(h) || h <= 0) { engine.prompt('Invalid height'); engine.complete(); return true; }
            store.pushUndo('SCALETEXT');
            for (const t of texts) t.height = h;
            store.clearSelection();
            store.emit();
            engine.prompt(`SCALETEXT: ${texts.length} text(s) set to height ${h}`);
            engine.complete();
            return true;
          });
        } else {
          const factor = parseFloat(opt);
          if (!isNaN(factor) && factor > 0) {
            store.pushUndo('SCALETEXT');
            for (const t of texts) t.height *= factor;
            store.clearSelection();
            store.emit();
            engine.prompt(`SCALETEXT: ${texts.length} text(s) scaled by ${factor}x`);
            engine.complete();
          } else {
            engine.prompt('Unknown option');
            engine.complete();
          }
        }
        return true;
      });
    });
  });
  // === HATCHEDIT ===
  engine.register('HATCHEDIT', ['HE'], () => {
    engine.requireSelection((sel) => {
      const hatches = sel.filter(e => e.type === 'hatch');
      if (hatches.length === 0) {
        engine.prompt('No hatch objects selected');
        engine.complete();
        return;
      }
      const hatch = hatches[0] as HatchEntity;
      engine.prompt(`HATCHEDIT Pattern: "${hatch.patternName}", Scale: ${hatch.patternScale}, Angle: ${hatch.patternAngle}`);
      engine.prompt('Edit property [Pattern/Scale/Angle]:');
      engine.inputHandler = (input) => {
        if (input === '') { engine.complete(); return true; }
        const opt = input.toLowerCase();
        if (opt === 'p' || opt === 'pattern') {
          engine.inputHandler = null;
          engine.prompt(`Enter new pattern name (current: "${hatch.patternName}"):`);
          engine.waitForInput('Pattern:', (val) => {
            if (val === '') { engine.complete(); return true; }
            store.pushUndo('HATCHEDIT');
            hatch.patternName = val;
            store.emit();
            engine.prompt(`Pattern set to "${val}"`);
            engine.complete();
            return true;
          });
          return true;
        } else if (opt === 's' || opt === 'scale') {
          engine.inputHandler = null;
          engine.prompt(`Enter new scale (current: ${hatch.patternScale}):`);
          engine.waitForInput('Scale:', (val) => {
            if (val === '') { engine.complete(); return true; }
            const num = parseFloat(val);
            if (isNaN(num) || num <= 0) { engine.prompt('Requires positive number'); engine.complete(); return true; }
            store.pushUndo('HATCHEDIT');
            hatch.patternScale = num;
            store.emit();
            engine.prompt(`Scale set to ${num}`);
            engine.complete();
            return true;
          });
          return true;
        } else if (opt === 'a' || opt === 'angle') {
          engine.inputHandler = null;
          engine.prompt(`Enter new angle (current: ${hatch.patternAngle}):`);
          engine.waitForInput('Angle:', (val) => {
            if (val === '') { engine.complete(); return true; }
            const num = parseFloat(val);
            if (isNaN(num)) { engine.prompt('Requires a number'); engine.complete(); return true; }
            store.pushUndo('HATCHEDIT');
            hatch.patternAngle = num;
            store.emit();
            engine.prompt(`Angle set to ${num}`);
            engine.complete();
            return true;
          });
          return true;
        }
        engine.prompt('Invalid option. [Pattern/Scale/Angle]:');
        return true;
      };
    });
  });

  // === QLEADER ===
  engine.register('QLEADER', ['QL'], () => {
    engine.prompt('QLEADER Specify first leader point:');
    engine.waitForClick((p1) => {
      engine.tempPoints = [p1];
      engine.prompt('Specify next point:');
      engine.onMove((p) => {
        engine.renderer.rubberBand = { start: p1, end: p };
      });
      engine.waitForClick((p2) => {
        engine.renderer.rubberBand = null;
        engine.onMove(() => {});
        engine.inputHandler = null;
        engine.prompt('Enter annotation text:');
        engine.waitForInput('Text:', (text) => {
          if (text === '') { engine.complete(); return true; }
          store.pushUndo('QLEADER');
          store.addEntity(makeEntity({
            type: 'line',
            start: { ...p1 },
            end: { ...p2 },
          } as any));
          store.addEntity(makeEntity({
            type: 'text',
            position: { x: p2.x + 2, y: p2.y },
            text: text,
            height: store.currentDimStyle.textHeight || 2.5,
            rotation: 0,
          } as any));
          store.emit();
          engine.prompt(`QLEADER created with text "${text}"`);
          engine.complete();
          return true;
        });
      });
    });
  });

  // === FIELD ===
  engine.register('FIELD', ['FI'], () => {
    engine.prompt('FIELD Select field type [Date/Count/Layer/Filename]:');
    engine.waitForInput('Field type:', (input) => {
      const opt = input.toLowerCase().trim();
      let fieldText = '';
      if (opt === 'date' || opt === 'd') {
        fieldText = new Date().toLocaleDateString();
      } else if (opt === 'count' || opt === 'c') {
        fieldText = `${store.entities.length} entities`;
      } else if (opt === 'layer' || opt === 'l') {
        fieldText = store.currentLayer().name;
      } else if (opt === 'filename' || opt === 'f') {
        fieldText = 'Drawing.dxf';
      } else {
        engine.prompt('Invalid field type. Use Date/Count/Layer/Filename.');
        engine.complete();
        return true;
      }
      engine.prompt(`Field value: "${fieldText}". Specify insertion point:`);
      engine.waitForClick((pos) => {
        store.pushUndo('FIELD');
        store.addEntity(makeEntity({
          type: 'text',
          position: { ...pos },
          text: fieldText,
          height: store.currentDimStyle.textHeight || 2.5,
          rotation: 0,
        } as any));
        store.emit();
        engine.prompt(`Field inserted: "${fieldText}"`);
        engine.complete();
      });
      return true;
    });
  });

}

function doAttrEdit(engine: CommandEngine, blockRef: BlockRefEntity, idx: number) {
  if (!blockRef.attributes || idx >= blockRef.attributes.length) {
    engine.prompt('All attributes processed');
    store.emit();
    engine.complete();
    return;
  }
  const attr = blockRef.attributes[idx];
  engine.prompt(`Attribute "${attr.tag}" current value: "${attr.value}". Enter new value (or Enter to keep):`);
  engine.waitForInput(`${attr.tag}:`, (newVal) => {
    if (newVal !== '') {
      store.pushUndo('ATTEDIT');
      attr.value = newVal;
      engine.prompt(`${attr.tag} set to "${newVal}"`);
    }
    doAttrEdit(engine, blockRef, idx + 1);
    return true;
  });
}
