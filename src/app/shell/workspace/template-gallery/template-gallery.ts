import { Component, computed, inject, signal } from '@angular/core';
import { WorkspaceTemplateService } from '../../../core/workspace/workspace-template.service';
import { WorkspaceLayoutService } from '../../../core/workspace/workspace-layout.service';
import { WorkspaceTemplate } from '../../../core/workspace/workspace-template.model';

/**
 * Workspace Templates gallery (DUDE_PRD.md §21 Phase 24 Item 11) — a toolbar toggle + collapsible
 * panel in `/workspace`, extending the already-sanctioned Phase 21 Item 4 shell exception (see
 * `shell/workspace/AGENTS.md`). Applying a template always routes through
 * `WorkspaceTemplateService.apply()`; this component only decides *when* to ask for confirmation.
 */
@Component({
  selector: 'app-template-gallery',
  templateUrl: './template-gallery.html',
})
export class TemplateGallery {
  private readonly templateStore = inject(WorkspaceTemplateService);
  private readonly workspaceLayout = inject(WorkspaceLayoutService);

  protected readonly expanded = signal(false);
  protected readonly templates = this.templateStore.templates;
  protected readonly draftName = signal('');

  private readonly hasOpenLayout = computed(() => this.workspaceLayout.panelTree() !== null);

  protected toggle(): void {
    this.expanded.set(!this.expanded());
  }

  /** Prompts before replacing a non-empty layout; applies silently onto an empty one -- non-
   *  destructive either way (only layout/tab state, never tool content), but still worth a heads-up
   *  before discarding whatever tabs are currently open. */
  protected apply(template: WorkspaceTemplate): void {
    if (this.hasOpenLayout() && !confirm(`Replace your current workspace layout with "${template.name}"?`)) return;
    this.templateStore.apply(template);
  }

  protected onDraftNameInput(event: Event): void {
    this.draftName.set((event.target as HTMLInputElement).value);
  }

  protected saveCurrent(): void {
    const name = this.draftName().trim();
    if (!name) return;
    this.templateStore.saveCurrentAsTemplate(name);
    this.draftName.set('');
  }

  protected remove(id: string): void {
    this.templateStore.removeUserTemplate(id);
  }
}
