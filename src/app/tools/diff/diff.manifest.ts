import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'diff',
  title: 'Text Diff',
  description: 'Line-oriented diff between two blocks of text.',
  category: 'text',
  keywords: ['diff', 'compare', 'text', 'changes', 'delta'],
  route: '/tools/diff',
  load: () => import('./diff').then((m) => m.Diff),
  status: 'verified',
  verification: {
    propertyTested: true,
    summary: 'Fuzz-tested (fast-check) against computeLineDiff: never throws, summary counts always match the diff-line count, and identical text always diffs as all-equal.',
  },
  persistence: { input: 'session', preferences: 'local' },
  execution: { worker: 'required' },
  io: { accepts: ['text', 'file'], produces: ['json'] },
};
