import { Injectable, Provider, inject } from '@angular/core';
import { Router } from '@angular/router';
import { COMMAND_SOURCE, CommandSource, PaletteCommand } from '../../shared/models/command-source.model';
import { UnifiedRecentsService } from './unified-recents.service';
import { UnifiedRecentEntry } from './unified-recents.model';
import { ToolRegistryService } from '../registry/tool-registry.service';
import { ToolLauncherService } from '../registry/tool-launcher.service';
import { HistoryHandoffService } from '../history/history-handoff.service';

const RECENTS_COMMAND_LIMIT = 10;

/**
 * Command Palette source for Unified Recents (DUDE_PRD.md §21 Phase 25 Item 4) -- top-N entries
 * from `UnifiedRecentsService`, one command each. `open()`'s per-kind dispatch is copied from
 * `RecentsTab.open()` (`shell/history/recents-tab/recents-tab.ts`) rather than shared, since the two
 * call sites differ (one is a template method handler, one builds a `PaletteCommand.execute`
 * closure) and the underlying per-kind logic is only a few lines.
 */
@Injectable()
export class RecentsCommandSource implements CommandSource {
  private readonly recents = inject(UnifiedRecentsService);
  private readonly registry = inject(ToolRegistryService);
  private readonly launcher = inject(ToolLauncherService);
  private readonly historyHandoff = inject(HistoryHandoffService);
  private readonly router = inject(Router);

  commands(): readonly PaletteCommand[] {
    return this.recents
      .entries()
      .slice(0, RECENTS_COMMAND_LIMIT)
      .map((entry) => ({
        id: `recent:${entry.kind}:${this.entryKey(entry)}`,
        kind: 'recent' as const,
        title: `Recent: ${entry.title}`,
        execute: () => this.open(entry),
      }));
  }

  private entryKey(entry: UnifiedRecentEntry): string {
    switch (entry.kind) {
      case 'tool':
      case 'workspace-tab':
        return entry.toolId;
      case 'pipeline':
        return entry.pipelineId;
      case 'history':
        return entry.entryId;
    }
  }

  private async open(entry: UnifiedRecentEntry): Promise<void> {
    switch (entry.kind) {
      case 'tool':
      case 'workspace-tab': {
        const tool = this.registry.getById(entry.toolId);
        if (tool) this.launcher.open(tool);
        return;
      }
      case 'pipeline':
        await this.router.navigate(['/pipelines', entry.pipelineId]);
        return;
      case 'history':
        await this.historyHandoff.open(entry.entryId);
    }
  }
}

export const RECENTS_COMMAND_SOURCE_PROVIDERS: Provider[] = [
  RecentsCommandSource,
  { provide: COMMAND_SOURCE, useExisting: RecentsCommandSource, multi: true },
];
