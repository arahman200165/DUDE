import { WorkspaceSnapshot, WorkspaceStep } from "@dude/contracts/shared/models/workspace-step.model";
import { readStorageValue, writeStorageValue } from '../../core/workspace/workspace-storage-bridge';
import { LoremOptions } from "@dude/tool-engine/tools/lorem-ipsum-generator/lorem-ipsum-generate";

const TOOL_ID = 'lorem-ipsum-generator';

/** No text input — just a persisted options object, always meaningful, so snapshot() never returns undefined. */
export const workspaceStep: WorkspaceStep = {
  historyEligible: true,

  snapshot(): WorkspaceSnapshot {
    const options = readStorageValue<LoremOptions>(TOOL_ID, 'options', 'local') ?? {
      source: 'classic',
      unit: 'paragraphs',
      count: 3,
      format: 'plain',
    };
    return { state: { options }, summary: `Lorem ipsum: ${options.count} ${options.unit}` };
  },

  restore(state): void {
    if (state['options']) writeStorageValue(TOOL_ID, 'options', 'local', state['options']);
  },
};
