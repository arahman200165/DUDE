import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { ToolRegistryService } from '../registry/tool-registry.service';
import { loadWorkspaceStep } from "../workspace/workspace-step-loader";
import { HistoryService } from './history.service';

/**
 * Click-to-restore for a History entry: reads the entry, resolves its tool, calls the shared
 * `<id>.workspace-step.ts` adapter's `restore()` — the identical mechanism `ToolHost` uses for tab
 * reopen (synchronous, writes the tool's real storage keys or hands off in-memory for `'none'`-
 * policy tools via `workspace-handoff.ts`) — then navigates. No second parallel hand-off mechanism.
 */
@Injectable({ providedIn: 'root' })
export class HistoryHandoffService {
  private readonly history = inject(HistoryService);
  private readonly registry = inject(ToolRegistryService);
  private readonly router = inject(Router);

  async open(entryId: string): Promise<boolean> {
    const entry = await this.history.getById(entryId);
    if (!entry) return false;

    const tool = this.registry.getById(entry.toolId);
    if (!tool) return false;

    const step = await loadWorkspaceStep(entry.toolId);
    step?.restore(entry.state);

    await this.router.navigateByUrl(tool.route);
    return true;
  }
}
