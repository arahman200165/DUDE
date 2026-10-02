import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { ToolDefinition } from '../../shared/models/tool-definition.model';
import { WorkspaceLayoutService } from '../workspace/workspace-layout.service';

/**
 * The one "open a tool" entry point every clickable tool card/row/result should call, instead of
 * re-deriving the Workspace-aware branch itself. Extracted from `CommandPalette.open()`
 * (DUDE_PRD.md §21 Phase 24 Milestone 409) the moment a second call site (Home's Recents/Favorites
 * rails) needed the identical logic: inside the Workspace (`/workspace`), "open a tool" means "open
 * it as a tab" rather than navigating away — see `shell/workspace/AGENTS.md`.
 */
@Injectable({ providedIn: 'root' })
export class ToolLauncherService {
  private readonly router = inject(Router);
  private readonly workspaceLayout = inject(WorkspaceLayoutService);

  open(tool: ToolDefinition): void {
    if (this.router.url.startsWith('/workspace')) {
      this.workspaceLayout.openTool(tool.id);
    } else {
      this.router.navigateByUrl(tool.route);
    }
  }
}
