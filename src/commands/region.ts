import { Point, Entity, RegionEntity } from '../types';
import { store } from '../store';
import { polarPoint, pointOnEntity } from '../geometry';
import { CommandEngine } from './engine';
import { makeEntity } from './helpers';
import { polygonUnion, polygonIntersect, polygonSubtract, polygonArea } from '../boundary';

function entityToBoundaryPts(e: Entity): Point[] | null {
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
      for (let i = 0; i < 72; i++) {
        const a = (2 * Math.PI * i) / 72;
        pts.push(polarPoint(e.center, e.radius, a));
      }
      return pts;
    }
    case 'region':
      return e.outerBoundary.map(p => ({ ...p }));
    default:
      return null;
  }
}

export function registerRegionCommands(engine: CommandEngine) {

  engine.register('REGION', ['REG'], () => {
    store.tool = 'region';
    engine.requireSelection((sel) => {
      let count = 0;
      store.pushUndo('REGION');
      for (const e of sel) {
        const pts = entityToBoundaryPts(e);
        if (!pts) continue;
        if (e.type === 'region') continue;
        store.addEntity(makeEntity({
          type: 'region',
          outerBoundary: pts,
          holes: [],
        } as any));
        store.removeEntity(e.id);
        count++;
      }
      store.clearSelection();
      store.tool = 'idle';
      if (count > 0) {
        engine.prompt(`${count} region(s) created`);
      } else {
        engine.prompt('No valid closed shapes found (need closed polyline, rect, or circle)');
      }
      engine.complete();
    });
  });

  engine.register('UNION', ['UNI'], () => {
    engine.prompt('UNION Select first region or closed shape:');
    engine.waitForClick((pt1) => {
      const tol = 10 / store.view.zoom;
      const e1 = store.entities.find(e => e.visible && pointOnEntity(pt1, e, tol));
      if (!e1) { engine.prompt('No object found'); engine.complete(); return; }
      const pts1 = entityToBoundaryPts(e1);
      if (!pts1) { engine.prompt('Object is not a closed shape'); engine.complete(); return; }

      engine.prompt('Select second region or closed shape:');
      engine.waitForClick((pt2) => {
        const e2 = store.entities.find(e => e.visible && e.id !== e1.id && pointOnEntity(pt2, e, tol));
        if (!e2) { engine.prompt('No object found'); engine.complete(); return; }
        const pts2 = entityToBoundaryPts(e2);
        if (!pts2) { engine.prompt('Object is not a closed shape'); engine.complete(); return; }

        const results = polygonUnion(pts1, pts2);
        if (results.length === 0) {
          engine.prompt('Union failed — shapes may not overlap');
          engine.complete();
          return;
        }

        store.pushUndo('UNION');
        store.removeEntity(e1.id);
        store.removeEntity(e2.id);
        for (const poly of results) {
          store.addEntity(makeEntity({
            type: 'region',
            outerBoundary: poly,
            holes: [],
          } as any));
        }
        store.emit();
        engine.prompt(`Union complete: ${results.length} region(s) created`);
        engine.complete();
      });
    });
  });

  engine.register('SUBTRACT', ['SU'], () => {
    engine.prompt('SUBTRACT Select region to subtract from:');
    engine.waitForClick((pt1) => {
      const tol = 10 / store.view.zoom;
      const e1 = store.entities.find(e => e.visible && pointOnEntity(pt1, e, tol));
      if (!e1) { engine.prompt('No object found'); engine.complete(); return; }
      const pts1 = entityToBoundaryPts(e1);
      if (!pts1) { engine.prompt('Object is not a closed shape'); engine.complete(); return; }

      engine.prompt('Select region to subtract:');
      engine.waitForClick((pt2) => {
        const e2 = store.entities.find(e => e.visible && e.id !== e1.id && pointOnEntity(pt2, e, tol));
        if (!e2) { engine.prompt('No object found'); engine.complete(); return; }
        const pts2 = entityToBoundaryPts(e2);
        if (!pts2) { engine.prompt('Object is not a closed shape'); engine.complete(); return; }

        const results = polygonSubtract(pts1, pts2);
        if (results.length === 0) {
          engine.prompt('Subtract result is empty — shape fully contained');
          store.pushUndo('SUBTRACT');
          store.removeEntity(e1.id);
          store.removeEntity(e2.id);
          store.emit();
          engine.complete();
          return;
        }

        store.pushUndo('SUBTRACT');
        store.removeEntity(e1.id);
        store.removeEntity(e2.id);

        const outer = results[0];
        const holes = results.slice(1);
        store.addEntity(makeEntity({
          type: 'region',
          outerBoundary: outer,
          holes,
        } as any));
        store.emit();
        engine.prompt('Subtract complete');
        engine.complete();
      });
    });
  });

  engine.register('INTERSECT', ['IN'], () => {
    engine.prompt('INTERSECT Select first region or closed shape:');
    engine.waitForClick((pt1) => {
      const tol = 10 / store.view.zoom;
      const e1 = store.entities.find(e => e.visible && pointOnEntity(pt1, e, tol));
      if (!e1) { engine.prompt('No object found'); engine.complete(); return; }
      const pts1 = entityToBoundaryPts(e1);
      if (!pts1) { engine.prompt('Object is not a closed shape'); engine.complete(); return; }

      engine.prompt('Select second region or closed shape:');
      engine.waitForClick((pt2) => {
        const e2 = store.entities.find(e => e.visible && e.id !== e1.id && pointOnEntity(pt2, e, tol));
        if (!e2) { engine.prompt('No object found'); engine.complete(); return; }
        const pts2 = entityToBoundaryPts(e2);
        if (!pts2) { engine.prompt('Object is not a closed shape'); engine.complete(); return; }

        const results = polygonIntersect(pts1, pts2);
        if (results.length === 0) {
          engine.prompt('Intersect result is empty — shapes do not overlap');
          engine.complete();
          return;
        }

        store.pushUndo('INTERSECT');
        store.removeEntity(e1.id);
        store.removeEntity(e2.id);
        for (const poly of results) {
          store.addEntity(makeEntity({
            type: 'region',
            outerBoundary: poly,
            holes: [],
          } as any));
        }
        store.emit();
        engine.prompt(`Intersect complete: ${results.length} region(s) created`);
        engine.complete();
      });
    });
  });
}
