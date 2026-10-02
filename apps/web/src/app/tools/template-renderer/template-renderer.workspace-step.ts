import { WorkspaceSnapshot, WorkspaceStep } from "@dude/contracts/shared/models/workspace-step.model";
import { readStorageValue, writeStorageValue } from '../../core/workspace/workspace-storage-bridge';

const TOOL_ID = 'template-renderer';

/** Sandboxed execution tool — source only, mirrors python-playground.workspace-step.ts's precedent. */
export const workspaceStep: WorkspaceStep = {
  snapshot(): WorkspaceSnapshot | undefined {
    const template = readStorageValue<string>(TOOL_ID, 'template', 'session');
    if (!template) return undefined;
    const context = readStorageValue<string>(TOOL_ID, 'context', 'session') ?? '';
    return { state: { template, context }, summary: 'Template render source' };
  },

  restore(state): void {
    if (typeof state['template'] === 'string') writeStorageValue(TOOL_ID, 'template', 'session', state['template']);
    if (typeof state['context'] === 'string') writeStorageValue(TOOL_ID, 'context', 'session', state['context']);
  },
};
