import { WorkspaceSnapshot, WorkspaceStep } from "@dude/contracts/shared/models/workspace-step.model";
import { readStorageValue, writeStorageValue } from '../../core/workspace/workspace-storage-bridge';

const TOOL_ID = 'nanoid-generator';

export const workspaceStep: WorkspaceStep = {
  historyEligible: true,

  snapshot(): WorkspaceSnapshot | undefined {
    const generated = readStorageValue<readonly string[]>(TOOL_ID, 'generated', 'session') ?? [];
    if (generated.length === 0) return undefined;

    const count = readStorageValue<number>(TOOL_ID, 'count', 'local') ?? 5;
    const size = readStorageValue<number>(TOOL_ID, 'size', 'local') ?? 21;
    const alphabet = readStorageValue<string>(TOOL_ID, 'alphabet', 'local') ?? '';

    return { state: { generated, count, size, alphabet }, summary: `Generated ${generated.length} Nano ID(s), latest ${generated[0]}` };
  },

  restore(state): void {
    if (Array.isArray(state['generated'])) writeStorageValue(TOOL_ID, 'generated', 'session', state['generated']);
    if (typeof state['count'] === 'number') writeStorageValue(TOOL_ID, 'count', 'local', state['count']);
    if (typeof state['size'] === 'number') writeStorageValue(TOOL_ID, 'size', 'local', state['size']);
    if (typeof state['alphabet'] === 'string') writeStorageValue(TOOL_ID, 'alphabet', 'local', state['alphabet']);
  },
};
