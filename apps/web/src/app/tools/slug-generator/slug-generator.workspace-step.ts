import { WorkspaceSnapshot, WorkspaceStep } from "@dude/contracts/shared/models/workspace-step.model";
import { readStorageValue, writeStorageValue } from '../../core/workspace/workspace-storage-bridge';
import { SlugOptions } from "@dude/tool-engine/tools/slug-generator/slug-generate";

const TOOL_ID = 'slug-generator';

export const workspaceStep: WorkspaceStep = {
  historyEligible: true,

  snapshot(): WorkspaceSnapshot | undefined {
    const input = readStorageValue<string>(TOOL_ID, 'input', 'session');
    if (!input) return undefined;

    const options = readStorageValue<SlugOptions>(TOOL_ID, 'options', 'local');
    const preview = input.length > 40 ? `${input.slice(0, 40)}…` : input;
    return { state: { input, options }, summary: `Slug: "${preview}"` };
  },

  restore(state): void {
    if (typeof state['input'] === 'string') writeStorageValue(TOOL_ID, 'input', 'session', state['input']);
    if (state['options']) writeStorageValue(TOOL_ID, 'options', 'local', state['options']);
  },
};
