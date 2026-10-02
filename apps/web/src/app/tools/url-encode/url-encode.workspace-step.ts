import { WorkspaceSnapshot, WorkspaceStep } from "@dude/contracts/shared/models/workspace-step.model";
import { readStorageValue, writeStorageValue } from '../../core/workspace/workspace-storage-bridge';
import { UrlEncodeOperation, UrlEncodeVariant } from "@dude/tool-engine/tools/url-encode/url-encode-codec";

const TOOL_ID = 'url-encode';

export const workspaceStep: WorkspaceStep = {
  historyEligible: true,

  snapshot(): WorkspaceSnapshot | undefined {
    const input = readStorageValue<string>(TOOL_ID, 'input', 'session');
    if (!input) return undefined;

    const operation = readStorageValue<UrlEncodeOperation>(TOOL_ID, 'operation', 'local') ?? 'encode';
    const variant = readStorageValue<UrlEncodeVariant>(TOOL_ID, 'variant', 'local') ?? 'component';
    const preview = input.length > 40 ? `${input.slice(0, 40)}…` : input;
    return { state: { input, operation, variant }, summary: `${operation === 'encode' ? 'Encoding' : 'Decoding'} "${preview}"` };
  },

  restore(state): void {
    if (typeof state['input'] === 'string') writeStorageValue(TOOL_ID, 'input', 'session', state['input']);
    if (state['operation'] === 'encode' || state['operation'] === 'decode') writeStorageValue(TOOL_ID, 'operation', 'local', state['operation']);
    if (typeof state['variant'] === 'string') writeStorageValue(TOOL_ID, 'variant', 'local', state['variant']);
  },
};
