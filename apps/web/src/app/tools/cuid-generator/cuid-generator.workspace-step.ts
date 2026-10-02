import { WorkspaceSnapshot, WorkspaceStep } from "@dude/contracts/shared/models/workspace-step.model";
import { readStorageValue, writeStorageValue } from '../../core/workspace/workspace-storage-bridge';

const TOOL_ID = 'cuid-generator';

export const workspaceStep: WorkspaceStep = {
  historyEligible: true,

  snapshot(): WorkspaceSnapshot | undefined {
    const generated = readStorageValue<readonly string[]>(TOOL_ID, 'generated', 'session') ?? [];
    if (generated.length === 0) return undefined;

    const count = readStorageValue<number>(TOOL_ID, 'count', 'local') ?? 5;
    const length = readStorageValue<number>(TOOL_ID, 'length', 'local') ?? 24;

    return { state: { generated, count, length }, summary: `Generated ${generated.length} CUID(s), latest ${generated[0]}` };
  },

  restore(state): void {
    if (Array.isArray(state['generated'])) writeStorageValue(TOOL_ID, 'generated', 'session', state['generated']);
    if (typeof state['count'] === 'number') writeStorageValue(TOOL_ID, 'count', 'local', state['count']);
    if (typeof state['length'] === 'number') writeStorageValue(TOOL_ID, 'length', 'local', state['length']);
  },
};
