import { WorkspaceSnapshot, WorkspaceStep } from "@dude/contracts/shared/models/workspace-step.model";
import { readStorageValue, writeStorageValue } from '../../core/workspace/workspace-storage-bridge';

const TOOL_ID = 'k8s-cronjob-tester';

export const workspaceStep: WorkspaceStep = {
  historyEligible: true,

  snapshot(): WorkspaceSnapshot | undefined {
    const input = readStorageValue<string>(TOOL_ID, 'input', 'session');
    if (!input) return undefined;
    const count = readStorageValue<number>(TOOL_ID, 'count', 'local') ?? 5;
    return { state: { input, count }, summary: 'K8s CronJob schedule test' };
  },

  restore(state): void {
    if (typeof state['input'] === 'string') writeStorageValue(TOOL_ID, 'input', 'session', state['input']);
    if (typeof state['count'] === 'number') writeStorageValue(TOOL_ID, 'count', 'local', state['count']);
  },
};
