import { WorkspaceSnapshot, WorkspaceStep } from "@dude/contracts/shared/models/workspace-step.model";
import { readStorageValue, writeStorageValue } from '../../core/workspace/workspace-storage-bridge';

const TOOL_ID = 'semver-comparator';
const SESSION_FIELDS = ['versionA', 'versionB', 'list', 'rangeVersion', 'range', 'visualizeInput'] as const;
const LOCAL_FIELDS = ['tab', 'sortDirection'] as const;

export const workspaceStep: WorkspaceStep = {
  historyEligible: true,

  snapshot(): WorkspaceSnapshot | undefined {
    const tab = readStorageValue<string>(TOOL_ID, 'tab', 'local') ?? 'compare';
    const state: Record<string, unknown> = { tab };
    let hasContent = false;

    for (const key of SESSION_FIELDS) {
      const value = readStorageValue<string>(TOOL_ID, key, 'session');
      if (value !== undefined) {
        state[key] = value;
        hasContent = true;
      }
    }
    for (const key of LOCAL_FIELDS) {
      if (key === 'tab') continue;
      const value = readStorageValue<unknown>(TOOL_ID, key, 'local');
      if (value !== undefined) state[key] = value;
    }

    if (!hasContent) return undefined;
    return { state, summary: `Semver (${tab})` };
  },

  restore(state): void {
    if (typeof state['tab'] === 'string') writeStorageValue(TOOL_ID, 'tab', 'local', state['tab']);
    for (const key of SESSION_FIELDS) {
      if (typeof state[key] === 'string') writeStorageValue(TOOL_ID, key, 'session', state[key]);
    }
    if (typeof state['sortDirection'] === 'string') writeStorageValue(TOOL_ID, 'sortDirection', 'local', state['sortDirection']);
  },
};
