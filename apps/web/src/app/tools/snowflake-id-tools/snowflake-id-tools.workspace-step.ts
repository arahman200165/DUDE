import { WorkspaceSnapshot, WorkspaceStep } from "@dude/contracts/shared/models/workspace-step.model";
import { readStorageValue, writeStorageValue } from '../../core/workspace/workspace-storage-bridge';
import type { SnowflakePreset } from "@dude/tool-engine/tools/snowflake-id-tools/snowflake-logic";

const TOOL_ID = 'snowflake-id-tools';

export const workspaceStep: WorkspaceStep = {
  historyEligible: true,

  snapshot(): WorkspaceSnapshot | undefined {
    const generated = readStorageValue<readonly string[]>(TOOL_ID, 'generated', 'session') ?? [];
    const inspectInput = readStorageValue<string>(TOOL_ID, 'inspect', 'session') ?? '';
    if (generated.length === 0 && !inspectInput) return undefined;

    const preset = readStorageValue<SnowflakePreset>(TOOL_ID, 'preset', 'local') ?? 'twitter';
    const customEpoch = readStorageValue<number>(TOOL_ID, 'customEpoch', 'local') ?? Date.now();
    const customWorkerBits = readStorageValue<number>(TOOL_ID, 'customWorkerBits', 'local') ?? 10;
    const customSequenceBits = readStorageValue<number>(TOOL_ID, 'customSequenceBits', 'local') ?? 12;
    const workerId = readStorageValue<number>(TOOL_ID, 'workerId', 'local') ?? 1;

    const summary = generated.length > 0 ? `Generated ${generated.length} Snowflake ID(s), latest ${generated[0]}` : `Inspecting Snowflake ID "${inspectInput}"`;
    return { state: { generated, inspectInput, preset, customEpoch, customWorkerBits, customSequenceBits, workerId }, summary };
  },

  restore(state): void {
    if (Array.isArray(state['generated'])) writeStorageValue(TOOL_ID, 'generated', 'session', state['generated']);
    if (typeof state['inspectInput'] === 'string') writeStorageValue(TOOL_ID, 'inspect', 'session', state['inspectInput']);
    if (typeof state['preset'] === 'string') writeStorageValue(TOOL_ID, 'preset', 'local', state['preset']);
    if (typeof state['customEpoch'] === 'number') writeStorageValue(TOOL_ID, 'customEpoch', 'local', state['customEpoch']);
    if (typeof state['customWorkerBits'] === 'number') writeStorageValue(TOOL_ID, 'customWorkerBits', 'local', state['customWorkerBits']);
    if (typeof state['customSequenceBits'] === 'number') writeStorageValue(TOOL_ID, 'customSequenceBits', 'local', state['customSequenceBits']);
    if (typeof state['workerId'] === 'number') writeStorageValue(TOOL_ID, 'workerId', 'local', state['workerId']);
  },
};
