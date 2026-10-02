import { Injectable, computed, inject } from '@angular/core';
import { PersistenceService } from '../persistence/persistence.service';
import { WorkspaceLayoutService } from './workspace-layout.service';
import {
  BUILT_IN_TEMPLATES,
  EMPTY_WORKSPACE_TEMPLATE_STORE,
  WorkspaceTemplate,
  createWorkspaceTemplate,
  migrateWorkspaceTemplateStore,
  recordRecentlyAppliedTemplate,
} from "@dude/domain/core/workspace/workspace-template.model";
import { upsertById } from "@dude/tool-engine/core/backup/upsert-by-id";

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
    { crossTab: 'live' },
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
    this.workspaceLayout.applyLayout(template.panelTree, template.openTabs, template.preferenceOverrides);
    this.store.set({ ...this.store(), recentlyAppliedIds: recordRecentlyAppliedTemplate(this.store().recentlyAppliedIds, template.id) });
  }

  /**
   * Most-recently-*applied*-first, resolved back through `templates()` so a removed user template
   * silently drops off rather than producing a dangling entry (Deck's "Recent Workspaces" rail,
   * DUDE_PRD.md §21 Phase 25 Item 1).
   */
  recentlyApplied(limit: number): readonly WorkspaceTemplate[] {
    const byId = new Map(this.templates().map((template) => [template.id, template]));
    const resolved: WorkspaceTemplate[] = [];
    for (const id of this.store().recentlyAppliedIds) {
      const template = byId.get(id);
      if (template) resolved.push(template);
      if (resolved.length === limit) break;
    }
    return resolved;
  }

  saveCurrentAsTemplate(name: string): WorkspaceTemplate {
    const template = createWorkspaceTemplate(
      name,
      this.workspaceLayout.panelTree(),
      this.workspaceLayout.openTabs(),
      this.workspaceLayout.preferenceOverrides(),
    );
    this.store.set({ ...this.store(), userTemplates: [...this.store().userTemplates, template] });
    return template;
  }

  /** Bundle import (Phase 26 Item 14). Always stored as user templates, never built-ins. */
  importUserTemplates(templates: readonly WorkspaceTemplate[]): void {
    const builtInIds = new Set(BUILT_IN_TEMPLATES.map((template) => template.id));
    const incoming = templates.filter((template) => !builtInIds.has(template.id)).map((template) => ({ ...template, builtIn: false }));
    this.store.set({ ...this.store(), userTemplates: upsertById(this.store().userTemplates, incoming) });
  }

  /** A no-op if `id` belongs to a built-in template -- those never live in `userTemplates`. */
  removeUserTemplate(id: string): void {
    this.store.set({ ...this.store(), userTemplates: this.store().userTemplates.filter((template) => template.id !== id) });
  }
}
