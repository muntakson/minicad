import { store } from '../store';
import { CommandEngine } from './engine';
import { makeEntity } from './helpers';

export function registerCompatCommands(engine: CommandEngine) {

  // === UI stubs ===

  engine.register('TOOLBAR', [], () => {
    engine.prompt('TOOLBAR not available in browser-based MiniCAD. Use the command line interface.');
    engine.complete();
  });

  engine.register('MENUBAR', [], () => {
    engine.prompt('MENUBAR not available in browser-based MiniCAD. Use the command line or menus.');
    engine.complete();
  });

  engine.register('CUI', [], () => {
    engine.prompt('CUI (Customize User Interface) not available in browser environment.');
    engine.complete();
  });

  engine.register('CUSTOMIZE', [], () => {
    engine.prompt('CUSTOMIZE not available in browser-based MiniCAD.');
    engine.complete();
  });

  engine.register('SYSWINDOWS', [], () => {
    engine.prompt('SYSWINDOWS not available in browser environment. Use browser tabs.');
    engine.complete();
  });

  // === Plotter/Output stubs ===

  engine.register('PLOTTERMANAGER', ['PLOTMAN'], () => {
    engine.prompt('PLOTTERMANAGER not available. Use PLOT command for output.');
    engine.complete();
  });

  engine.register('PLOTSTYLE', [], () => {
    engine.prompt('PLOTSTYLE not available. Use COLOR and LINEWEIGHT for entity appearance.');
    engine.complete();
  });

  engine.register('CONVERTCTB', [], () => {
    engine.prompt('CONVERTCTB (Convert Color Table) not available in browser environment.');
    engine.complete();
  });

  // === Design Center/Tools stubs ===

  engine.register('ADCENTER', ['ADC'], () => {
    engine.prompt('ADCENTER (Design Center) not available. Use INSERT for blocks.');
    engine.complete();
  });

  engine.register('TOOLPALETTES', ['TP'], () => {
    engine.prompt('TOOLPALETTES not available in browser environment.');
    engine.complete();
  });

  engine.register('QUICKCALC', ['QCA'], () => {
    engine.prompt('QUICKCALC Use the CAL command for calculations. Type CAL to start.');
    engine.complete();
  });

  // === Data extraction stubs ===

  engine.register('DATAEXTRACTION', ['DX'], () => {
    engine.prompt('DATAEXTRACTION not available. Use LIST or DBLIST to inspect entities.');
    engine.complete();
  });

  engine.register('EATTEXT', [], () => {
    engine.prompt('EATTEXT (Extract Attributes) not available. Use ATTEXT for attribute extraction.');
    engine.complete();
  });

  // === System stubs ===

  engine.register('DRAWINGRECOVERY', [], () => {
    engine.prompt('DRAWINGRECOVERY not available. Use RECOVER to clean drawing state.');
    engine.complete();
  });

  engine.register('ETRANSMIT', [], () => {
    engine.prompt('ETRANSMIT not available. Use EXPORT to save your drawing.');
    engine.complete();
  });

  // === Hardware/System stubs ===

  engine.register('TABLETCONFIG', [], () => {
    engine.prompt('TABLETCONFIG not available. Digitizer tablets not supported in browser.');
    engine.complete();
  });

  engine.register('REINIT', [], () => {
    engine.prompt('REINIT Reinitializing display...');
    store.emit();
    engine.prompt('Display reinitialized.');
    engine.complete();
  });

  engine.register('DRAGMODE', [], () => {
    engine.prompt('DRAGMODE Enter mode [ON/OFF/Auto] <Auto>:');
    engine.waitForInput('Mode:', (input) => {
      const mode = input.toLowerCase() || 'auto';
      if (mode !== 'on' && mode !== 'off' && mode !== 'auto') {
        engine.prompt('Invalid mode. Use ON, OFF, or Auto.');
        engine.complete();
        return true;
      }
      (store as any).dragMode = mode;
      engine.prompt(`Drag mode set to ${mode.toUpperCase()}`);
      engine.complete();
      return true;
    });
  });

  engine.register('BLIPMODE', [], () => {
    engine.prompt('BLIPMODE Enter mode [ON/OFF] <OFF>:');
    engine.waitForInput('Mode:', (input) => {
      const mode = input.toLowerCase() || 'off';
      (store as any).blipMode = (mode === 'on');
      engine.prompt(`Blip mode ${mode === 'on' ? 'ON' : 'OFF'}`);
      engine.complete();
      return true;
    });
  });

  engine.register('HANDLES', [], () => {
    engine.prompt('HANDLES Object handles are always on in MiniCAD.');
    engine.complete();
  });

  // === Functional simplified commands ===

  engine.register('HYPERLINK', ['HYP'], () => {
    engine.requireSelection((sel) => {
      if (sel.length === 0) {
        engine.prompt('No entities selected.');
        engine.complete();
        return;
      }
      const ent = sel[0];
      const current = (ent as any).hyperlink || '';
      engine.prompt(`HYPERLINK Current: "${current}". Enter URL (or Enter to remove):`);
      engine.waitForInput('URL:', (url) => {
        store.pushUndo('HYPERLINK');
        if (url === '') {
          delete (ent as any).hyperlink;
          engine.prompt('Hyperlink removed.');
        } else {
          (ent as any).hyperlink = url;
          engine.prompt(`Hyperlink set to "${url}"`);
        }
        store.clearSelection();
        store.emit();
        engine.complete();
        return true;
      });
    });
  });

  engine.register('CONVERT', [], () => {
    engine.requireSelection((sel) => {
      if (sel.length === 0) {
        engine.prompt('No entities selected.');
        engine.complete();
        return;
      }
      let analyzed = 0;
      for (const e of sel) {
        analyzed++;
      }
      engine.prompt(`CONVERT ${analyzed} entities analyzed. No conversion needed.`);
      store.clearSelection();
      engine.complete();
    });
  });

  engine.register('PASTESPEC', [], () => {
    engine.prompt('PASTESPEC Paste special options [AsBlock/AsEntities] <AsEntities>:');
    engine.waitForInput('Option:', (input) => {
      const opt = input.toLowerCase();
      if (opt === 'asblock' || opt === 'b') {
        if (!store.clipboard || store.clipboard.length === 0) {
          engine.prompt('Clipboard is empty. Use COPYCLIP first.');
          engine.complete();
          return true;
        }
        store.pushUndo('PASTESPEC');
        const blockName = `PasteBlock_${Date.now()}`;
        store.blockDefs.set(blockName, JSON.parse(JSON.stringify(store.clipboard)));
        store.addEntity(makeEntity({
          type: 'blockref',
          blockName,
          insertPoint: { x: 0, y: 0 },
          scaleX: 1,
          scaleY: 1,
          rotation: 0,
        } as any));
        store.emit();
        engine.prompt(`Pasted as block "${blockName}" at origin.`);
        engine.complete();
        return true;
      }
      engine.prompt('Use PASTECLIP for standard paste.');
      engine.complete();
      return true;
    });
  });

  engine.register('SCALELISTEDIT', ['SLE'], () => {
    const defaults = ['1:1', '1:2', '1:4', '1:8', '1:10', '1:20', '1:50', '1:100', '2:1', '4:1'];
    if (!(store as any).scaleList) {
      (store as any).scaleList = [...defaults];
    }
    const list: string[] = (store as any).scaleList;

    engine.prompt('SCALELISTEDIT [Add/Delete/Reset/List] <List>:');
    engine.waitForInput('Option:', (input) => {
      const opt = input.toLowerCase();
      if (opt === 'add' || opt === 'a') {
        engine.prompt('Enter scale string (e.g. 1:5):');
        engine.waitForInput('Scale:', (scale) => {
          if (scale === '') { engine.complete(); return true; }
          list.push(scale);
          engine.prompt(`Scale "${scale}" added. ${list.length} scales total.`);
          engine.complete();
          return true;
        });
        return true;
      }
      if (opt === 'delete' || opt === 'd') {
        engine.prompt(`Current scales: ${list.join(', ')}`);
        engine.prompt('Enter scale to delete:');
        engine.waitForInput('Scale:', (scale) => {
          const idx = list.indexOf(scale);
          if (idx >= 0) {
            list.splice(idx, 1);
            engine.prompt(`Scale "${scale}" removed. ${list.length} scales remaining.`);
          } else {
            engine.prompt(`Scale "${scale}" not found.`);
          }
          engine.complete();
          return true;
        });
        return true;
      }
      if (opt === 'reset' || opt === 'r') {
        (store as any).scaleList = [...defaults];
        engine.prompt(`Scale list reset to ${defaults.length} defaults.`);
        engine.complete();
        return true;
      }
      // list (default)
      engine.prompt(`Scale list (${list.length}):`);
      for (const s of list) {
        engine.prompt(`  ${s}`);
      }
      engine.complete();
      return true;
    });
  });

  engine.register('ISOPLANE', [], () => {
    engine.prompt('ISOPLANE Enter setting [Left/Top/Right] <Top>:');
    engine.waitForInput('Plane:', (input) => {
      const opt = input.toLowerCase() || 'top';
      if (opt !== 'left' && opt !== 'top' && opt !== 'right' &&
          opt !== 'l' && opt !== 't' && opt !== 'r') {
        engine.prompt('Invalid option. Use Left, Top, or Right.');
        engine.complete();
        return true;
      }
      const plane = opt === 'l' ? 'left' : opt === 'r' ? 'right' : opt === 't' ? 'top' : opt;
      (store as any).isoplane = plane;
      store.emit();
      engine.prompt(`Isometric plane set to ${plane.charAt(0).toUpperCase() + plane.slice(1)}`);
      engine.complete();
      return true;
    });
  });

  engine.register('ELEV', [], () => {
    const curElev = (store as any).defaultElevation || 0;
    engine.prompt(`ELEV Enter new default elevation <${curElev}>:`);
    engine.waitForInput('Elevation:', (input) => {
      const elev = input === '' ? curElev : parseFloat(input);
      if (isNaN(elev)) {
        engine.prompt('Invalid number.');
        engine.complete();
        return true;
      }
      (store as any).defaultElevation = elev;
      engine.prompt(`New default elevation = ${elev}`);
      const curThick = (store as any).defaultThickness || 0;
      engine.prompt(`Enter new default thickness <${curThick}>:`);
      engine.waitForInput('Thickness:', (tinput) => {
        const thick = tinput === '' ? curThick : parseFloat(tinput);
        if (isNaN(thick)) {
          engine.prompt('Invalid number.');
          engine.complete();
          return true;
        }
        (store as any).defaultThickness = thick;
        engine.prompt(`New default thickness = ${thick}`);
        engine.complete();
        return true;
      });
      return true;
    });
  });

  engine.register('THICKNESS', [], () => {
    const curThick = (store as any).defaultThickness || 0;
    engine.prompt(`THICKNESS Enter new default thickness <${curThick}>:`);
    engine.waitForInput('Thickness:', (input) => {
      const thick = input === '' ? curThick : parseFloat(input);
      if (isNaN(thick)) {
        engine.prompt('Invalid number.');
        engine.complete();
        return true;
      }
      (store as any).defaultThickness = thick;
      engine.prompt(`Default thickness set to ${thick}`);
      engine.complete();
      return true;
    });
  });

  engine.register('COMPILE', [], () => {
    engine.prompt('COMPILE Shape compilation not available in browser environment.');
    engine.complete();
  });

  engine.register('TABLET', [], () => {
    engine.prompt('TABLET Digitizer tablet not supported in browser environment.');
    engine.complete();
  });

  engine.register('DELAY', [], () => {
    engine.prompt('DELAY Enter delay in milliseconds <1000>:');
    engine.waitForInput('Delay:', (input) => {
      const ms = input === '' ? 1000 : parseInt(input, 10);
      if (isNaN(ms) || ms < 0) {
        engine.prompt('Invalid delay value.');
        engine.complete();
        return true;
      }
      engine.prompt(`Delaying ${ms}ms...`);
      setTimeout(() => {
        engine.prompt('Delay complete.');
        engine.complete();
      }, ms);
      return true;
    });
  });

}
