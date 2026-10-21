import { computeLineDiff } from '@dude/tool-engine/tools/diff/text-diff';
import { defineOffThreadTask } from '../../kit/off-thread';

export interface DiffTaskPayload { readonly left: string; readonly right: string }
export interface DiffTaskResult { readonly text: string; readonly added: number; readonly removed: number; readonly unchanged: number }

/**
 * Runs on the worklet worker runtime. The unified text is built there too (one line per diff line with the engine's
 * `+ ` / `- ` / two-space prefixes), so only one string and three counts cross back.
 */
export const diffTask = defineOffThreadTask((payload: DiffTaskPayload): DiffTaskResult => {
  'worklet';
  const { lines, summary } = computeLineDiff(payload.left, payload.right);
  const text = lines.map(line => `${line.type === 'add' ? '+ ' : line.type === 'remove' ? '- ' : '  '}${line.text}`).join('\n');
  return { text, added: summary.added, removed: summary.removed, unchanged: summary.unchanged };
});
