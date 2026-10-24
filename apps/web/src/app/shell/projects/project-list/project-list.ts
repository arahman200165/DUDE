import { DatePipe } from '@angular/common';
import { OpenInDesktop } from '../../../shared/components/open-in-desktop/open-in-desktop';
import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ProjectService } from '../../../core/project/project.service';
import { WorkspaceLayoutService } from '../../../core/workspace/workspace-layout.service';
import { OpenEditorMerge } from '../../../core/sync/open-editor-merge';
import { RemoteChangeNotice } from '../../../shared/components/remote-change-notice/remote-change-notice';
import { Project } from "@dude/domain/core/project/project.model";

/**
 * Projects gallery (DUDE_PRD.md §21 Phase 25 Item 1) — a full `/projects` page, mirroring
 * `shell/pipelines/pipeline-list/`'s list shape and `shell/workspace/template-gallery/`'s
 * save-current-layout/apply-with-confirmation pattern. Activating always routes through
 * `ProjectService.activate()`; this component only decides *when* to ask for confirmation before
 * discarding whatever the current live layout is.
 */
@Component({
  selector: 'app-project-list',
  imports: [DatePipe, OpenInDesktop, RemoteChangeNotice],
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
  /** The project as it was when the rename started: the base the inline draft is merged against. */
  private renameBase: Project | undefined;

  /**
   * The inline rename is the only draft/save form a project has (the panel tree, tabs and overrides are edited by the
   * live workspace and captured with Update layout, never in a form). Another device's change to the project being
   * renamed merges into the draft; a different name on both sides shows the notice (PD-113).
   */
  protected readonly remote = new OpenEditorMerge<Project>({
    entityType: 'project',
    entityId: () => this.renamingId(),
    stored: () => {
      const id = this.renamingId();
      return id ? this.projectStore.getById(id) : undefined;
    },
    draft: () => ({ ...(this.renameBase as Project), name: this.renameDraft() }),
    setDraft: (project) => {
      this.renameBase = project;
      this.renameDraft.set(project.name);
    },
  });

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
    this.renameBase = project;
    this.renamingId.set(project.id);
    this.renameDraft.set(project.name);
    this.remote.markSaved(project);
  }

  protected onRenameDraftInput(event: Event): void {
    this.renameDraft.set((event.target as HTMLInputElement).value);
  }

  protected confirmRename(): void {
    const id = this.renamingId();
    const name = this.renameDraft().trim();
    if (id && name) this.projectStore.rename(id, name);
    this.renamingId.set(null);
    this.remote.markSaved(null);
  }

  protected cancelRename(): void {
    this.renamingId.set(null);
    this.remote.markSaved(null);
  }

  protected remove(project: Project): void {
    if (confirm(`Delete project "${project.name}"? This cannot be undone.`)) {
      this.projectStore.remove(project.id);
    }
  }
}
