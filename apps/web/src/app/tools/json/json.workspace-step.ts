import { WorkspaceSnapshot, WorkspaceStep } from "@dude/contracts/shared/models/workspace-step.model";
import { readStorageValue, writeStorageValue } from '../../core/workspace/workspace-storage-bridge';
import { JsonIndent, JsonMode } from "@dude/tool-engine/tools/json/json-format";
import { JsonView } from './json';

const TOOL_ID = 'json';

/** The "local-heavy preference tool" proof-of-concept: three of five fields are `local`-policy. */
export const workspaceStep: WorkspaceStep = {
  historyEligible: true,

  snapshot(): WorkspaceSnapshot | undefined {
    const input = readStorageValue<string>(TOOL_ID, 'input', 'session');
    if (!input) return undefined;

    const mode = readStorageValue<JsonMode>(TOOL_ID, 'mode', 'local') ?? 'pretty';
    const indent = readStorageValue<JsonIndent>(TOOL_ID, 'indent', 'local') ?? 2;
    const view = readStorageValue<JsonView>(TOOL_ID, 'view', 'local') ?? 'text';
    const compareRight = readStorageValue<string>(TOOL_ID, 'compareRight', 'session') ?? '';

    const preview = input.length > 40 ? `${input.slice(0, 40)}…` : input;
    const state: Record<string, unknown> = { input, mode, indent, view, compareRight };
    return { state, summary: `JSON (${mode}): "${preview}"` };
  },

  restore(state): void {
    if (typeof state['input'] === 'string') writeStorageValue(TOOL_ID, 'input', 'session', state['input']);
    if (state['mode'] === 'pretty' || state['mode'] === 'minify' || state['mode'] === 'validate') {
      writeStorageValue(TOOL_ID, 'mode', 'local', state['mode']);
    }
    if (state['indent'] === 'tab' || typeof state['indent'] === 'number') {
      writeStorageValue(TOOL_ID, 'indent', 'local', state['indent']);
    }
    if (state['view'] === 'text' || state['view'] === 'tree' || state['view'] === 'compare') {
      writeStorageValue(TOOL_ID, 'view', 'local', state['view']);
    }
    if (typeof state['compareRight'] === 'string') {
      writeStorageValue(TOOL_ID, 'compareRight', 'session', state['compareRight']);
    }
  },
};
