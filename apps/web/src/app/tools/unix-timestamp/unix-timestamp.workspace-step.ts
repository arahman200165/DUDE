import { WorkspaceSnapshot, WorkspaceStep } from "@dude/contracts/shared/models/workspace-step.model";
import { readStorageValue, writeStorageValue } from '../../core/workspace/workspace-storage-bridge';

const TOOL_ID = 'unix-timestamp';

export const workspaceStep: WorkspaceStep = {
  historyEligible: true,

  snapshot(): WorkspaceSnapshot | undefined {
    const timestampInput = readStorageValue<string>(TOOL_ID, 'timestampInput', 'session') ?? '';
    const dateInput = readStorageValue<string>(TOOL_ID, 'dateInput', 'session') ?? '';
    if (!timestampInput && !dateInput) return undefined;

    const unit = readStorageValue<string>(TOOL_ID, 'unit', 'local') ?? 'auto';
    const tz = readStorageValue<string>(TOOL_ID, 'tz', 'local') ?? 'local';
    const preview = timestampInput || dateInput;
    return {
      state: { timestampInput, dateInput, unit, tz },
      summary: `Timestamp: "${preview.length > 40 ? `${preview.slice(0, 40)}…` : preview}"`,
    };
  },

  restore(state): void {
    if (typeof state['timestampInput'] === 'string') writeStorageValue(TOOL_ID, 'timestampInput', 'session', state['timestampInput']);
    if (typeof state['dateInput'] === 'string') writeStorageValue(TOOL_ID, 'dateInput', 'session', state['dateInput']);
    if (typeof state['unit'] === 'string') writeStorageValue(TOOL_ID, 'unit', 'local', state['unit']);
    if (typeof state['tz'] === 'string') writeStorageValue(TOOL_ID, 'tz', 'local', state['tz']);
  },
};
