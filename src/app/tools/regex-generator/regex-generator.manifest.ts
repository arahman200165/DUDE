import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'regex-generator',
  title: 'Regex Generator',
  description:
    'Generalizes a pattern from example strings (non-AI, heuristic), validated against every example and counter-example before being shown.',
  category: 'developer',
  keywords: ['regex', 'regexp', 'generate', 'generator', 'examples', 'heuristic', 'pattern'],
  route: '/tools/regex-generator',
  load: () => import('./regex-generator').then((m) => m.RegexGenerator),
  status: 'stable',
  persistence: { input: 'session', preferences: 'none' },
  execution: { worker: 'none' },
  io: { accepts: ['text'], produces: ['text'] },
};
