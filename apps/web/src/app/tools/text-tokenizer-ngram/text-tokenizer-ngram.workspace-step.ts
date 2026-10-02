import { WorkspaceSnapshot, WorkspaceStep } from "@dude/contracts/shared/models/workspace-step.model";
import { readStorageValue, writeStorageValue } from '../../core/workspace/workspace-storage-bridge';
import { NGramLevel, TokenGranularity } from "@dude/tool-engine/tools/text-tokenizer-ngram/text-tokenizer-ngram-logic";

const TOOL_ID = 'text-tokenizer-ngram';
type Mode = 'tokenize' | 'ngram';

export const workspaceStep: WorkspaceStep = {
  historyEligible: true,

  snapshot(): WorkspaceSnapshot | undefined {
    const input = readStorageValue<string>(TOOL_ID, 'input', 'session');
    if (!input) return undefined;

    const mode = readStorageValue<Mode>(TOOL_ID, 'mode', 'local') ?? 'tokenize';
    const state = {
      input,
      mode,
      granularity: readStorageValue<TokenGranularity>(TOOL_ID, 'granularity', 'local') ?? 'word',
      ngramLevel: readStorageValue<NGramLevel>(TOOL_ID, 'ngramLevel', 'local') ?? 'word',
      n: readStorageValue<number>(TOOL_ID, 'n', 'local') ?? 2,
    };
    const preview = input.length > 40 ? `${input.slice(0, 40)}…` : input;
    return { state, summary: `${mode}: "${preview}"` };
  },

  restore(state): void {
    if (typeof state['input'] === 'string') writeStorageValue(TOOL_ID, 'input', 'session', state['input']);
    if (typeof state['mode'] === 'string') writeStorageValue(TOOL_ID, 'mode', 'local', state['mode']);
    if (typeof state['granularity'] === 'string') writeStorageValue(TOOL_ID, 'granularity', 'local', state['granularity']);
    if (typeof state['ngramLevel'] === 'string') writeStorageValue(TOOL_ID, 'ngramLevel', 'local', state['ngramLevel']);
    if (typeof state['n'] === 'number') writeStorageValue(TOOL_ID, 'n', 'local', state['n']);
  },
};
