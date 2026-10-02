import { WorkspaceSnapshot, WorkspaceStep } from "@dude/contracts/shared/models/workspace-step.model";
import { readStorageValue, writeStorageValue } from '../../core/workspace/workspace-storage-bridge';

const TOOL_ID = 'protobuf-decoder';

/** The binary payload itself is file-upload-only, never routed through PersistenceService — only
 *  the pasted .proto schema text is mirrored/recorded. */
export const workspaceStep: WorkspaceStep = {
  historyEligible: true,

  snapshot(): WorkspaceSnapshot | undefined {
    const schemaText = readStorageValue<string>(TOOL_ID, 'schemaText', 'session');
    if (!schemaText) return undefined;

    const preview = schemaText.length > 40 ? `${schemaText.slice(0, 40)}…` : schemaText;
    return { state: { schemaText }, summary: `Protobuf schema: "${preview}"` };
  },

  restore(state): void {
    if (typeof state['schemaText'] === 'string') writeStorageValue(TOOL_ID, 'schemaText', 'session', state['schemaText']);
  },
};
