import { WorkspaceSnapshot, WorkspaceStep } from "@dude/contracts/shared/models/workspace-step.model";
import { readStorageValue, writeStorageValue } from '../../core/workspace/workspace-storage-bridge';
import { StructFieldDef } from "@dude/tool-engine/tools/binary-structure-inspector/binary-structure-inspector-logic";

const TOOL_ID = 'binary-structure-inspector';

/**
 * Only `fields` (the user-defined struct schema) is worth restoring — the actual bytes being
 * parsed come from an ephemeral file drop, never routed through `PersistenceService`.
 */
export const workspaceStep: WorkspaceStep = {
  historyEligible: true,

  snapshot(): WorkspaceSnapshot | undefined {
    const fields = readStorageValue<readonly StructFieldDef[]>(TOOL_ID, 'fields', 'local');
    if (!fields || fields.length === 0) return undefined;

    return {
      state: { fields },
      summary: `Struct: ${fields.map((f) => f.name).join(', ')}`,
    };
  },

  restore(state): void {
    if (Array.isArray(state['fields'])) {
      writeStorageValue(TOOL_ID, 'fields', 'local', state['fields']);
    }
  },
};
