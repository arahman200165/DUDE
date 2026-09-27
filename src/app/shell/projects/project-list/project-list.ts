import { DatePipe } from '@angular/common';
import { OpenInDesktop } from '../../../shared/components/open-in-desktop/open-in-desktop';
import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ProjectService } from '../../../core/project/project.service';
import { WorkspaceLayoutService } from '../../../core/workspace/workspace-layout.service';
import { Project } from '../../../core/project/project.model';

/**
 * Projects gallery (DUDE_PRD.md §21 Phase 25 Item 1) — a full `/projects` page, mirroring
 * `shell/pipelines/pipeline-list/`'s list shape and `shell/workspace/template-gallery/`'s
 * save-current-layout/apply-with-confirmation pattern. Activating always routes through
 * `ProjectService.activate()`; this component only decides *when* to ask for confirmation before
 * discarding whatever the current live layout is.
 */
@Component({
  selector: 'app-project-list',
  imports: [DatePipe, OpenInDesktop],
  templateUrl: './project-list.html',
})
export class ProjectList {
  private readonly router = inject(Router);
  private readonly projectStore = inject(ProjectService);
  private readonly workspaceLayout = inject(WorkspaceLayoutService);

  protected readonly projects = this.projectStore.projects;
  protected readonly draftName = signal('');
  protected readonly renamingId = signal<string | null>(null);
  protected readonly renameDraft = signal('');

  private readonly hasOpenLayout = computed(() => this.workspaceLayout.panelTree() !== null);

  protected onDraftNameInput(event: Event): void {
    this.draftName.set((event.target as HTMLInputElement).value);
  }

  protected saveCurrentAsProject(): void {
    const name = this.draftName().trim();
    if (!name) return;
    this.projectStore.create(name);
    this.draftName.set('');
  }

  /** Non-destructive either way (only layout/tab state, never tool content), but still worth a
   *  heads-up before discarding whatever tabs are currently open -- mirrors TemplateGallery.apply(). */
  protected activate(project: Project): void {
    if (this.hasOpenLayout() && !confirm(`Replace your current workspace layout with "${project.name}"?`)) return;
    this.projectStore.activate(project.id);
    void this.router.navigateByUrl('/workspace');
  }

  protected saveLayoutInto(project: Project): void {
    if (!confirm(`Update "${project.name}" with your current workspace layout?`)) return;
    this.projectStore.saveCurrentLayoutInto(project.id);
  }

  protected startRename(project: Project): void {
    this.renamingId.set(project.id);
    this.renameDraft.set(project.name);
  }

  protected onRenameDraftInput(event: Event): void {
    this.renameDraft.set((event.target as HTMLInputElement).value);
  }

  protected confirmRename(): void {
    const id = this.renamingId();
    const name = this.renameDraft().trim();
    if (id && name) this.projectStore.rename(id, name);
    this.renamingId.set(null);
  }

  protected cancelRename(): void {
    this.renamingId.set(null);
  }

  protected remove(project: Project): void {
    if (confirm(`Delete project "${project.name}"? This cannot be undone.`)) {
      this.projectStore.remove(project.id);
    }
  }
}
