import { WorkspaceSnapshot, WorkspaceStep } from "@dude/contracts/shared/models/workspace-step.model";
import { readStorageValue, writeStorageValue } from '../../core/workspace/workspace-storage-bridge';
import { PaletteType } from "@dude/tool-engine/tools/palette-generator/palette-generator-logic";

const TOOL_ID = 'palette-generator';

export const workspaceStep: WorkspaceStep = {
  historyEligible: true,

  snapshot(): WorkspaceSnapshot | undefined {
    const input = readStorageValue<string>(TOOL_ID, 'input', 'session');
    if (!input) return undefined;

    const type = readStorageValue<PaletteType>(TOOL_ID, 'type', 'local') ?? 'complementary';
    return { state: { input, type }, summary: `${type} palette from ${input}` };
  },

  restore(state): void {
    if (typeof state['input'] === 'string') writeStorageValue(TOOL_ID, 'input', 'session', state['input']);
    if (typeof state['type'] === 'string') writeStorageValue(TOOL_ID, 'type', 'local', state['type']);
  },
};
