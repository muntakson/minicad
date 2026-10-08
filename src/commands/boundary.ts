import { store } from '../store';
import { CommandEngine } from './engine';
import { makeEntity } from './helpers';
import { detectBoundary } from '../boundary';

export function registerBoundaryCommands(engine: CommandEngine) {

  engine.register('BOUNDARY', ['BO'], () => {
    store.tool = 'boundary';
    engine.prompt('BOUNDARY Pick internal point:');

    const pickAnother = () => {
      engine.waitForClick((pt) => {
        engine.prompt('Detecting boundary...');
        const boundary = detectBoundary(pt, store.entities);
        if (!boundary || boundary.length < 3) {
          engine.prompt('Could not detect a closed boundary at that point. Pick another point or press Enter to exit:');
          engine.inputHandler = (input) => {
            if (input === '') {
              store.tool = 'idle';
              engine.complete();
              return true;
            }
            return false;
          };
          pickAnother();
          return;
        }
        store.pushUndo('BOUNDARY');
        store.addEntity(makeEntity({
          type: 'polyline',
          points: boundary.map(p => ({ ...p })),
          bulges: boundary.map(() => 0),
          closed: true,
        } as any));
        engine.prompt(`Boundary created: ${boundary.length} vertices. Pick another internal point or press Enter to exit:`);
        engine.inputHandler = (input) => {
          if (input === '') {
            store.tool = 'idle';
            engine.complete();
            return true;
          }
          return false;
        };
        pickAnother();
      });
    };

    pickAnother();
  });

  // === BPOLY ===
  engine.register('BPOLY', ['BP'], () => {
    store.tool = 'boundary';
    engine.prompt('BPOLY Pick internal point:');

    const pickAnother2 = () => {
      engine.waitForClick((pt) => {
        engine.prompt('Detecting boundary...');
        const boundary = detectBoundary(pt, store.entities);
        if (!boundary || boundary.length < 3) {
          engine.prompt('BPOLY Could not find closed boundary at that point. Pick another point or press Enter to exit:');
          engine.inputHandler = (input) => {
            if (input === '') {
              store.tool = 'idle';
              engine.complete();
              return true;
            }
            return false;
          };
          pickAnother2();
          return;
        }
        store.pushUndo('BPOLY');
        store.addEntity(makeEntity({
          type: 'polyline',
          points: boundary.map(p => ({ ...p })),
          bulges: boundary.map(() => 0),
          closed: true,
        } as any));
        store.emit();
        engine.prompt(`BPOLY Boundary polyline created with ${boundary.length} vertices. Pick another point or press Enter to exit:`);
        engine.inputHandler = (input) => {
          if (input === '') {
            store.tool = 'idle';
            engine.complete();
            return true;
          }
          return false;
        };
        pickAnother2();
      });
    };

    pickAnother2();
  });
}
