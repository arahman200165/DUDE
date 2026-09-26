import { Injectable, computed, inject } from '@angular/core';
import { PersistenceService } from '../persistence/persistence.service';
import { WorkspaceLayoutService } from './workspace-layout.service';
import {
  BUILT_IN_TEMPLATES,
  EMPTY_WORKSPACE_TEMPLATE_STORE,
  WorkspaceTemplate,
  createWorkspaceTemplate,
  migrateWorkspaceTemplateStore,
} from './workspace-template.model';

/**
 * Workspace Templates (DUDE_PRD.md §21 Phase 24 Item 11) — built-in templates are curated data
 * (`BUILT_IN_TEMPLATES`), user-defined ones persist under the synthetic pseudo-tool-id
 * `'__workspace-templates__'`, the same pattern `'__workspace__'`/`'__pipelines__'` already use.
 * See `AGENTS.md` in this directory.
 */
@Injectable({ providedIn: 'root' })
export class WorkspaceTemplateService {
  private readonly workspaceLayout = inject(WorkspaceLayoutService);
  private readonly store = inject(PersistenceService).signal(
    '__workspace-templates__',
    'userTemplates',
    'local',
    EMPTY_WORKSPACE_TEMPLATE_STORE,
  );

  constructor() {
    const migrated = migrateWorkspaceTemplateStore(this.store());
    if (migrated !== this.store()) this.store.set(migrated);
  }

  readonly templates = computed<readonly WorkspaceTemplate[]>(() => [...BUILT_IN_TEMPLATES, ...this.store().userTemplates]);

  /**
   * Non-destructive either way -- only layout/tab state is ever touched, never tool content (the
   * governing privacy rule already enforced by `WorkspaceLayoutService.applyLayout`). Whether to
   * confirm before replacing a non-empty current layout is a caller/UI concern; this method itself
   * always just applies.
   */
  apply(template: WorkspaceTemplate): void {
    this.workspaceLayout.applyLayout(template.panelTree, template.openTabs);
  }

  saveCurrentAsTemplate(name: string): WorkspaceTemplate {
    const template = createWorkspaceTemplate(name, this.workspaceLayout.panelTree(), this.workspaceLayout.openTabs());
    this.store.set({ ...this.store(), userTemplates: [...this.store().userTemplates, template] });
    return template;
  }

  /** A no-op if `id` belongs to a built-in template -- those never live in `userTemplates`. */
  removeUserTemplate(id: string): void {
    this.store.set({ ...this.store(), userTemplates: this.store().userTemplates.filter((template) => template.id !== id) });
  }
}
