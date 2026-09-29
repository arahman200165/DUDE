import { Component, computed, inject } from '@angular/core';
import { FavoritesService } from '../../../core/favorites/favorites.service';
import { PlatformService } from '../../../core/platform/platform.service';
import { ProjectService } from '../../../core/project/project.service';
import { WorkspaceTemplateService } from '../../../core/workspace/workspace-template.service';
import { ResumeWorkPanel } from '../resume-work-panel/resume-work-panel';

const LIMIT = 8;

/** Feeds Resume Work from its authoritative services; projects/workspaces are desktop-only data. */
@Component({
  selector: 'app-resume-work-home-panel',
  imports: [ResumeWorkPanel],
  template: `<app-resume-work-panel [projects]="projects()" [workspaces]="workspaces()" [pipelines]="favorites.pinnedPipelines()" />`,
})
export class ResumeWorkHomePanel {
  private readonly platform = inject(PlatformService);
  private readonly projectStore = inject(ProjectService);
  private readonly templates = inject(WorkspaceTemplateService);
  protected readonly favorites = inject(FavoritesService);

  protected readonly projects = computed(() => (this.platform.isDesktop() ? this.projectStore.recentlyActivated(LIMIT) : []));
  protected readonly workspaces = computed(() => (this.platform.isDesktop() ? this.templates.recentlyApplied(LIMIT) : []));
}
