import { WorkspaceSnapshot, WorkspaceStep } from "@dude/contracts/shared/models/workspace-step.model";
import { readStorageValue, writeStorageValue } from '../../core/workspace/workspace-storage-bridge';

const TOOL_ID = 'css-selector-tester';

export const workspaceStep: WorkspaceStep = {
  historyEligible: true,

  snapshot(): WorkspaceSnapshot | undefined {
    const selector = readStorageValue<string>(TOOL_ID, 'selector', 'session');
    if (!selector) return undefined;

    const html = readStorageValue<string>(TOOL_ID, 'html', 'session') ?? '';
    return { state: { html, selector }, summary: `CSS selector: "${selector}"` };
  },

  restore(state): void {
    if (typeof state['html'] === 'string') writeStorageValue(TOOL_ID, 'html', 'session', state['html']);
    if (typeof state['selector'] === 'string') writeStorageValue(TOOL_ID, 'selector', 'session', state['selector']);
  },
};
