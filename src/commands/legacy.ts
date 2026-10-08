import { store } from '../store';
import { CommandEngine } from './engine';

export function registerLegacyCommands(engine: CommandEngine) {

  // === 3D Entity Creation ===

  engine.register('3DFACE', [], () => {
    engine.prompt('3DFACE not available. MiniCAD is a 2D application. Use LINE or SOLID for 2D faces.');
    engine.complete();
  });

  engine.register('3DMESH', [], () => {
    engine.prompt('3DMESH not available. MiniCAD is a 2D application.');
    engine.complete();
  });

  engine.register('3DPOLY', [], () => {
    engine.prompt('3DPOLY not available. Use PLINE for 2D polylines.');
    engine.complete();
  });

  engine.register('3DSIN', [], () => {
    engine.prompt('3DSIN (3D Studio Import) not available in 2D mode.');
    engine.complete();
  });

  // === Surface Commands ===

  engine.register('SURFREV', [], () => {
    engine.prompt('SURFREV (Surface of Revolution) not available in 2D mode.');
    engine.complete();
  });

  engine.register('SURFTAB1', [], () => {
    const current = (store as any).surftab1 || 6;
    engine.prompt(`SURFTAB1 Enter new value for SURFTAB1 <${current}>:`);
    engine.waitForInput('Value:', (val) => {
      const num = parseInt(val) || current;
      (store as any).surftab1 = num;
      engine.prompt(`SURFTAB1 = ${num}`);
      engine.complete();
      return true;
    });
  });

  engine.register('SURFTAB2', [], () => {
    const current = (store as any).surftab2 || 6;
    engine.prompt(`SURFTAB2 Enter new value for SURFTAB2 <${current}>:`);
    engine.waitForInput('Value:', (val) => {
      const num = parseInt(val) || current;
      (store as any).surftab2 = num;
      engine.prompt(`SURFTAB2 = ${num}`);
      engine.complete();
      return true;
    });
  });

  engine.register('EDGESURF', [], () => {
    engine.prompt('EDGESURF (Edge Surface) not available in 2D mode.');
    engine.complete();
  });

  engine.register('RULESURF', [], () => {
    engine.prompt('RULESURF (Ruled Surface) not available in 2D mode.');
    engine.complete();
  });

  engine.register('TABSURF', [], () => {
    engine.prompt('TABSURF (Tabulated Surface) not available in 2D mode.');
    engine.complete();
  });

  engine.register('REVSURF', [], () => {
    engine.prompt('REVSURF (Surface of Revolution) not available in 2D mode.');
    engine.complete();
  });

  // === Rendering Commands ===

  engine.register('HIDE', [], () => {
    engine.prompt('HIDE (Hidden Line Removal) not applicable in 2D mode.');
    engine.complete();
  });

  engine.register('SHADE', [], () => {
    engine.prompt('SHADE not available. MiniCAD uses 2D wireframe display only.');
    engine.complete();
  });

  engine.register('RENDER', [], () => {
    engine.prompt('RENDER not available in 2D mode. Use PLOT for output.');
    engine.complete();
  });

  engine.register('LIGHT', [], () => {
    engine.prompt('LIGHT not available. Lighting requires 3D environment.');
    engine.complete();
  });

  engine.register('SCENE', [], () => {
    engine.prompt('SCENE not available. Scene management requires 3D rendering.');
    engine.complete();
  });

  engine.register('RPREF', [], () => {
    engine.prompt('RPREF (Render Preferences) not available in 2D mode.');
    engine.complete();
  });

  // === Slide Commands ===

  engine.register('MSLIDE', [], () => {
    engine.prompt('MSLIDE (Make Slide) not available. Use EXPORT for saving drawings.');
    engine.complete();
  });

  engine.register('VSLIDE', [], () => {
    engine.prompt('VSLIDE (View Slide) not available. Use IMPORT to load drawings.');
    engine.complete();
  });

  // === Screen Commands ===

  engine.register('GRAPHSCR', [], () => {
    store.emit();
    engine.prompt('GRAPHSCR Graphics screen active (default in browser).');
    engine.complete();
  });

  engine.register('TEXTSCR', [], () => {
    engine.prompt('TEXTSCR Text screen not available in browser. Use command line below.');
    engine.complete();
  });

  // === Menu Commands ===

  engine.register('MENU', [], () => {
    engine.prompt('MENU Custom menu loading not available in browser environment.');
    engine.complete();
  });

  engine.register('MENULOAD', [], () => {
    engine.prompt('MENULOAD not available in browser environment.');
    engine.complete();
  });

  engine.register('MENUUNLOAD', [], () => {
    engine.prompt('MENUUNLOAD not available in browser environment.');
    engine.complete();
  });

  engine.register('TBCONFIG', [], () => {
    engine.prompt('TBCONFIG (Toolbar Configuration) not available in browser environment.');
    engine.complete();
  });

  // === Programming/Extension Commands ===

  engine.register('APPLOAD', [], () => {
    engine.prompt('APPLOAD (Application Load) not available. MiniCAD runs in browser.');
    engine.complete();
  });

  engine.register('ARX', [], () => {
    engine.prompt('ARX (AutoCAD Runtime Extension) not available in browser environment.');
    engine.complete();
  });

  engine.register('VBARUN', [], () => {
    engine.prompt('VBARUN (VBA Run) not available. Use SCRIPT for automation.');
    engine.complete();
  });

  engine.register('VBAIDE', [], () => {
    engine.prompt('VBAIDE (VBA IDE) not available in browser environment.');
    engine.complete();
  });

  engine.register('VBALOAD', [], () => {
    engine.prompt('VBALOAD not available in browser environment.');
    engine.complete();
  });

  // === Script Control ===

  engine.register('RESUME', [], () => {
    engine.prompt('RESUME Script not paused. Use SCRIPT to run a command script.');
    engine.complete();
  });
}
