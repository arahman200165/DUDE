import { Component, inject, input } from '@angular/core';
import { Router } from '@angular/router';
import { WorkspaceTemplate } from '../../../core/workspace/workspace-template.model';
import { WorkspaceTemplateService } from '../../../core/workspace/workspace-template.service';
import { WorkspaceLayoutService } from '../../../core/workspace/workspace-layout.service';

/**
 * Desktop-only "Recent Workspaces" rail (DUDE_PRD.md §21 Phase 25 Item 1) -- the most recently
 * *applied* Workspace Templates, distinct from Recent Projects (`RecentProjectsRail`). Applying is an
 * action, not a navigation, so this mirrors `TemplateGallery.apply()`'s confirm-before-replacing-a-
 * non-empty-layout precedent exactly rather than reusing `HomeRail`'s plain `routerLink`.
 */
@Component({
  selector: 'app-recent-workspaces-rail',
  templateUrl: './recent-workspaces-rail.html',
})
export class RecentWorkspacesRail {
  private readonly router = inject(Router);
  private readonly templateStore = inject(WorkspaceTemplateService);
  private readonly workspaceLayout = inject(WorkspaceLayoutService);

  readonly templates = input.required<readonly WorkspaceTemplate[]>();

  protected apply(template: WorkspaceTemplate): void {
    if (this.workspaceLayout.panelTree() !== null && !confirm(`Replace your current workspace layout with "${template.name}"?`)) return;
    this.templateStore.apply(template);
    void this.router.navigateByUrl('/workspace');
  }
}
