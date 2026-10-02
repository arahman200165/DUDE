import { WorkspaceSnapshot, WorkspaceStep } from "@dude/contracts/shared/models/workspace-step.model";
import { readStorageValue, writeStorageValue } from '../../core/workspace/workspace-storage-bridge';

const TOOL_ID = 'expression-evaluator';

export const workspaceStep: WorkspaceStep = {
  historyEligible: true,

  snapshot(): WorkspaceSnapshot | undefined {
    const expression = readStorageValue<string>(TOOL_ID, 'expression', 'session');
    if (!expression) return undefined;

    const variables = readStorageValue<readonly { key: string; value: string }[]>(TOOL_ID, 'variables', 'session') ?? [];
    return { state: { expression, variables }, summary: `Expression: "${expression}"` };
  },

  restore(state): void {
    if (typeof state['expression'] === 'string') writeStorageValue(TOOL_ID, 'expression', 'session', state['expression']);
    if (Array.isArray(state['variables'])) writeStorageValue(TOOL_ID, 'variables', 'session', state['variables']);
  },
};
