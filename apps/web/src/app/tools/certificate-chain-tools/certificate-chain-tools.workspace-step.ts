import { WorkspaceSnapshot, WorkspaceStep } from "@dude/contracts/shared/models/workspace-step.model";
import { readStorageValue, writeStorageValue } from '../../core/workspace/workspace-storage-bridge';

const TOOL_ID = 'certificate-chain-tools';

/**
 * A PEM bundle of certificates is public material by design — never a private key — so, like
 * x509-certificate-inspector, this tool is history-eligible.
 */
export const workspaceStep: WorkspaceStep = {
  historyEligible: true,

  snapshot(): WorkspaceSnapshot | undefined {
    const input = readStorageValue<string>(TOOL_ID, 'input', 'session');
    if (!input) return undefined;

    const preview = input.length > 40 ? `${input.slice(0, 40)}…` : input;
    return { state: { input }, summary: `Certificate chain: "${preview}"` };
  },

  restore(state): void {
    if (typeof state['input'] === 'string') writeStorageValue(TOOL_ID, 'input', 'session', state['input']);
  },
};
