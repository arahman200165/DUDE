import { WorkspaceSnapshot, WorkspaceStep } from "@dude/contracts/shared/models/workspace-step.model";
import { readStorageValue, writeStorageValue } from '../../core/workspace/workspace-storage-bridge';
import { FindReplaceOptions, LineNumberOptions, PerLineTransform } from "@dude/tool-engine/tools/line-prefix-numbering/line-prefix-numbering-logic";

const TOOL_ID = 'line-prefix-numbering';
type Mode = 'prefix-suffix' | 'add-numbers' | 'remove-numbers' | 'transform';

export const workspaceStep: WorkspaceStep = {
  historyEligible: true,

  snapshot(): WorkspaceSnapshot | undefined {
    const input = readStorageValue<string>(TOOL_ID, 'input', 'session');
    if (!input) return undefined;

    const mode = readStorageValue<Mode>(TOOL_ID, 'mode', 'local') ?? 'prefix-suffix';
    const state: Record<string, unknown> = {
      input,
      mode,
      prefix: readStorageValue<string>(TOOL_ID, 'prefix', 'session') ?? '',
      suffix: readStorageValue<string>(TOOL_ID, 'suffix', 'session') ?? '',
      numberOptions: readStorageValue<LineNumberOptions>(TOOL_ID, 'numberOptions', 'local'),
      transform: readStorageValue<PerLineTransform>(TOOL_ID, 'transform', 'local'),
      findReplace: readStorageValue<FindReplaceOptions>(TOOL_ID, 'findReplace', 'session'),
    };
    const preview = input.length > 40 ? `${input.slice(0, 40)}…` : input;
    return { state, summary: `${mode}: "${preview}"` };
  },

  restore(state): void {
    if (typeof state['input'] === 'string') writeStorageValue(TOOL_ID, 'input', 'session', state['input']);
    if (typeof state['mode'] === 'string') writeStorageValue(TOOL_ID, 'mode', 'local', state['mode']);
    if (typeof state['prefix'] === 'string') writeStorageValue(TOOL_ID, 'prefix', 'session', state['prefix']);
    if (typeof state['suffix'] === 'string') writeStorageValue(TOOL_ID, 'suffix', 'session', state['suffix']);
    if (state['numberOptions']) writeStorageValue(TOOL_ID, 'numberOptions', 'local', state['numberOptions']);
    if (typeof state['transform'] === 'string') writeStorageValue(TOOL_ID, 'transform', 'local', state['transform']);
    if (state['findReplace']) writeStorageValue(TOOL_ID, 'findReplace', 'session', state['findReplace']);
  },
};
