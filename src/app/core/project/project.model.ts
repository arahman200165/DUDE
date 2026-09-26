import { PanelNode } from '../workspace/workspace.model';

/**
 * A named, saved bundle of workspace layout + pinned pipelines (DUDE_PRD.md §21 Phase 25 Item 1) —
 * a *reference* bundle, never a copy. `panelTree`/`openTabs` are exactly `WorkspaceTemplate`'s shape
 * (tool ids and split ratios, zero tool content); `pinnedPipelineIds` are ids resolved through
 * `PipelineStoreService`, never a duplicated pipeline. See `AGENTS.md` in this directory for why
 * this deliberately stops short of a file-tree/working-directory concept.
 */
export interface Project {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly createdAt: string;
  readonly lastActivatedAt?: string;
  readonly panelTree: PanelNode | null;
  readonly openTabs: readonly string[];
  readonly pinnedPipelineIds: readonly string[];
}

export const PROJECT_STORE_SCHEMA_VERSION = 1;

export interface ProjectStore {
  readonly schemaVersion: 1;
  readonly projects: readonly Project[];
}

export const EMPTY_PROJECT_STORE: ProjectStore = { schemaVersion: 1, projects: [] };

/** Defensive parse: unrecognized/corrupt persisted data resets to an empty store rather than throwing. */
export function migrateProjectStore(raw: unknown): ProjectStore {
  if (!raw || typeof raw !== 'object') return EMPTY_PROJECT_STORE;
  const candidate = raw as Partial<ProjectStore>;
  if (candidate.schemaVersion === PROJECT_STORE_SCHEMA_VERSION && Array.isArray(candidate.projects)) {
    return { schemaVersion: 1, projects: candidate.projects };
  }
  return EMPTY_PROJECT_STORE;
}

export function createProject(name: string, panelTree: PanelNode | null, openTabs: readonly string[]): Project {
  return {
    id: crypto.randomUUID(),
    name,
    createdAt: new Date().toISOString(),
    panelTree,
    openTabs,
    pinnedPipelineIds: [],
  };
}
