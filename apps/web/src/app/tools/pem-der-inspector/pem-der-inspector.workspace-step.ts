import { WorkspaceSnapshot, WorkspaceStep } from "@dude/contracts/shared/models/workspace-step.model";
import { readStorageValue, writeStorageValue } from '../../core/workspace/workspace-storage-bridge';

const TOOL_ID = 'pem-der-inspector';

/**
 * `historyEligible` deliberately omitted: a pasted PEM/DER block can be a private key (this tool
 * accepts any PEM type, not only certificates), so it stays out of the cross-tool History feed even
 * though its `input` field is already `session`-policy in the tool's own code (see
 * `core/history/AGENTS.md`'s sensitive-by-design category).
 */
export const workspaceStep: WorkspaceStep = {
  snapshot(): WorkspaceSnapshot | undefined {
    const input = readStorageValue<string>(TOOL_ID, 'input', 'session');
    if (!input) return undefined;

    const viewMode = readStorageValue<'tree' | 'hex'>(TOOL_ID, 'viewMode', 'local') ?? 'tree';
    const pemType = readStorageValue<string>(TOOL_ID, 'pemType', 'local') ?? 'CERTIFICATE';

    const preview = input.length > 40 ? `${input.slice(0, 40)}…` : input;
    return { state: { input, viewMode, pemType }, summary: `Inspecting PEM/DER: "${preview}"` };
  },

  restore(state): void {
    if (typeof state['input'] === 'string') writeStorageValue(TOOL_ID, 'input', 'session', state['input']);
    if (state['viewMode'] === 'tree' || state['viewMode'] === 'hex') writeStorageValue(TOOL_ID, 'viewMode', 'local', state['viewMode']);
    if (typeof state['pemType'] === 'string') writeStorageValue(TOOL_ID, 'pemType', 'local', state['pemType']);
  },
};
