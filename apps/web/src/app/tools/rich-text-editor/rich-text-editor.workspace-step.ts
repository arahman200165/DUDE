import { WorkspaceSnapshot, WorkspaceStep } from "@dude/contracts/shared/models/workspace-step.model";
import { readStorageValue, writeStorageValue } from '../../core/workspace/workspace-storage-bridge';

const TOOL_ID = 'rich-text-editor';
const DEFAULT_CONTENT = '<p>Start typing…</p>';

export const workspaceStep: WorkspaceStep = {
  historyEligible: true,

  snapshot(): WorkspaceSnapshot | undefined {
    const contentHtml = readStorageValue<string>(TOOL_ID, 'contentHtml', 'session');
    if (!contentHtml || contentHtml === DEFAULT_CONTENT) return undefined;
    return { state: { contentHtml }, summary: 'Rich text document' };
  },

  restore(state): void {
    if (typeof state['contentHtml'] === 'string') writeStorageValue(TOOL_ID, 'contentHtml', 'session', state['contentHtml']);
  },
};
