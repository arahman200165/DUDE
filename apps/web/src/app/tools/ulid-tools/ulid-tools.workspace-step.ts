import { WorkspaceSnapshot, WorkspaceStep } from "@dude/contracts/shared/models/workspace-step.model";
import { readStorageValue, writeStorageValue } from '../../core/workspace/workspace-storage-bridge';

const TOOL_ID = 'ulid-tools';

export const workspaceStep: WorkspaceStep = {
  historyEligible: true,

  snapshot(): WorkspaceSnapshot | undefined {
    const generated = readStorageValue<readonly string[]>(TOOL_ID, 'generated', 'session') ?? [];
    const inspectInput = readStorageValue<string>(TOOL_ID, 'inspect', 'session') ?? '';
    if (generated.length === 0 && !inspectInput) return undefined;

    const monotonic = readStorageValue<boolean>(TOOL_ID, 'monotonic', 'local') ?? false;
    const summary = generated.length > 0 ? `Generated ${generated.length} ULID(s), latest ${generated[0]}` : `Inspecting ULID "${inspectInput}"`;
    return { state: { generated, inspectInput, monotonic }, summary };
  },

  restore(state): void {
    if (Array.isArray(state['generated'])) writeStorageValue(TOOL_ID, 'generated', 'session', state['generated']);
    if (typeof state['inspectInput'] === 'string') writeStorageValue(TOOL_ID, 'inspect', 'session', state['inspectInput']);
    if (typeof state['monotonic'] === 'boolean') writeStorageValue(TOOL_ID, 'monotonic', 'local', state['monotonic']);
  },
};
