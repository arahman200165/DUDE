import { Component, inject, input } from '@angular/core';
import { Router } from '@angular/router';
import { Project } from '../../../core/project/project.model';
import { ProjectService } from '../../../core/project/project.service';
import { WorkspaceLayoutService } from '../../../core/workspace/workspace-layout.service';

/**
 * Desktop-only "Recent Projects" rail (DUDE_PRD.md §21 Phase 25 Item 1) -- mirrors
 * `ProjectList.activate()`'s confirm-before-replacing-a-non-empty-layout precedent exactly, since
 * this is a second call site for the same non-destructive-but-disruptive action.
 */
@Component({
  selector: 'app-recent-projects-rail',
  templateUrl: './recent-projects-rail.html',
})
export class RecentProjectsRail {
  private readonly router = inject(Router);
  private readonly projectStore = inject(ProjectService);
  private readonly workspaceLayout = inject(WorkspaceLayoutService);

  readonly projects = input.required<readonly Project[]>();

  protected activate(project: Project): void {
    if (this.workspaceLayout.panelTree() !== null && !confirm(`Replace your current workspace layout with "${project.name}"?`)) return;
    this.projectStore.activate(project.id);
    void this.router.navigateByUrl('/workspace');
  }
}
