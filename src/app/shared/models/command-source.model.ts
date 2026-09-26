import { InjectionToken } from '@angular/core';
import { ToolCategory } from './tool-category.model';

/** Declared palette actions. Sources may read signals when commands() is called. */
export type CommandKind = 'tool' | 'pipeline' | 'workspace' | 'project' | 'native' | 'recent' | 'preference';

export interface PaletteCommand {
  readonly id: string;
  readonly kind: CommandKind;
  readonly title: string;
  readonly description?: string;
  readonly keywords?: readonly string[];
  /** Only tool commands have a tool category and optional Quick Run affordance. */
  readonly category?: ToolCategory;
  readonly toolId?: string;
  readonly execute: () => void | Promise<void>;
}

export interface CommandSource {
  commands(): readonly PaletteCommand[];
}

/** Register each source with `{ provide: COMMAND_SOURCE, useExisting: Source, multi: true }`. */
export const COMMAND_SOURCE = new InjectionToken<readonly CommandSource[]>('COMMAND_SOURCE');
