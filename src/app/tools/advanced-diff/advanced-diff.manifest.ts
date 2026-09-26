import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'advanced-diff',
  title: 'Advanced Diff / Merge',
  shortTitle: 'Advanced Diff',
  description:
    'Line, word, character, semantic JSON/YAML/XML, or image diffing with a side-by-side two-way or three-way merge view, file upload, and unified-diff export.',
  category: 'text',
  keywords: [
    'diff',
    'merge',
    'patch',
    'unified diff',
    'compare',
    'word diff',
    'character diff',
    'hunks',
    'three-way merge',
    'base',
    'common ancestor',
    'ignore whitespace',
    'ignore case',
    'ignore line endings',
    'semantic diff',
    'json diff',
    'yaml diff',
    'xml diff',
    'moved block',
    'image diff',
    'pixel diff',
  ],
  route: '/tools/advanced-diff',
  load: () => import('./advanced-diff').then((m) => m.AdvancedDiff),
  status: 'verified',
  verification: {
    propertyTested: true,
    summary:
      'Fuzz-tested (fast-check) against the pure diff-normalize/unified-diff core, plus an invariant proving hunk resolution reconstructs the exact original left/right text from the diff-hunks core.',
  },
  persistence: { input: 'session', preferences: 'local' },
  execution: { worker: 'required' },
  io: { accepts: ['text', 'file'], produces: ['json', 'text', 'file'] },
};
