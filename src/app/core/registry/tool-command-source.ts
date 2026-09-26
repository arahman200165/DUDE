import { Injectable, Provider, inject } from '@angular/core';
import { COMMAND_SOURCE, CommandSource, PaletteCommand } from '../../shared/models/command-source.model';
import { ToolRegistryService } from './tool-registry.service';
import { ToolLauncherService } from './tool-launcher.service';

/** The only M424 source; tool metadata remains owned by the generated registry. */
@Injectable()
export class ToolCommandSource implements CommandSource {
  private readonly registry = inject(ToolRegistryService);
  private readonly launcher = inject(ToolLauncherService);

  commands(): readonly PaletteCommand[] {
    return this.registry.getAll().map((tool) => ({
      id: `tool:${tool.id}`,
      kind: 'tool' as const,
      title: tool.title,
      description: tool.description,
      keywords: tool.keywords,
      category: tool.category,
      toolId: tool.id,
      execute: () => this.launcher.open(tool),
    }));
  }
}

export const TOOL_COMMAND_SOURCE_PROVIDERS: Provider[] = [
  ToolCommandSource,
  { provide: COMMAND_SOURCE, useExisting: ToolCommandSource, multi: true },
];
