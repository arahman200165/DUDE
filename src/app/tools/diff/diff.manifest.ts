import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'diff',
  title: 'Text Diff',
  description: 'Line-oriented diff between two blocks of text.',
  category: 'text',
  keywords: ['diff', 'compare', 'text', 'changes', 'delta'],
  route: '/tools/diff',
  load: () => import('./diff').then((m) => m.Diff),
  status: 'stable',
  persistence: { input: 'session', preferences: 'local' },
  execution: { worker: 'required' },
  io: { accepts: ['text'], produces: ['json'] },
};
