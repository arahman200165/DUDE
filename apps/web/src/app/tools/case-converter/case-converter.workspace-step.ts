import { WorkspaceSnapshot, WorkspaceStep } from "@dude/contracts/shared/models/workspace-step.model";
import { readStorageValue, writeStorageValue } from '../../core/workspace/workspace-storage-bridge';
import { CaseStyle } from "@dude/tool-engine/tools/case-converter/case-convert";

const TOOL_ID = 'case-converter';

export const workspaceStep: WorkspaceStep = {
  historyEligible: true,

  snapshot(): WorkspaceSnapshot | undefined {
    const input = readStorageValue<string>(TOOL_ID, 'input', 'session');
    if (!input) return undefined;

    const style = readStorageValue<CaseStyle>(TOOL_ID, 'style', 'local') ?? 'camel';
    const preview = input.length > 40 ? `${input.slice(0, 40)}…` : input;
    return { state: { input, style }, summary: `${style} case: "${preview}"` };
  },

  restore(state): void {
    if (typeof state['input'] === 'string') writeStorageValue(TOOL_ID, 'input', 'session', state['input']);
    if (typeof state['style'] === 'string') writeStorageValue(TOOL_ID, 'style', 'local', state['style']);
  },
};
