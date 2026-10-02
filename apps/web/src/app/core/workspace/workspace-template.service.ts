import { Injectable, computed, inject } from '@angular/core';
import { PersistenceService } from '../persistence/persistence.service';
import { ENTITY_STORE, type EntityWriteResult } from '../persistence/entities/entity-store';
import { createStorageBackend } from '../persistence/storage-backend';
import { workspaceTemplateCodec } from '@dude/persistence';
import { buildStorageKey } from "@dude/tool-engine/core/persistence/persistence-keys";
import { WorkspaceLayoutService } from './workspace-layout.service';
import {
  BUILT_IN_TEMPLATES,
  WorkspaceTemplate,
  createWorkspaceTemplate,
  recordRecentlyAppliedTemplate,
} from "@dude/domain/core/workspace/workspace-template.model";

const NAMESPACE = '__workspace-templates__';

/** Before 31B the recents list lived inside the templates blob; carry it over once. */
function legacyRecentlyApplied(): readonly string[] {
  try {
    const raw = createStorageBackend('local').get(buildStorageKey(NAMESPACE, 'userTemplates'));
    const parsed: unknown = raw === null ? null : JSON.parse(raw);
    const ids = typeof parsed === 'object' && parsed !== null ? (parsed as { recentlyAppliedIds?: unknown }).recentlyAppliedIds : undefined;
    return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

/**
 * Workspace Templates (DUDE_PRD.md §21 Phase 24 Item 11) — built-in templates are curated data
 * (`BUILT_IN_TEMPLATES`), user-defined ones persist under the synthetic pseudo-tool-id
 * `'__workspace-templates__'`, the same pattern `'__workspace__'`/`'__pipelines__'` already use.
 * See `AGENTS.md` in this directory.
 */
@Injectable({ providedIn: 'root' })
export class WorkspaceTemplateService {
  private readonly workspaceLayout = inject(WorkspaceLayoutService);
  private readonly collection = inject(ENTITY_STORE).collection(
    workspaceTemplateCodec,
    {
      namespace: NAMESPACE,
      key: 'userTemplates',
      toItems: (blob) => (typeof blob === 'object' && blob !== null && Array.isArray((blob as { userTemplates?: unknown }).userTemplates) ? (blob as { userTemplates: unknown[] }).userTemplates : []),
      fromItems: (userTemplates) => ({ schemaVersion: 1, userTemplates }),
    },
    { compare: (a, b) => a.name.localeCompare(b.name) },
  );
  /** A plain setting, not part of any template record. */
  private readonly recentlyAppliedIds = inject(PersistenceService).signal<readonly string[]>(NAMESPACE, 'recentlyApplied', 'local', legacyRecentlyApplied(), {
    crossTab: 'live',
  });

  readonly templates = computed<readonly WorkspaceTemplate[]>(() => [...BUILT_IN_TEMPLATES, ...this.collection.items()]);

  /**
   * Non-destructive either way -- only layout/tab state is ever touched, never tool content (the
   * governing privacy rule already enforced by `WorkspaceLayoutService.applyLayout`). Whether to
   * confirm before replacing a non-empty current layout is a caller/UI concern; this method itself
   * always just applies.
   */
  apply(template: WorkspaceTemplate): void {
    this.workspaceLayout.applyLayout(template.panelTree, template.openTabs, template.preferenceOverrides);
    this.recentlyAppliedIds.set(recordRecentlyAppliedTemplate(this.recentlyAppliedIds(), template.id));
  }

  /**
   * Most-recently-*applied*-first, resolved back through `templates()` so a removed user template
   * silently drops off rather than producing a dangling entry (Deck's "Recent Workspaces" rail,
   * DUDE_PRD.md §21 Phase 25 Item 1).
   */
  recentlyApplied(limit: number): readonly WorkspaceTemplate[] {
    const byId = new Map(this.templates().map((template) => [template.id, template]));
    const resolved: WorkspaceTemplate[] = [];
    for (const id of this.recentlyAppliedIds()) {
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
    void this.collection.upsert(template);
    return template;
  }

  /** Bundle import (Phase 26 Item 14). Always stored as user templates, never built-ins. */
  importUserTemplates(templates: readonly WorkspaceTemplate[]): Promise<EntityWriteResult> {
    const builtInIds = new Set(BUILT_IN_TEMPLATES.map((template) => template.id));
    const incoming = templates.filter((template) => !builtInIds.has(template.id)).map((template) => ({ ...template, builtIn: false }));
    return this.collection.importMany(incoming);
  }

  /** A no-op if `id` belongs to a built-in template -- those never live in `userTemplates`. */
  removeUserTemplate(id: string): Promise<EntityWriteResult> {
    return this.collection.remove(id);
  }
}
