import { store } from '../store';
import { CommandEngine } from './engine';

export function registerOptionsCommands(engine: CommandEngine) {

  engine.register('OPTIONS', ['OP'], () => {
    store.tool = 'options';

    function showOptions() {
      engine.prompt('--- Options ---');
      engine.prompt(`  Grid spacing: ${store.gridSpacing}  Grid visible: ${store.gridOn}`);
      engine.prompt(`  Snap to grid: ${store.snapToGrid}  Ortho: ${store.orthoOn}`);
      engine.prompt(`  Unit type: ${store.unitType}  Precision: ${store.unitPrecision}`);
      engine.prompt(`  Angle format: ${store.angleFormat}  Angle precision: ${store.anglePrecision}`);
      engine.prompt(`  LT Scale: ${store.ltScale}  Color: ${store.currentColor}`);
      engine.prompt(`  Text style: ${store.currentTextStyle}  Coord display: ${store.coordDisplayMode}`);
      engine.prompt(`  Dim style: ${store.currentDimStyle.name}  Arrow size: ${store.currentDimStyle.arrowSize}`);
      engine.prompt('Enter option [Grid/Precision/Ortho/Snap/LTscale/Color/Coordmode/Dimstyle]:');
    }

    showOptions();

    function optionsMenu() {
      engine.waitForInput('Option:', (input) => {
        const opt = input.toLowerCase();
        if (opt === '') { store.tool = 'idle'; engine.complete(); return true; }
        if (opt === 'grid' || opt === 'g') {
          engine.prompt(`Current grid spacing: ${store.gridSpacing}. Enter new value:`);
          engine.waitForInput('Grid spacing:', (val) => {
            const n = parseFloat(val);
            if (isNaN(n) || n <= 0) { engine.prompt('Invalid value'); }
            else { store.gridSpacing = n; store.emit(); engine.prompt(`Grid spacing set to ${n}`); }
            engine.prompt('Enter option [Grid/Precision/Ortho/Snap/LTscale/Color/Coordmode/Dimstyle]:');
            optionsMenu();
            return true;
          });
          return true;
        }
        if (opt === 'precision' || opt === 'p') {
          engine.prompt(`Current precision: ${store.unitPrecision}. Enter new value (0-8):`);
          engine.waitForInput('Precision:', (val) => {
            const n = parseInt(val);
            if (isNaN(n) || n < 0 || n > 8) { engine.prompt('Invalid value (0-8)'); }
            else { store.unitPrecision = n; engine.prompt(`Precision set to ${n}`); }
            engine.prompt('Enter option [Grid/Precision/Ortho/Snap/LTscale/Color/Coordmode/Dimstyle]:');
            optionsMenu();
            return true;
          });
          return true;
        }
        if (opt === 'ortho' || opt === 'o') {
          store.orthoOn = !store.orthoOn;
          store.emit();
          engine.prompt(`Ortho ${store.orthoOn ? 'ON' : 'OFF'}`);
          engine.prompt('Enter option [Grid/Precision/Ortho/Snap/LTscale/Color/Coordmode/Dimstyle]:');
          optionsMenu();
          return true;
        }
        if (opt === 'snap' || opt === 's') {
          store.snapToGrid = !store.snapToGrid;
          store.emit();
          engine.prompt(`Snap to grid ${store.snapToGrid ? 'ON' : 'OFF'}`);
          engine.prompt('Enter option [Grid/Precision/Ortho/Snap/LTscale/Color/Coordmode/Dimstyle]:');
          optionsMenu();
          return true;
        }
        if (opt === 'ltscale' || opt === 'lt') {
          engine.prompt(`Current LT scale: ${store.ltScale}. Enter new value:`);
          engine.waitForInput('LT Scale:', (val) => {
            const n = parseFloat(val);
            if (isNaN(n) || n <= 0) { engine.prompt('Must be a positive number'); }
            else { store.ltScale = n; store.emit(); engine.prompt(`LT scale set to ${n}`); }
            engine.prompt('Enter option [Grid/Precision/Ortho/Snap/LTscale/Color/Coordmode/Dimstyle]:');
            optionsMenu();
            return true;
          });
          return true;
        }
        if (opt === 'color' || opt === 'c') {
          engine.prompt(`Current color: ${store.currentColor}. Enter new color (hex or 'bylayer'):`);
          engine.waitForInput('Color:', (val) => {
            if (val === '') { /* keep current */ }
            else { store.currentColor = val.toLowerCase(); engine.prompt(`Color set to ${store.currentColor}`); }
            engine.prompt('Enter option [Grid/Precision/Ortho/Snap/LTscale/Color/Coordmode/Dimstyle]:');
            optionsMenu();
            return true;
          });
          return true;
        }
        if (opt === 'coordmode' || opt === 'cm') {
          const modes: Array<'cartesian' | 'polar' | 'off'> = ['cartesian', 'polar', 'off'];
          const idx = modes.indexOf(store.coordDisplayMode);
          store.coordDisplayMode = modes[(idx + 1) % modes.length];
          engine.prompt(`Coordinate display: ${store.coordDisplayMode}`);
          engine.prompt('Enter option [Grid/Precision/Ortho/Snap/LTscale/Color/Coordmode/Dimstyle]:');
          optionsMenu();
          return true;
        }
        if (opt === 'dimstyle' || opt === 'd') {
          engine.prompt(`Current dim style: ${store.currentDimStyle.name}`);
          engine.prompt(`  Text height: ${store.currentDimStyle.textHeight}  Arrow size: ${store.currentDimStyle.arrowSize}`);
          engine.prompt(`  Extension offset: ${store.currentDimStyle.extensionOffset}  Precision: ${store.currentDimStyle.precision}`);
          engine.prompt('Enter dim property [TextHeight/ArrowSize/Offset/Precision]:');
          engine.waitForInput('Dim property:', (dpInput) => {
            const dp = dpInput.toLowerCase();
            if (dp === 'textheight' || dp === 'th') {
              engine.prompt(`Text height <${store.currentDimStyle.textHeight}>:`);
              engine.waitForInput('Value:', (v) => {
                const n = parseFloat(v);
                if (!isNaN(n) && n > 0) { store.currentDimStyle.textHeight = n; engine.prompt(`Text height set to ${n}`); }
                engine.prompt('Enter option [Grid/Precision/Ortho/Snap/LTscale/Color/Coordmode/Dimstyle]:');
                optionsMenu();
                return true;
              });
            } else if (dp === 'arrowsize' || dp === 'as') {
              engine.prompt(`Arrow size <${store.currentDimStyle.arrowSize}>:`);
              engine.waitForInput('Value:', (v) => {
                const n = parseFloat(v);
                if (!isNaN(n) && n > 0) { store.currentDimStyle.arrowSize = n; engine.prompt(`Arrow size set to ${n}`); }
                engine.prompt('Enter option [Grid/Precision/Ortho/Snap/LTscale/Color/Coordmode/Dimstyle]:');
                optionsMenu();
                return true;
              });
            } else if (dp === 'offset' || dp === 'o') {
              engine.prompt(`Extension offset <${store.currentDimStyle.extensionOffset}>:`);
              engine.waitForInput('Value:', (v) => {
                const n = parseFloat(v);
                if (!isNaN(n) && n >= 0) { store.currentDimStyle.extensionOffset = n; engine.prompt(`Extension offset set to ${n}`); }
                engine.prompt('Enter option [Grid/Precision/Ortho/Snap/LTscale/Color/Coordmode/Dimstyle]:');
                optionsMenu();
                return true;
              });
            } else if (dp === 'precision' || dp === 'p') {
              engine.prompt(`Dim precision <${store.currentDimStyle.precision}>:`);
              engine.waitForInput('Value:', (v) => {
                const n = parseInt(v);
                if (!isNaN(n) && n >= 0 && n <= 8) { store.currentDimStyle.precision = n; engine.prompt(`Dim precision set to ${n}`); }
                engine.prompt('Enter option [Grid/Precision/Ortho/Snap/LTscale/Color/Coordmode/Dimstyle]:');
                optionsMenu();
                return true;
              });
            } else {
              engine.prompt('Unknown dim property');
              engine.prompt('Enter option [Grid/Precision/Ortho/Snap/LTscale/Color/Coordmode/Dimstyle]:');
              optionsMenu();
            }
            return true;
          });
          return true;
        }
        engine.prompt('Unknown option: ' + input);
        engine.prompt('Enter option [Grid/Precision/Ortho/Snap/LTscale/Color/Coordmode/Dimstyle]:');
        optionsMenu();
        return true;
      });
    }
    optionsMenu();
  });
}
