import { WorkspaceSnapshot, WorkspaceStep } from "@dude/contracts/shared/models/workspace-step.model";
import { readStorageValue, writeStorageValue } from '../../core/workspace/workspace-storage-bridge';

const TOOL_ID = 'svg-data-uri';

export const workspaceStep: WorkspaceStep = {
  historyEligible: true,

  snapshot(): WorkspaceSnapshot | undefined {
    const direction = readStorageValue<'encode' | 'decode'>(TOOL_ID, 'direction', 'local') ?? 'encode';
    const svgInput = readStorageValue<string>(TOOL_ID, 'svgInput', 'session') ?? '';
    const uriInput = readStorageValue<string>(TOOL_ID, 'uriInput', 'session') ?? '';
    const active = direction === 'encode' ? svgInput : uriInput;
    if (!active) return undefined;

    const preview = active.length > 40 ? `${active.slice(0, 40)}…` : active;
    return {
      state: { direction, svgInput, uriInput },
      summary: `${direction === 'encode' ? 'Encoding' : 'Decoding'} "${preview}"`,
    };
  },

  restore(state): void {
    if (state['direction'] === 'encode' || state['direction'] === 'decode') {
      writeStorageValue(TOOL_ID, 'direction', 'local', state['direction']);
    }
    if (typeof state['svgInput'] === 'string') writeStorageValue(TOOL_ID, 'svgInput', 'session', state['svgInput']);
    if (typeof state['uriInput'] === 'string') writeStorageValue(TOOL_ID, 'uriInput', 'session', state['uriInput']);
  },
};
