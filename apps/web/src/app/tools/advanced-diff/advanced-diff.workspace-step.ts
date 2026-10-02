import { WorkspaceSnapshot, WorkspaceStep } from "@dude/contracts/shared/models/workspace-step.model";
import { readStorageValue, writeStorageValue } from '../../core/workspace/workspace-storage-bridge';
import { IgnoreOptions } from "@dude/tool-engine/tools/advanced-diff/diff-normalize";
import { DiffGranularity, DiffMode } from "@dude/tool-engine/tools/advanced-diff/advanced-diff-payload";
import { DiffInputMode, DiffViewMode, MergeMode } from './advanced-diff';

const TOOL_ID = 'advanced-diff';

/**
 * Multi-input tool — captures both text sides plus the three-way merge base. Image inputs are
 * deliberately excluded: they're held in-memory-only `File` objects, never JSON-serializable and
 * never written to storage by the tool itself.
 */
export const workspaceStep: WorkspaceStep = {
  historyEligible: true,

  snapshot(): WorkspaceSnapshot | undefined {
    const left = readStorageValue<string>(TOOL_ID, 'left', 'session');
    const right = readStorageValue<string>(TOOL_ID, 'right', 'session');
    if (!left && !right) return undefined;

    const state = {
      left: left ?? '',
      right: right ?? '',
      base: readStorageValue<string>(TOOL_ID, 'base', 'session') ?? '',
      inputMode: readStorageValue<DiffInputMode>(TOOL_ID, 'inputMode', 'local') ?? 'paste',
      mode: readStorageValue<DiffMode>(TOOL_ID, 'mode', 'local') ?? 'text',
      granularity: readStorageValue<DiffGranularity>(TOOL_ID, 'granularity', 'local') ?? 'line',
      viewMode: readStorageValue<DiffViewMode>(TOOL_ID, 'viewMode', 'local') ?? 'diff',
      paneRatio: readStorageValue<number>(TOOL_ID, 'paneRatio', 'local') ?? 0.5,
      mergeMode: readStorageValue<MergeMode>(TOOL_ID, 'mergeMode', 'local') ?? 'two-way',
      ignoreOptions: readStorageValue<IgnoreOptions>(TOOL_ID, 'ignoreOptions', 'local'),
      detectMovedBlocks: readStorageValue<boolean>(TOOL_ID, 'detectMovedBlocks', 'local') ?? false,
      imageThreshold: readStorageValue<number>(TOOL_ID, 'imageThreshold', 'local') ?? 0.1,
    };
    return { state, summary: 'Advanced diff' };
  },

  restore(state): void {
    if (typeof state['left'] === 'string') writeStorageValue(TOOL_ID, 'left', 'session', state['left']);
    if (typeof state['right'] === 'string') writeStorageValue(TOOL_ID, 'right', 'session', state['right']);
    if (typeof state['base'] === 'string') writeStorageValue(TOOL_ID, 'base', 'session', state['base']);
    if (typeof state['inputMode'] === 'string') writeStorageValue(TOOL_ID, 'inputMode', 'local', state['inputMode']);
    if (typeof state['mode'] === 'string') writeStorageValue(TOOL_ID, 'mode', 'local', state['mode']);
    if (typeof state['granularity'] === 'string') writeStorageValue(TOOL_ID, 'granularity', 'local', state['granularity']);
    if (typeof state['viewMode'] === 'string') writeStorageValue(TOOL_ID, 'viewMode', 'local', state['viewMode']);
    if (typeof state['paneRatio'] === 'number') writeStorageValue(TOOL_ID, 'paneRatio', 'local', state['paneRatio']);
    if (typeof state['mergeMode'] === 'string') writeStorageValue(TOOL_ID, 'mergeMode', 'local', state['mergeMode']);
    if (state['ignoreOptions']) writeStorageValue(TOOL_ID, 'ignoreOptions', 'local', state['ignoreOptions']);
    if (typeof state['detectMovedBlocks'] === 'boolean') {
      writeStorageValue(TOOL_ID, 'detectMovedBlocks', 'local', state['detectMovedBlocks']);
    }
    if (typeof state['imageThreshold'] === 'number') writeStorageValue(TOOL_ID, 'imageThreshold', 'local', state['imageThreshold']);
  },
};
