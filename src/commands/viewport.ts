import { store } from '../store';
import { CommandEngine } from './engine';
import { makeEntity } from './helpers';

export function registerViewportCommands(engine: CommandEngine) {

  // === PLAN ===
  engine.register('PLAN', [], () => {
    (store as any).viewRotation = 0;
    store.emit();
    engine.prompt('PLAN View set to World UCS plan view');
    engine.complete();
  });

  // === DVIEW ===
  engine.register('DVIEW', [], () => {
    engine.prompt('DVIEW Enter option [Camera/Target/Distance/Twist/Zoom] <Zoom>:');
    engine.waitForInput('Option:', (input) => {
      const opt = input.toLowerCase();
      if (opt === 'camera' || opt === 'ca') {
        engine.prompt('2D mode: Camera angle not applicable');
        engine.complete();
        return true;
      }
      if (opt === 'target') {
        engine.prompt('2D mode: Target point set to origin');
        engine.complete();
        return true;
      }
      if (opt === 'distance') {
        engine.prompt('Enter distance:');
        engine.waitForInput('Distance:', (val) => {
          const d = parseFloat(val);
          if (isNaN(d)) { engine.prompt('Invalid distance'); engine.complete(); return true; }
          (store as any).viewDistance = d;
          engine.prompt(`View distance set to ${d}`);
          engine.complete();
          return true;
        });
        return true;
      }
      if (opt === 'twist' || opt === 'tw') {
        engine.prompt('Enter twist angle:');
        engine.waitForInput('Angle:', (val) => {
          const a = parseFloat(val);
          if (isNaN(a)) { engine.prompt('Invalid angle'); engine.complete(); return true; }
          (store as any).viewRotation = a;
          store.emit();
          engine.prompt(`View twist set to ${a} degrees`);
          engine.complete();
          return true;
        });
        return true;
      }
      // zoom (default)
      engine.prompt('Enter zoom factor:');
      engine.waitForInput('Factor:', (val) => {
        const f = parseFloat(val);
        if (isNaN(f) || f <= 0) { engine.prompt('Invalid zoom factor'); engine.complete(); return true; }
        store.view.zoom *= f;
        store.view.zoom = Math.max(0.01, Math.min(1000, store.view.zoom));
        store.emit();
        engine.prompt(`Zoom set to ${f}x`);
        engine.complete();
        return true;
      });
      return true;
    });
  });

  // === DDVPOINT ===
  engine.register('DDVPOINT', [], () => {
    engine.prompt('DDVPOINT Set view direction. Enter XY angle <0>:');
    engine.waitForInput('Angle:', (input) => {
      const a = input === '' ? 0 : parseFloat(input);
      if (isNaN(a)) { engine.prompt('Invalid angle'); engine.complete(); return true; }
      (store as any).viewRotation = a;
      store.emit();
      engine.prompt(`View angle set to ${a} degrees`);
      engine.complete();
      return true;
    });
  });

  // === MVIEW ===
  engine.register('MVIEW', ['MV'], () => {
    engine.prompt('MVIEW Specify corner of viewport or [ON/OFF/Fit/Lock] <Fit>:');
    engine.waitForInput('Option:', (input) => {
      const opt = input.toLowerCase();
      if (opt === 'fit' || opt === 'f' || opt === '') {
        engine.prompt('Viewport fitted to layout');
        engine.complete();
        return true;
      }
      if (opt === 'on') {
        (store as any).mviewActive = true;
        engine.prompt('Viewports ON');
        engine.complete();
        return true;
      }
      if (opt === 'off') {
        (store as any).mviewActive = false;
        engine.prompt('Viewports OFF');
        engine.complete();
        return true;
      }
      if (opt === 'lock' || opt === 'l') {
        (store as any).mviewLocked = true;
        engine.prompt('Viewport locked');
        engine.complete();
        return true;
      }
      // coordinate input — treat as first corner
      engine.prompt('Specify first corner of viewport:');
      engine.waitForClick((p1) => {
        engine.prompt('Specify opposite corner:');
        engine.onMove((p) => {
          engine.renderer.selectionBox = { p1, p2: p };
        });
        engine.waitForClick((p2) => {
          engine.renderer.selectionBox = null;
          store.pushUndo('MVIEW');
          store.addEntity(makeEntity({
            type: 'rect',
            x: Math.min(p1.x, p2.x),
            y: Math.min(p1.y, p2.y),
            width: Math.abs(p2.x - p1.x),
            height: Math.abs(p2.y - p1.y),
          } as any));
          store.emit();
          engine.prompt('Viewport created');
          engine.complete();
        });
      });
      return true;
    });
  });

  // === VPCLIP ===
  engine.register('VPCLIP', [], () => {
    engine.requireSelection((sel) => {
      const rects = sel.filter(e => e.type === 'rect');
      if (rects.length === 0) {
        engine.prompt('No viewports selected');
        engine.complete();
        return;
      }
      const rect = rects[0];
      engine.prompt('VPCLIP Select clipping option [Delete/Polygonal] <Delete>:');
      engine.waitForInput('Option:', (input) => {
        const opt = input.toLowerCase();
        if (opt === 'polygonal' || opt === 'p') {
          (rect as any).vpClipped = true;
          store.emit();
          engine.prompt('Viewport clipped');
        } else {
          delete (rect as any).vpClipped;
          store.emit();
          engine.prompt('Viewport clip removed');
        }
        engine.complete();
        return true;
      });
    });
  });

  // === MSPACE ===
  engine.register('MSPACE', ['MS'], () => {
    (store as any).currentSpace = 'model';
    store.emit();
    engine.prompt('MSPACE Switched to Model space');
    engine.complete();
  });

  // === PSPACE ===
  engine.register('PSPACE', ['PS'], () => {
    (store as any).currentSpace = 'paper';
    store.emit();
    engine.prompt('PSPACE Switched to Paper space');
    engine.complete();
  });

  // === CHSPACE ===
  engine.register('CHSPACE', [], () => {
    engine.requireSelection((sel) => {
      if (sel.length === 0) {
        engine.prompt('No entities selected');
        engine.complete();
        return;
      }
      const currentSpace = (store as any).currentSpace || 'model';
      const targetSpace = currentSpace === 'model' ? 'paper' : 'model';
      store.pushUndo('CHSPACE');
      for (const e of sel) {
        (e as any).space = targetSpace;
        e.selected = false;
      }
      store.clearSelection();
      store.emit();
      engine.prompt(`CHSPACE ${sel.length} entity(ies) moved to ${targetSpace} space`);
      engine.complete();
    });
  });

  // === UCS ===
  engine.register('UCS', [], () => {
    engine.prompt('UCS Enter option [New/Move/Restore/Save/Delete/World/?] <World>:');
    engine.waitForInput('Option:', (input) => {
      const opt = input.toLowerCase();
      if (!((store as any).savedUCS instanceof Map)) {
        (store as any).savedUCS = new Map<string, { origin: { x: number; y: number }; angle: number }>();
      }
      const savedUCS = (store as any).savedUCS as Map<string, { origin: { x: number; y: number }; angle: number }>;

      if (opt === 'world' || opt === 'w' || opt === '') {
        (store as any).ucsOrigin = { x: 0, y: 0 };
        (store as any).ucsAngle = 0;
        store.emit();
        engine.prompt('UCS set to World');
        engine.complete();
        return true;
      }
      if (opt === 'new' || opt === 'n') {
        engine.prompt('Specify new origin point:');
        engine.waitForClick((pt) => {
          (store as any).ucsOrigin = { x: pt.x, y: pt.y };
          engine.prompt('Specify rotation angle <0>:');
          engine.waitForInput('Angle:', (val) => {
            const a = val === '' ? 0 : parseFloat(val);
            if (isNaN(a)) { engine.prompt('Invalid angle'); engine.complete(); return true; }
            (store as any).ucsAngle = a;
            store.emit();
            engine.prompt(`UCS defined at (${pt.x.toFixed(2)}, ${pt.y.toFixed(2)}) angle ${a}`);
            engine.complete();
            return true;
          });
        });
        return true;
      }
      if (opt === 'move' || opt === 'm') {
        engine.prompt('Specify new origin:');
        engine.waitForClick((pt) => {
          (store as any).ucsOrigin = { x: pt.x, y: pt.y };
          store.emit();
          engine.prompt(`UCS origin moved to (${pt.x.toFixed(2)}, ${pt.y.toFixed(2)})`);
          engine.complete();
        });
        return true;
      }
      if (opt === 'save' || opt === 's') {
        engine.prompt('Enter name for UCS:');
        engine.waitForInput('Name:', (name) => {
          if (!name) { engine.complete(); return true; }
          savedUCS.set(name, {
            origin: { ...((store as any).ucsOrigin || { x: 0, y: 0 }) },
            angle: (store as any).ucsAngle || 0,
          });
          engine.prompt(`UCS "${name}" saved`);
          engine.complete();
          return true;
        });
        return true;
      }
      if (opt === 'restore' || opt === 'r') {
        if (savedUCS.size > 0) {
          engine.prompt(`Available: ${[...savedUCS.keys()].join(', ')}`);
        }
        engine.prompt('Enter name to restore:');
        engine.waitForInput('Name:', (name) => {
          const ucs = savedUCS.get(name);
          if (!ucs) { engine.prompt(`UCS "${name}" not found`); engine.complete(); return true; }
          (store as any).ucsOrigin = { ...ucs.origin };
          (store as any).ucsAngle = ucs.angle;
          store.emit();
          engine.prompt(`UCS "${name}" restored`);
          engine.complete();
          return true;
        });
        return true;
      }
      if (opt === 'delete' || opt === 'd') {
        engine.prompt('Enter name to delete:');
        engine.waitForInput('Name:', (name) => {
          if (savedUCS.delete(name)) {
            engine.prompt(`UCS "${name}" deleted`);
          } else {
            engine.prompt(`UCS "${name}" not found`);
          }
          engine.complete();
          return true;
        });
        return true;
      }
      if (opt === '?') {
        if (savedUCS.size === 0) {
          engine.prompt('No saved UCS definitions');
        } else {
          for (const [name, ucs] of savedUCS) {
            engine.prompt(`  "${name}" origin=(${ucs.origin.x.toFixed(2)}, ${ucs.origin.y.toFixed(2)}) angle=${ucs.angle}`);
          }
        }
        engine.complete();
        return true;
      }
      engine.prompt('Invalid option');
      engine.complete();
      return true;
    });
  });

  // === UCSMAN ===
  engine.register('UCSMAN', [], () => {
    if (!((store as any).savedUCS instanceof Map)) {
      (store as any).savedUCS = new Map();
    }
    const savedUCS = (store as any).savedUCS as Map<string, { origin: { x: number; y: number }; angle: number }>;
    const origin = (store as any).ucsOrigin || { x: 0, y: 0 };
    const angle = (store as any).ucsAngle || 0;
    engine.prompt(`UCSMAN Current UCS: origin=(${origin.x.toFixed(2)}, ${origin.y.toFixed(2)}) angle=${angle}`);
    if (savedUCS.size === 0) {
      engine.prompt('No saved UCS definitions');
    } else {
      engine.prompt(`Saved UCS (${savedUCS.size}):`);
      for (const [name, ucs] of savedUCS) {
        engine.prompt(`  "${name}" origin=(${ucs.origin.x.toFixed(2)}, ${ucs.origin.y.toFixed(2)}) angle=${ucs.angle}`);
      }
    }
    engine.complete();
  });

  // === SHAPE ===
  engine.register('SHAPE', ['SHP'], () => {
    engine.prompt('SHAPE Enter shape name or [?]:');
    engine.waitForInput('Shape:', (input) => {
      const name = input.toUpperCase();
      const shapes: Record<string, (center: { x: number; y: number }, size: number) => { x: number; y: number }[]> = {
        BOX: (c, s) => {
          const h = s / 2;
          return [
            { x: c.x - h, y: c.y - h }, { x: c.x + h, y: c.y - h },
            { x: c.x + h, y: c.y + h }, { x: c.x - h, y: c.y + h },
          ];
        },
        TRIANGLE: (c, s) => {
          const h = s * Math.sqrt(3) / 3;
          return [
            { x: c.x, y: c.y + h * 2 / Math.sqrt(3) * Math.sqrt(3) / 2 },
            { x: c.x - s / 2, y: c.y - h / 2 },
            { x: c.x + s / 2, y: c.y - h / 2 },
          ];
        },
        DIAMOND: (c, s) => {
          const h = s / 2;
          return [
            { x: c.x, y: c.y + h }, { x: c.x + h, y: c.y },
            { x: c.x, y: c.y - h }, { x: c.x - h, y: c.y },
          ];
        },
        CROSS: (c, s) => {
          const t = s / 4, h = s / 2;
          return [
            { x: c.x - t, y: c.y + h }, { x: c.x + t, y: c.y + h },
            { x: c.x + t, y: c.y + t }, { x: c.x + h, y: c.y + t },
            { x: c.x + h, y: c.y - t }, { x: c.x + t, y: c.y - t },
            { x: c.x + t, y: c.y - h }, { x: c.x - t, y: c.y - h },
            { x: c.x - t, y: c.y - t }, { x: c.x - h, y: c.y - t },
            { x: c.x - h, y: c.y + t }, { x: c.x - t, y: c.y + t },
          ];
        },
        ARROW: (c, s) => {
          const h = s / 2, t = s / 4;
          return [
            { x: c.x - h, y: c.y + t }, { x: c.x, y: c.y + t },
            { x: c.x, y: c.y + h }, { x: c.x + h, y: c.y },
            { x: c.x, y: c.y - h }, { x: c.x, y: c.y - t },
            { x: c.x - h, y: c.y - t },
          ];
        },
      };

      if (name === '?') {
        engine.prompt('Available shapes: BOX, TRIANGLE, DIAMOND, CROSS, ARROW');
        engine.complete();
        return true;
      }

      const shapeFn = shapes[name];
      if (!shapeFn) {
        engine.prompt(`Shape "${input}" not found. Use ? to list available shapes.`);
        engine.complete();
        return true;
      }

      engine.prompt('Specify insertion point:');
      engine.waitForClick((pt) => {
        engine.prompt('Specify size <10>:');
        engine.waitForInput('Size:', (sizeStr) => {
          const size = sizeStr === '' ? 10 : parseFloat(sizeStr);
          if (isNaN(size) || size <= 0) { engine.prompt('Invalid size'); engine.complete(); return true; }
          const points = shapeFn(pt, size);
          store.pushUndo('SHAPE');
          store.addEntity(makeEntity({
            type: 'polyline',
            points,
            bulges: points.map(() => 0),
            closed: true,
          } as any));
          store.emit();
          engine.prompt(`Shape '${name}' inserted`);
          engine.complete();
          return true;
        });
      });
      return true;
    });
  });

}
