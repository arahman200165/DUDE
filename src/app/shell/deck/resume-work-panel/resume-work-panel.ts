import { Component, computed, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { Project } from '../../../core/project/project.model';
import { ProjectService } from '../../../core/project/project.service';
import { WorkspaceTemplate } from '../../../core/workspace/workspace-template.model';
import { WorkspaceTemplateService } from '../../../core/workspace/workspace-template.service';
import { WorkspaceLayoutService } from '../../../core/workspace/workspace-layout.service';
import { Pipeline } from '../../../core/pipeline/pipeline.model';
import { DashboardPanel } from '../../../shared/components/dashboard-panel/dashboard-panel';

type ResumeTab = 'projects' | 'workspaces' | 'pipelines';

/**
 * Unified "Resume Work" surface (DUDE_PRD.md §21 Phase 30D.1/30F.2) — consolidates Recent
 * Projects, Recent Workspaces, and Pinned Pipelines into one bounded panel instead of three
 * separately-sized rails, matching the above-the-fold contract's "one Resume Work surface."
 * Replaces `RecentProjectsRail`/`RecentWorkspacesRail`/`PinnedPipelinesRail` as Home's consumer
 * of this data — the activate/apply-with-confirm precedent those rails established is reused
 * here directly, never duplicated, and no new store is introduced.
 */
@Component({
  selector: 'app-resume-work-panel',
  imports: [RouterLink, DashboardPanel],
  templateUrl: './resume-work-panel.html',
})
export class ResumeWorkPanel {
  private readonly router = inject(Router);
  private readonly projectStore = inject(ProjectService);
  private readonly templateStore = inject(WorkspaceTemplateService);
  private readonly workspaceLayout = inject(WorkspaceLayoutService);

  readonly projects = input.required<readonly Project[]>();
  readonly workspaces = input.required<readonly WorkspaceTemplate[]>();
  readonly pipelines = input.required<readonly Pipeline[]>();

  protected readonly tabs = computed<readonly ResumeTab[]>(() => {
    const tabs: ResumeTab[] = [];
    if (this.projects().length) tabs.push('projects');
    if (this.workspaces().length) tabs.push('workspaces');
    if (this.pipelines().length) tabs.push('pipelines');
    return tabs;
  });

  private readonly requestedTab = signal<ResumeTab | null>(null);

  /** Falls back to the first available tab whenever the requested one is empty/gone. */
  protected readonly currentTab = computed<ResumeTab | null>(() => {
    const tabs = this.tabs();
    if (tabs.length === 0) return null;
    const requested = this.requestedTab();
    return requested && tabs.includes(requested) ? requested : tabs[0];
  });

  protected selectTab(tab: ResumeTab): void {
    this.requestedTab.set(tab);
  }

  protected activateProject(project: Project): void {
    if (this.workspaceLayout.panelTree() !== null && !confirm(`Replace your current workspace layout with "${project.name}"?`)) return;
    this.projectStore.activate(project.id);
    void this.router.navigateByUrl('/workspace');
  }

  protected applyWorkspace(template: WorkspaceTemplate): void {
    if (this.workspaceLayout.panelTree() !== null && !confirm(`Replace your current workspace layout with "${template.name}"?`)) return;
    this.templateStore.apply(template);
    void this.router.navigateByUrl('/workspace');
  }
}
