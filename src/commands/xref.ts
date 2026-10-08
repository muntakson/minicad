import { store } from '../store';
import { CommandEngine } from './engine';
import { makeEntity } from './helpers';

export function registerXrefCommands(engine: CommandEngine) {

  // === XREF ===
  engine.register('XREF', ['XR'], () => {
    if (!(store as any).xrefs) (store as any).xrefs = new Set<string>();
    engine.prompt('XREF [Attach/Detach/Reload/List] <List>:');
    engine.waitForInput('Option:', (input) => {
      const opt = input.toLowerCase();
      if (opt === 'a' || opt === 'attach') {
        engine.prompt('Enter xref name:');
        engine.waitForInput('Name:', (name) => {
          if (!name) { engine.complete(); return true; }
          if (store.blockDefs && store.blockDefs.has(name)) {
            (store as any).xrefs.add(name);
            engine.prompt(`Xref '${name}' attached`);
          } else {
            engine.prompt(`Xref '${name}' not found in block definitions`);
          }
          engine.complete();
          return true;
        });
        return true;
      }
      if (opt === 'd' || opt === 'detach') {
        engine.prompt('Enter xref name to detach:');
        engine.waitForInput('Name:', (name) => {
          if ((store as any).xrefs.delete(name)) {
            engine.prompt(`Xref '${name}' detached`);
          } else {
            engine.prompt(`Xref '${name}' not found`);
          }
          engine.complete();
          return true;
        });
        return true;
      }
      if (opt === 'r' || opt === 'reload') {
        engine.prompt('All xrefs reloaded');
        engine.complete();
        return true;
      }
      // list (default)
      const xrefs = (store as any).xrefs as Set<string>;
      if (xrefs.size === 0) {
        engine.prompt('No xrefs loaded');
      } else {
        for (const name of xrefs) {
          engine.prompt(`  ${name}`);
        }
      }
      engine.complete();
      return true;
    });
  });

  // === XBIND ===
  engine.register('XBIND', ['XB'], () => {
    if (!(store as any).boundSymbols) (store as any).boundSymbols = new Set<string>();
    engine.prompt('XBIND Enter symbol name to bind:');
    engine.waitForInput('Symbol:', (name) => {
      if (!name) { engine.complete(); return true; }
      (store as any).boundSymbols.add(name);
      engine.prompt(`Symbol '${name}' bound to drawing`);
      engine.complete();
      return true;
    });
  });

  // === XCLIP ===
  engine.register('XCLIP', [], () => {
    engine.requireSelection((sel) => {
      const blockrefs = sel.filter(e => e.type === 'blockref');
      if (blockrefs.length === 0) {
        engine.prompt('No block references selected');
        engine.complete();
        return;
      }
      const br = blockrefs[0];
      engine.prompt('XCLIP Select clipping option [ON/OFF/Delete] <ON>:');
      engine.waitForInput('Option:', (input) => {
        const opt = input.toLowerCase();
        if (opt === 'off') {
          (br as any).clipped = false;
          store.emit();
          engine.prompt('XCLIP clipping OFF');
        } else if (opt === 'delete' || opt === 'd') {
          delete (br as any).clipped;
          store.emit();
          engine.prompt('XCLIP clipping boundary deleted');
        } else {
          (br as any).clipped = true;
          store.emit();
          engine.prompt('XCLIP clipping ON');
        }
        engine.complete();
        return true;
      });
    });
  });

  // === IMAGEATTACH ===
  engine.register('IMAGEATTACH', ['IAT'], () => {
    engine.prompt('IMAGEATTACH Enter image name (or path):');
    engine.waitForInput('Name:', (name) => {
      if (!name) { engine.complete(); return true; }
      engine.prompt('Specify insertion point:');
      engine.waitForClick((pt) => {
        engine.prompt('Specify width <100>:');
        engine.waitForInput('Width:', (wVal) => {
          const w = wVal === '' ? 100 : parseFloat(wVal);
          if (isNaN(w) || w <= 0) {
            engine.prompt('Invalid width');
            engine.complete();
            return true;
          }
          store.pushUndo('IMAGEATTACH');
          const ent = makeEntity({
            type: 'rect',
            origin: { x: pt.x, y: pt.y },
            width: w,
            height: w * 0.75,
          } as any);
          (ent as any).imageName = name;
          store.addEntity(ent);
          store.emit();
          engine.prompt(`Image placeholder '${name}' attached`);
          engine.complete();
          return true;
        });
      });
      return true;
    });
  });

  // === IMAGEADJUST ===
  engine.register('IMAGEADJUST', ['IAD'], () => {
    engine.requireSelection((sel) => {
      if (sel.length === 0) {
        engine.prompt('No entities selected');
        engine.complete();
        return;
      }
      const ent = sel[0];
      engine.prompt('IMAGEADJUST Enter option [Brightness/Contrast/Fade] <Brightness>:');
      engine.waitForInput('Option:', (input) => {
        const opt = input.toLowerCase();
        let prop = 'imgBrightness';
        let label = 'Brightness';
        if (opt === 'c' || opt === 'contrast') { prop = 'imgContrast'; label = 'Contrast'; }
        else if (opt === 'f' || opt === 'fade') { prop = 'imgFade'; label = 'Fade'; }
        engine.prompt(`Enter ${label} value (0-100) <50>:`);
        engine.waitForInput('Value:', (val) => {
          const num = val === '' ? 50 : parseFloat(val);
          if (isNaN(num) || num < 0 || num > 100) {
            engine.prompt('Value must be between 0 and 100');
            engine.complete();
            return true;
          }
          store.pushUndo('IMAGEADJUST');
          (ent as any)[prop] = num;
          store.emit();
          engine.prompt(`${label} set to ${num}`);
          engine.complete();
          return true;
        });
        return true;
      });
    });
  });

  // === IMAGECLIP ===
  engine.register('IMAGECLIP', ['ICL'], () => {
    engine.requireSelection((sel) => {
      if (sel.length === 0) {
        engine.prompt('No entities selected');
        engine.complete();
        return;
      }
      const ent = sel[0];
      engine.prompt('IMAGECLIP [ON/OFF] <ON>:');
      engine.waitForInput('Option:', (input) => {
        const opt = input.toLowerCase();
        store.pushUndo('IMAGECLIP');
        if (opt === 'off') {
          (ent as any).imageClipped = false;
          engine.prompt('Image clipping OFF');
        } else {
          (ent as any).imageClipped = true;
          engine.prompt('Image clipping ON');
        }
        store.emit();
        engine.complete();
        return true;
      });
    });
  });

  // === IMAGEFRAME ===
  engine.register('IMAGEFRAME', [], () => {
    engine.prompt('IMAGEFRAME Enter new value [0/1/2] <1>:');
    engine.waitForInput('Value:', (input) => {
      const val = input === '' ? 1 : parseInt(input);
      if (isNaN(val) || val < 0 || val > 2) {
        engine.prompt('Value must be 0, 1, or 2');
        engine.complete();
        return true;
      }
      (store as any).imageFrame = val;
      engine.prompt(`IMAGEFRAME set to ${val}`);
      engine.complete();
      return true;
    });
  });

  // === TABLE ===
  engine.register('TABLE', ['TB'], () => {
    engine.prompt('TABLE Enter number of rows <3>:');
    engine.waitForInput('Rows:', (rVal) => {
      const rows = rVal === '' ? 3 : parseInt(rVal);
      if (isNaN(rows) || rows < 1) {
        engine.prompt('Invalid row count');
        engine.complete();
        return true;
      }
      engine.prompt('Enter number of columns <3>:');
      engine.waitForInput('Columns:', (cVal) => {
        const cols = cVal === '' ? 3 : parseInt(cVal);
        if (isNaN(cols) || cols < 1) {
          engine.prompt('Invalid column count');
          engine.complete();
          return true;
        }
        engine.prompt('Specify insertion point:');
        engine.waitForClick((pt) => {
          const lines: string[] = [];
          const header = Array.from({ length: cols }, (_, c) => `Col${c + 1}`).join(' | ');
          lines.push(header);
          lines.push(Array.from({ length: cols }, () => '---').join(' | '));
          for (let r = 1; r <= rows; r++) {
            lines.push(Array.from({ length: cols }, (_, c) => `R${r}C${c + 1}`).join(' | '));
          }
          store.pushUndo('TABLE');
          store.addEntity(makeEntity({
            type: 'text',
            position: { x: pt.x, y: pt.y },
            text: lines.join('\n'),
            height: ((store as any).tableStyle?.textHeight) || 2.5,
            rotation: 0,
          } as any));
          store.emit();
          engine.prompt(`Table created (${rows}x${cols})`);
          engine.complete();
        });
        return true;
      });
      return true;
    });
  });

  // === TABLESTYLE ===
  engine.register('TABLESTYLE', ['TS'], () => {
    if (!(store as any).tableStyle) {
      (store as any).tableStyle = { textHeight: 2.5, cellWidth: 30, cellHeight: 10 };
    }
    const ts = (store as any).tableStyle;
    engine.prompt('TABLESTYLE Enter option [TextHeight/CellWidth/CellHeight/List] <List>:');
    engine.waitForInput('Option:', (input) => {
      const opt = input.toLowerCase();
      if (opt === 'textheight' || opt === 'th') {
        engine.prompt(`Enter text height <${ts.textHeight}>:`);
        engine.waitForInput('Height:', (val) => {
          const num = val === '' ? ts.textHeight : parseFloat(val);
          if (isNaN(num) || num <= 0) { engine.prompt('Invalid value'); engine.complete(); return true; }
          ts.textHeight = num;
          engine.prompt(`Table text height set to ${num}`);
          engine.complete();
          return true;
        });
        return true;
      }
      if (opt === 'cellwidth' || opt === 'cw') {
        engine.prompt(`Enter cell width <${ts.cellWidth}>:`);
        engine.waitForInput('Width:', (val) => {
          const num = val === '' ? ts.cellWidth : parseFloat(val);
          if (isNaN(num) || num <= 0) { engine.prompt('Invalid value'); engine.complete(); return true; }
          ts.cellWidth = num;
          engine.prompt(`Cell width set to ${num}`);
          engine.complete();
          return true;
        });
        return true;
      }
      if (opt === 'cellheight' || opt === 'ch') {
        engine.prompt(`Enter cell height <${ts.cellHeight}>:`);
        engine.waitForInput('Height:', (val) => {
          const num = val === '' ? ts.cellHeight : parseFloat(val);
          if (isNaN(num) || num <= 0) { engine.prompt('Invalid value'); engine.complete(); return true; }
          ts.cellHeight = num;
          engine.prompt(`Cell height set to ${num}`);
          engine.complete();
          return true;
        });
        return true;
      }
      // list (default)
      engine.prompt(`  Text height: ${ts.textHeight}`);
      engine.prompt(`  Cell width: ${ts.cellWidth}`);
      engine.prompt(`  Cell height: ${ts.cellHeight}`);
      engine.complete();
      return true;
    });
  });

  // === TINSERT ===
  engine.register('TINSERT', ['TI'], () => {
    engine.prompt('TINSERT Enter block name:');
    engine.waitForInput('Block:', (blockName) => {
      if (!blockName) { engine.complete(); return true; }
      if (!store.blockDefs || !store.blockDefs.has(blockName)) {
        engine.prompt('Block not found');
        engine.complete();
        return true;
      }
      engine.prompt('Specify table cell location:');
      engine.waitForClick((pt) => {
        store.pushUndo('TINSERT');
        store.addEntity(makeEntity({
          type: 'blockref',
          blockName: blockName,
          insertPoint: { x: pt.x, y: pt.y },
          scale: { x: 1, y: 1 },
          rotation: 0,
        } as any));
        store.emit();
        engine.prompt('Block inserted into table');
        engine.complete();
      });
      return true;
    });
  });

  // === REVCLOUDPROPERTIES ===
  engine.register('REVCLOUDPROPERTIES', ['RCP'], () => {
    const curMin = (store as any).revcloudMinArc || 15;
    engine.prompt(`REVCLOUDPROPERTIES Enter minimum arc length <${curMin}>:`);
    engine.waitForInput('Min:', (minVal) => {
      const minArc = minVal === '' ? curMin : parseFloat(minVal);
      if (isNaN(minArc) || minArc <= 0) {
        engine.prompt('Invalid value');
        engine.complete();
        return true;
      }
      engine.prompt(`Enter maximum arc length <${minArc}>:`);
      engine.waitForInput('Max:', (maxVal) => {
        const maxArc = maxVal === '' ? minArc : parseFloat(maxVal);
        if (isNaN(maxArc) || maxArc <= 0) {
          engine.prompt('Invalid value');
          engine.complete();
          return true;
        }
        (store as any).revcloudMinArc = minArc;
        (store as any).revcloudMaxArc = maxArc;
        engine.prompt(`Revision cloud arc length set: min=${minArc}, max=${maxArc}`);
        engine.complete();
        return true;
      });
      return true;
    });
  });

  // === BATTMAN ===
  engine.register('BATTMAN', [], () => {
    engine.prompt('BATTMAN Enter block name (or Enter to list all):');
    engine.waitForInput('Block:', (name) => {
      if (!name || name === '') {
        if (!store.blockDefs || store.blockDefs.size === 0) {
          engine.prompt('No blocks defined');
        } else {
          engine.prompt('Block definitions:');
          for (const [bname] of store.blockDefs) {
            engine.prompt(`  ${bname}`);
          }
        }
        engine.complete();
        return true;
      }
      if (!store.blockDefs || !store.blockDefs.has(name)) {
        engine.prompt(`Block '${name}' not found`);
        engine.complete();
        return true;
      }
      const entities = store.blockDefs.get(name)!;
      const withAttrs = entities.filter((e: any) => e.attributes && e.attributes.length > 0);
      if (withAttrs.length === 0) {
        engine.prompt(`Block '${name}' has no attributes`);
      } else {
        engine.prompt(`Block '${name}' attributes:`);
        for (const e of withAttrs) {
          for (const attr of (e as any).attributes) {
            engine.prompt(`  Tag: ${attr.tag}, Value: ${attr.value}`);
          }
        }
      }
      engine.complete();
      return true;
    });
  });

}
