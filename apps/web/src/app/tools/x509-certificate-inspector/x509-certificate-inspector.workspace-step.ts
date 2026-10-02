import { WorkspaceSnapshot, WorkspaceStep } from "@dude/contracts/shared/models/workspace-step.model";
import { readStorageValue, writeStorageValue } from '../../core/workspace/workspace-storage-bridge';

const TOOL_ID = 'x509-certificate-inspector';

/**
 * X.509 certificates are public documents by design — never private keys — so, unlike most of
 * this batch, this tool is history-eligible.
 */
export const workspaceStep: WorkspaceStep = {
  historyEligible: true,

  snapshot(): WorkspaceSnapshot | undefined {
    const input = readStorageValue<string>(TOOL_ID, 'input', 'session');
    if (!input) return undefined;

    const tab = readStorageValue<string>(TOOL_ID, 'tab', 'local') ?? 'overview';
    const preview = input.length > 40 ? `${input.slice(0, 40)}…` : input;
    return { state: { tab, input }, summary: `Inspecting certificate: "${preview}"` };
  },

  restore(state): void {
    if (typeof state['tab'] === 'string') writeStorageValue(TOOL_ID, 'tab', 'local', state['tab']);
    if (typeof state['input'] === 'string') writeStorageValue(TOOL_ID, 'input', 'session', state['input']);
  },
};
