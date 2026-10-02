import { WorkspaceSnapshot, WorkspaceStep } from "@dude/contracts/shared/models/workspace-step.model";
import { readStorageValue, writeStorageValue } from '../../core/workspace/workspace-storage-bridge';

const TOOL_ID = 'conventional-commit-builder';
const SESSION_FIELDS = ['scope', 'breaking', 'subject', 'body', 'breakingDescription', 'footers'] as const;

export const workspaceStep: WorkspaceStep = {
  historyEligible: true,

  snapshot(): WorkspaceSnapshot | undefined {
    const subject = readStorageValue<string>(TOOL_ID, 'subject', 'session');
    if (!subject) return undefined;

    const state: Record<string, unknown> = { type: readStorageValue<string>(TOOL_ID, 'type', 'local') ?? 'feat' };
    for (const key of SESSION_FIELDS) {
      const value = readStorageValue<unknown>(TOOL_ID, key, 'session');
      if (value !== undefined) state[key] = value;
    }
    return { state, summary: `Commit: "${subject}"` };
  },

  restore(state): void {
    if (typeof state['type'] === 'string') writeStorageValue(TOOL_ID, 'type', 'local', state['type']);
    for (const key of SESSION_FIELDS) {
      if (state[key] !== undefined) writeStorageValue(TOOL_ID, key, 'session', state[key]);
    }
  },
};
