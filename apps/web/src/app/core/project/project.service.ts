import { Injectable, computed, inject } from '@angular/core';
import { ENTITY_STORE, type EntityWriteResult } from '../persistence/entities/entity-store';
import { projectCodec } from '@dude/persistence';
import { WorkspaceLayoutService } from '../workspace/workspace-layout.service';
import { UnifiedRecentsService } from '../recents/unified-recents.service';
import { UnifiedRecentEntry } from "@dude/domain/core/recents/unified-recents.model";
import { EMPTY_PROJECT_STORE, Project, createProject } from "@dude/domain/core/project/project.model";

/**
 * Projects (DUDE_PRD.md §21 Phase 25 Item 1) — persist under the synthetic pseudo-tool-id
 * `'__projects__'`, the same pattern `'__workspace__'`/`'__pipelines__'`/`'__workspace-templates__'`
 * already use. See `AGENTS.md` in this directory.
 */
@Injectable({ providedIn: 'root' })
export class ProjectService {
  private readonly workspaceLayout = inject(WorkspaceLayoutService);
  private readonly unifiedRecents = inject(UnifiedRecentsService);
  private readonly collection = inject(ENTITY_STORE).collection(
    projectCodec,
    {
      namespace: '__projects__',
      key: 'projects',
      toItems: (blob) => (typeof blob === 'object' && blob !== null && Array.isArray((blob as { projects?: unknown }).projects) ? (blob as { projects: unknown[] }).projects : []),
      fromItems: (projects) => ({ ...EMPTY_PROJECT_STORE, projects }),
    },
    { compare: (a, b) => a.createdAt.localeCompare(b.createdAt) },
  );

  readonly projects = computed<readonly Project[]>(() => this.collection.items());

  getById(id: string): Project | undefined {
    return this.collection.get(id);
  }

  create(name: string): Project {
    const project = createProject(
      name,
      this.workspaceLayout.panelTree(),
      this.workspaceLayout.openTabs(),
      this.workspaceLayout.preferenceOverrides(),
    );
    void this.collection.upsert(project);
    return project;
  }

  rename(id: string, name: string): void {
    this.updateProject(id, (project) => ({ ...project, name }));
  }

  remove(id: string): Promise<EntityWriteResult> {
    return this.collection.remove(id);
  }

  /** Bundle import (Phase 26 Item 14): upsert by id, conflicts already resolved by `planImport`. */
  importProjects(projects: readonly Project[]): Promise<EntityWriteResult> {
    return this.collection.importMany(projects);
  }

  /**
   * Non-destructive either way -- only layout/tab state is ever touched, never tool content (the
   * governing privacy rule already enforced by `WorkspaceLayoutService.applyLayout`), mirroring
   * `WorkspaceTemplateService.apply()` exactly.
   */
  activate(id: string): void {
    const project = this.getById(id);
    if (!project) return;
    this.workspaceLayout.applyLayout(project.panelTree, project.openTabs, project.preferenceOverrides);
    this.updateProject(id, (current) => ({ ...current, lastActivatedAt: new Date().toISOString() }));
  }

  /** Re-captures the current live layout into an already-existing project -- never a new one. */
  saveCurrentLayoutInto(id: string): void {
    this.updateProject(id, (project) => ({
      ...project,
      panelTree: this.workspaceLayout.panelTree(),
      openTabs: this.workspaceLayout.openTabs(),
      preferenceOverrides: this.workspaceLayout.preferenceOverrides(),
    }));
  }

  addPinnedPipeline(id: string, pipelineId: string): void {
    this.updateProject(id, (project) =>
      project.pinnedPipelineIds.includes(pipelineId)
        ? project
        : { ...project, pinnedPipelineIds: [...project.pinnedPipelineIds, pipelineId] },
    );
  }

  removePinnedPipeline(id: string, pipelineId: string): void {
    this.updateProject(id, (project) => ({
      ...project,
      pinnedPipelineIds: project.pinnedPipelineIds.filter((pinnedId) => pinnedId !== pipelineId),
    }));
  }

  /** Most-recently-*activated*-first, capped at `limit` -- Deck's "Recent Projects" rail (Item 1). */
  recentlyActivated(limit: number): readonly Project[] {
    return this.projects()
      .filter((project) => project.lastActivatedAt !== undefined)
      .sort((a, b) => b.lastActivatedAt!.localeCompare(a.lastActivatedAt!))
      .slice(0, limit);
  }

  /**
   * Derived, not stored -- filters the live `UnifiedRecentsService` feed down to tool ids this
   * project's own open tabs actually reference, so "recent tools" never becomes a second,
   * independently-drifting activity log. See `AGENTS.md`.
   */
  recentTools(id: string): readonly UnifiedRecentEntry[] {
    const project = this.getById(id);
    if (!project) return [];
    const toolIds = new Set(project.openTabs);
    return this.unifiedRecents.entries().filter((entry) => 'toolId' in entry && toolIds.has(entry.toolId));
  }

  private updateProject(id: string, updater: (project: Project) => Project): void {
    const project = this.getById(id);
    if (!project) return;
    const updated = updater(project);
    if (updated !== project) void this.collection.upsert(updated);
  }
}
