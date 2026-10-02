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

