import { Entity } from '../types';
import { store } from '../store';
import { CommandEngine } from './engine';

export function registerPropertiesCommands(engine: CommandEngine) {

  engine.register('PROPERTIES', ['MO', 'PR'], () => {
    store.tool = 'properties';
    engine.requireSelection((sel) => {
      if (sel.length > 1) engine.prompt(`${sel.length} objects selected, showing first`);
      const e = sel[0];
      showProps(e);
      promptChange(e);
    });
  });

  function showProps(e: Entity) {
    engine.prompt(`--- ${e.type.toUpperCase()} ---`);
    engine.prompt(`  Layer: ${e.layer}  Color: ${e.color}  Linetype: ${e.linetype}  Lineweight: ${e.lineweight}`);
    switch (e.type) {
      case 'line':
        engine.prompt(`  Start: (${e.start.x.toFixed(4)}, ${e.start.y.toFixed(4)})`);
        engine.prompt(`  End: (${e.end.x.toFixed(4)}, ${e.end.y.toFixed(4)})`);
        break;
      case 'circle':
        engine.prompt(`  Center: (${e.center.x.toFixed(4)}, ${e.center.y.toFixed(4)})  Radius: ${e.radius.toFixed(4)}`);
        break;
      case 'arc':
        engine.prompt(`  Center: (${e.center.x.toFixed(4)}, ${e.center.y.toFixed(4)})  Radius: ${e.radius.toFixed(4)}`);
        engine.prompt(`  Start angle: ${(e.startAngle * 180 / Math.PI).toFixed(1)}°  End angle: ${(e.endAngle * 180 / Math.PI).toFixed(1)}°`);
        break;
      case 'polyline':
        engine.prompt(`  Vertices: ${e.points.length}  Closed: ${e.closed}`);
        break;
      case 'rect':
        engine.prompt(`  Corner1: (${e.corner1.x.toFixed(4)}, ${e.corner1.y.toFixed(4)})`);
        engine.prompt(`  Corner2: (${e.corner2.x.toFixed(4)}, ${e.corner2.y.toFixed(4)})`);
        break;
      case 'text':
        engine.prompt(`  Position: (${e.position.x.toFixed(4)}, ${e.position.y.toFixed(4)})  Height: ${e.height}  Style: ${e.textStyle || 'Standard'}  Text: "${e.text}"`);
        break;
      case 'ellipse':
        engine.prompt(`  Center: (${e.center.x.toFixed(4)}, ${e.center.y.toFixed(4)})  Ratio: ${e.ratio}`);
        break;
      case 'dimension':
        engine.prompt(`  Type: ${e.dimType}  P1: (${e.p1.x.toFixed(4)}, ${e.p1.y.toFixed(4)})  P2: (${e.p2.x.toFixed(4)}, ${e.p2.y.toFixed(4)})`);
        break;
      case 'point':
        engine.prompt(`  Position: (${e.position.x.toFixed(4)}, ${e.position.y.toFixed(4)})`);
        break;
    }
  }

  function promptChange(e: Entity) {
    engine.prompt('Enter property to change [Layer/Color/Linetype/Lineweight] or Enter to exit:');
    engine.waitForInput('Property:', (input) => {
      if (input === '') { engine.complete(); return true; }
      const prop = input.toUpperCase();
      if (prop === 'LAYER' || prop === 'LA') {
        const names = store.layers.map(l => l.name).join(', ');
        engine.prompt(`Available layers: ${names}`);
        engine.prompt('Enter new layer:');
        engine.waitForInput('Layer:', (val) => {
          if (!val.trim()) { promptChange(e); return true; }
          const layer = store.layers.find(l => l.name.toUpperCase() === val.toUpperCase());
          if (!layer) { engine.prompt('Layer not found: ' + val); promptChange(e); return true; }
          store.pushUndo('PROPERTIES');
          e.layer = layer.name;
          store.emit();
          engine.prompt(`Layer set to "${layer.name}"`);
          promptChange(e);
          return true;
        });
        return true;
      }
      if (prop === 'COLOR' || prop === 'COL') {
        engine.prompt('Enter new color (bylayer, 1-7, or hex #rrggbb):');
        engine.waitForInput('Color:', (val) => {
          if (!val.trim()) { promptChange(e); return true; }
          store.pushUndo('PROPERTIES');
          e.color = val.trim();
          store.emit();
          engine.prompt(`Color set to "${e.color}"`);
          promptChange(e);
          return true;
        });
        return true;
      }
      if (prop === 'LINETYPE' || prop === 'LT') {
        engine.prompt('Enter new linetype (continuous, dashed, hidden, center, dashdot, phantom, dot, border, divide):');
        engine.waitForInput('Linetype:', (val) => {
          if (!val.trim()) { promptChange(e); return true; }
          store.pushUndo('PROPERTIES');
          e.linetype = val.trim().toLowerCase();
          store.emit();
          engine.prompt(`Linetype set to "${e.linetype}"`);
          promptChange(e);
          return true;
        });
        return true;
      }
      if (prop === 'LINEWEIGHT' || prop === 'LW') {
        engine.prompt(`Current lineweight: ${e.lineweight}. Enter new lineweight:`);
        engine.waitForInput('Lineweight:', (val) => {
          const n = parseFloat(val);
          if (isNaN(n) || n < 0) { engine.prompt('Invalid lineweight'); promptChange(e); return true; }
          store.pushUndo('PROPERTIES');
          e.lineweight = n;
          store.emit();
          engine.prompt(`Lineweight set to ${n}`);
          promptChange(e);
          return true;
        });
        return true;
      }
      engine.prompt('Unknown property: ' + input);
      promptChange(e);
      return true;
    });
  }
}
