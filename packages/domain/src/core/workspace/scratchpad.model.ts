import { hostCrypto } from "@dude/crypto/host";
export interface WorkspaceSnippet {
  readonly id: string;
  readonly title: string;
  readonly body: string;
  /** The tool this snippet was sent from, if any — resolved generically via ToolRegistryService. */
  readonly sourceToolId?: string;
  readonly createdAt: string;
}

export interface ScratchpadStore {
  readonly schemaVersion: 1;
  readonly snippets: readonly WorkspaceSnippet[];
  readonly drawerExpanded: boolean;
}

export const EMPTY_SCRATCHPAD_STORE: ScratchpadStore = { schemaVersion: 1, snippets: [], drawerExpanded: false };

export function createSnippet(title: string, body: string, sourceToolId?: string): WorkspaceSnippet {
  return { id: hostCrypto().randomUUID(), title, body, sourceToolId, createdAt: new Date().toISOString() };
}

/** Defensive parse: unknown/corrupt persisted data resets to an empty store rather than throwing. */
export function migrateScratchpadStore(raw: unknown): ScratchpadStore {
  if (!raw || typeof raw !== 'object') return EMPTY_SCRATCHPAD_STORE;
  const candidate = raw as Partial<ScratchpadStore>;
  if (candidate.schemaVersion === 1 && Array.isArray(candidate.snippets)) {
    return { schemaVersion: 1, snippets: candidate.snippets, drawerExpanded: candidate.drawerExpanded ?? false };
  }
  return EMPTY_SCRATCHPAD_STORE;
}
