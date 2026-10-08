import { CommandEngine } from './engine';
import { registerDrawCommands } from './draw';
import { registerModifyCommands } from './modify';
import { registerTrimExtendCommands } from './trim-extend';
import { registerDimensionCommands } from './dimension';
import { registerViewCommands, zoomExtents } from './view';
import { registerSettingsCommands } from './settings';
import { registerInquiryCommands } from './inquiry';
import { registerAnnotationCommands } from './annotation';
import { registerPropertiesCommands } from './properties';
import { registerOptionsCommands } from './options';
import { registerOutputCommands } from './output';
import { registerBoundaryCommands } from './boundary';
import { registerRegionCommands } from './region';
import { registerXrefCommands } from './xref';
import { registerViewportCommands } from './viewport';
import { registerCompatCommands } from './compat';
import { registerLegacyCommands } from './legacy';
import { Renderer } from '../renderer';
import type { PromptCallback, InputCallback } from './engine';

export { CommandEngine, zoomExtents };
export type { PromptCallback, InputCallback };

export function createCommandEngine(
  renderer: Renderer,
  promptFn: PromptCallback,
  inputFn: InputCallback,
): CommandEngine {
  const engine = new CommandEngine(renderer, promptFn, inputFn);
  registerDrawCommands(engine);
  registerModifyCommands(engine);
  registerTrimExtendCommands(engine);
  registerDimensionCommands(engine);
  registerViewCommands(engine);
  registerSettingsCommands(engine);
  registerInquiryCommands(engine);
  registerAnnotationCommands(engine);
  registerPropertiesCommands(engine);
  registerOptionsCommands(engine);
  registerOutputCommands(engine);
  registerBoundaryCommands(engine);
  registerRegionCommands(engine);
  registerXrefCommands(engine);
  registerViewportCommands(engine);
  registerCompatCommands(engine);
  registerLegacyCommands(engine);
  return engine;
}
