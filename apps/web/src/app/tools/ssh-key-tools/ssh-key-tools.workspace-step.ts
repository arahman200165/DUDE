import { WorkspaceSnapshot, WorkspaceStep } from "@dude/contracts/shared/models/workspace-step.model";
import { readStorageValue, writeStorageValue } from '../../core/workspace/workspace-storage-bridge';

const TOOL_ID = 'ssh-key-tools';

/**
 * `historyEligible` deliberately omitted: this tool also generates private keys (never persisted,
 * correctly untouched here) — only the inspect-mode public key input and generation preferences
 * are mirrored, and even those stay out of History since the tool mixes key generation and
 * inspection in one place (see `core/history/AGENTS.md`'s sensitive-by-design category).
 */
export const workspaceStep: WorkspaceStep = {
  snapshot(): WorkspaceSnapshot | undefined {
    const inspectInput = readStorageValue<string>(TOOL_ID, 'inspectInput', 'session');
    if (!inspectInput) return undefined;

    const mode = readStorageValue<'generate' | 'inspect'>(TOOL_ID, 'mode', 'local') ?? 'generate';
    const family = readStorageValue<string>(TOOL_ID, 'family', 'local') ?? 'ed25519';
    const modulusLength = readStorageValue<number>(TOOL_ID, 'modulusLength', 'local') ?? 2048;
    const curve = readStorageValue<string>(TOOL_ID, 'curve', 'local') ?? 'P-256';

    const preview = inspectInput.length > 40 ? `${inspectInput.slice(0, 40)}…` : inspectInput;
    return { state: { mode, family, modulusLength, curve, inspectInput }, summary: `Inspecting SSH key: "${preview}"` };
  },

  restore(state): void {
    if (state['mode'] === 'generate' || state['mode'] === 'inspect') writeStorageValue(TOOL_ID, 'mode', 'local', state['mode']);
    if (typeof state['family'] === 'string') writeStorageValue(TOOL_ID, 'family', 'local', state['family']);
    if (typeof state['modulusLength'] === 'number') writeStorageValue(TOOL_ID, 'modulusLength', 'local', state['modulusLength']);
    if (typeof state['curve'] === 'string') writeStorageValue(TOOL_ID, 'curve', 'local', state['curve']);
    if (typeof state['inspectInput'] === 'string') writeStorageValue(TOOL_ID, 'inspectInput', 'session', state['inspectInput']);
  },
};
