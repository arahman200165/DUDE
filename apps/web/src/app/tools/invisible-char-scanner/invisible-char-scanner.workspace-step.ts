import { WorkspaceSnapshot, WorkspaceStep } from "@dude/contracts/shared/models/workspace-step.model";
import { readStorageValue, writeStorageValue } from '../../core/workspace/workspace-storage-bridge';
import { InvisibleCharKind } from "@dude/tool-engine/tools/invisible-char-scanner/invisible-char-scan";

const TOOL_ID = 'invisible-char-scanner';

export const workspaceStep: WorkspaceStep = {
  historyEligible: true,

  snapshot(): WorkspaceSnapshot | undefined {
    const input = readStorageValue<string>(TOOL_ID, 'input', 'session');
    if (!input) return undefined;

    const stripKinds = readStorageValue<readonly InvisibleCharKind[]>(TOOL_ID, 'stripKinds', 'local');
    const preview = input.length > 40 ? `${input.slice(0, 40)}…` : input;
    return { state: { input, stripKinds }, summary: `Scanned "${preview}"` };
  },

  restore(state): void {
    if (typeof state['input'] === 'string') writeStorageValue(TOOL_ID, 'input', 'session', state['input']);
    if (Array.isArray(state['stripKinds'])) writeStorageValue(TOOL_ID, 'stripKinds', 'local', state['stripKinds']);
  },
};
