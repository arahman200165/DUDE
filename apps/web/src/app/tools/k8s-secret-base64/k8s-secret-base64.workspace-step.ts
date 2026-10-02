import { WorkspaceSnapshot, WorkspaceStep } from "@dude/contracts/shared/models/workspace-step.model";
import { readStorageValue, writeStorageValue } from '../../core/workspace/workspace-storage-bridge';
import type { KeyValuePair } from "@dude/shared-types/shared/models/key-value-pair.model";

const TOOL_ID = 'k8s-secret-base64';

/**
 * `historyEligible` is deliberately omitted — `pairs` routinely holds real K8s Secret values
 * (passwords, tokens), even though the tool's own author already chose `session` policy for it
 * (respected here for tab mirroring, but never promoted into a cross-tool history feed).
 */
export const workspaceStep: WorkspaceStep = {
  snapshot(): WorkspaceSnapshot | undefined {
    const pairs = readStorageValue<readonly KeyValuePair[]>(TOOL_ID, 'pairs', 'session');
    if (!pairs || pairs.length === 0) return undefined;

    const mode = readStorageValue<'encode' | 'decode'>(TOOL_ID, 'mode', 'local') ?? 'encode';
    return { state: { mode, pairs }, summary: `K8s Secret (${mode})` };
  },

  restore(state): void {
    if (state['mode'] === 'encode' || state['mode'] === 'decode') writeStorageValue(TOOL_ID, 'mode', 'local', state['mode']);
    if (Array.isArray(state['pairs'])) writeStorageValue(TOOL_ID, 'pairs', 'session', state['pairs']);
  },
};
