import { Component, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { Router } from '@angular/router';
import { UnifiedRecentsService } from '../../../core/recents/unified-recents.service';
import { ToolRegistryService } from '../../../core/registry/tool-registry.service';
import { ToolLauncherService } from '../../../core/registry/tool-launcher.service';
import { HistoryHandoffService } from '../../../core/history/history-handoff.service';
import { DesktopOpenService } from '../../../core/platform/desktop-open.service';
import { UnifiedRecentEntry } from '../../../core/recents/unified-recents.model';

const KIND_LABELS: Record<UnifiedRecentEntry['kind'], string> = {
  tool: 'Tool',
  pipeline: 'Pipeline',
  'workspace-tab': 'Open in Workspace',
  history: 'History',
  'native-file': 'Native File',
};

/**
 * Unified Recents (DUDE_PRD.md §21 Phase 24 Item 13) — a tab inside `/history`, extending the
 * already-sanctioned Phase 21 Item 5 shell exception rather than a new route. Purely a rendering
 * layer over `UnifiedRecentsService`'s derived view.
 */
@Component({
  selector: 'app-recents-tab',
  imports: [DatePipe],
  templateUrl: './recents-tab.html',
})
export class RecentsTab {
  private readonly recents = inject(UnifiedRecentsService);
  private readonly registry = inject(ToolRegistryService);
  private readonly launcher = inject(ToolLauncherService);
  private readonly historyHandoff = inject(HistoryHandoffService);
  private readonly desktopOpen = inject(DesktopOpenService);
  private readonly router = inject(Router);

  protected readonly entries = this.recents.entries;
  protected readonly kindLabels = KIND_LABELS;

  protected trackEntry(entry: UnifiedRecentEntry): string {
    switch (entry.kind) {
      case 'tool':
      case 'workspace-tab':
        return `${entry.kind}:${entry.toolId}`;
      case 'pipeline':
        return `${entry.kind}:${entry.pipelineId}`;
      case 'history':
        return `${entry.kind}:${entry.entryId}`;
      case 'native-file':
        return `${entry.kind}:${entry.path}`;
    }
  }

  protected async open(entry: UnifiedRecentEntry): Promise<void> {
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
        return;
      case 'native-file':
        await this.desktopOpen.reopen(entry.path);
    }
  }
}
