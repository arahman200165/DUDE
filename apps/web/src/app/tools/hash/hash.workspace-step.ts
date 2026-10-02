import { WorkspaceSnapshot, WorkspaceStep } from "@dude/contracts/shared/models/workspace-step.model";
import { readStorageValue, writeStorageValue } from '../../core/workspace/workspace-storage-bridge';
import { HashAlgorithm } from "@dude/crypto/hash-compute";

const TOOL_ID = 'hash';

/**
 * Hash outputs are deterministic and non-sensitive by construction (a hash of arbitrary text, not
 * a secret itself) — unlike key/signature tools, there's no reason to exclude this from History.
 */
export const workspaceStep: WorkspaceStep = {
  historyEligible: true,

  snapshot(): WorkspaceSnapshot | undefined {
    const text = readStorageValue<string>(TOOL_ID, 'text', 'session');
    const algorithms = readStorageValue<readonly HashAlgorithm[]>(TOOL_ID, 'algorithms', 'local') ?? ['SHA-256'];
    if (!text) return undefined;

    const preview = text.length > 40 ? `${text.slice(0, 40)}…` : text;
    return {
      state: { text, algorithms },
      summary: `${algorithms.join(', ')} of "${preview}"`,
    };
  },

  restore(state): void {
    if (typeof state['text'] === 'string') {
      writeStorageValue(TOOL_ID, 'text', 'session', state['text']);
    }
    if (Array.isArray(state['algorithms'])) {
      writeStorageValue(TOOL_ID, 'algorithms', 'local', state['algorithms']);
    }
  },
};
