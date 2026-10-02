import { WorkspaceSnapshot, WorkspaceStep } from "@dude/contracts/shared/models/workspace-step.model";
import { readStorageValue, writeStorageValue } from '../../core/workspace/workspace-storage-bridge';

const TOOL_ID = 'percentage-ratio-calculator';

export const workspaceStep: WorkspaceStep = {
  historyEligible: true,

  snapshot(): WorkspaceSnapshot | undefined {
    const tab = readStorageValue<string>(TOOL_ID, 'tab', 'local') ?? 'percentage';
    const percentX = readStorageValue<string>(TOOL_ID, 'percentX', 'session');
    const ratioA = readStorageValue<string>(TOOL_ID, 'ratioA', 'session');
    const proportionA = readStorageValue<string>(TOOL_ID, 'proportionA', 'session');
    if (!percentX && !ratioA && !proportionA) return undefined;

    const state = {
      tab,
      percentMode: readStorageValue<string>(TOOL_ID, 'percentMode', 'local') ?? 'of',
      percentX,
      percentY: readStorageValue<string>(TOOL_ID, 'percentY', 'session'),
      ratioA,
      ratioB: readStorageValue<string>(TOOL_ID, 'ratioB', 'session'),
      proportionA,
      proportionB: readStorageValue<string>(TOOL_ID, 'proportionB', 'session'),
      proportionC: readStorageValue<string>(TOOL_ID, 'proportionC', 'session'),
    };
    return { state, summary: `Percentage/ratio (${tab})` };
  },

  restore(state): void {
    if (typeof state['tab'] === 'string') writeStorageValue(TOOL_ID, 'tab', 'local', state['tab']);
    if (typeof state['percentMode'] === 'string') writeStorageValue(TOOL_ID, 'percentMode', 'local', state['percentMode']);
    for (const key of ['percentX', 'percentY', 'ratioA', 'ratioB', 'proportionA', 'proportionB', 'proportionC'] as const) {
      if (typeof state[key] === 'string') writeStorageValue(TOOL_ID, key, 'session', state[key]);
    }
  },
};
