import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'regex-visualizer',
  title: 'Regex Visualizer',
  description: 'Renders a regular expression as a railroad syntax diagram.',
  category: 'developer',
  keywords: ['regex', 'regexp', 'railroad diagram', 'visualize', 'syntax diagram', 'pattern'],
  route: '/tools/regex-visualizer',
  load: () => import('./regex-visualizer').then((m) => m.RegexVisualizer),
  status: 'verified',
  verification: {
    propertyTested: true,
    summary: 'Fuzz-tested parse error handling and diagram creation for safe regex literals with fixed-seed fast-check.',
  },
  persistence: { input: 'session', preferences: 'none' },
  execution: { worker: 'none' },
  io: { accepts: ['text'], produces: ['text'] },
};
