import { WorkspaceSnapshot, WorkspaceStep } from "@dude/contracts/shared/models/workspace-step.model";
import { readStorageValue, writeStorageValue } from '../../core/workspace/workspace-storage-bridge';
import { RegexMode } from './regex';
import type { RegexFlavor } from "@dude/tool-engine/tools/regex/regex-flavor-notes";

const TOOL_ID = 'regex';

export const workspaceStep: WorkspaceStep = {
  historyEligible: true,

  snapshot(): WorkspaceSnapshot | undefined {
    const pattern = readStorageValue<string>(TOOL_ID, 'pattern', 'session');
    if (!pattern) return undefined;

    const testText = readStorageValue<string>(TOOL_ID, 'testText', 'session') ?? '';
    const flags = readStorageValue<string>(TOOL_ID, 'flags', 'local') ?? 'g';
    const mode = readStorageValue<RegexMode>(TOOL_ID, 'mode', 'local') ?? 'match';
    const replacement = readStorageValue<string>(TOOL_ID, 'replacement', 'session') ?? '';
    const flavor = readStorageValue<RegexFlavor>(TOOL_ID, 'flavor', 'local') ?? 'js';

    return {
      state: { pattern, testText, flags, mode, replacement, flavor },
      summary: `Regex ${mode}: /${pattern}/${flags}`,
    };
  },

  restore(state): void {
    if (typeof state['pattern'] === 'string') writeStorageValue(TOOL_ID, 'pattern', 'session', state['pattern']);
    if (typeof state['testText'] === 'string') writeStorageValue(TOOL_ID, 'testText', 'session', state['testText']);
    if (typeof state['flags'] === 'string') writeStorageValue(TOOL_ID, 'flags', 'local', state['flags']);
    if (state['mode'] === 'match' || state['mode'] === 'replace') writeStorageValue(TOOL_ID, 'mode', 'local', state['mode']);
    if (typeof state['replacement'] === 'string') writeStorageValue(TOOL_ID, 'replacement', 'session', state['replacement']);
    if (typeof state['flavor'] === 'string') writeStorageValue(TOOL_ID, 'flavor', 'local', state['flavor']);
  },
};
