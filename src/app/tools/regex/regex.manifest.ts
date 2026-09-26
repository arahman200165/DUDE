import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'regex',
  title: 'Regex Tester',
  description:
    'Test a regular expression against text with match/capture-group details, a plain-English explainer, cross-language flavor notes, and a replace mode.',
  category: 'developer',
  keywords: [
    'regex',
    'regexp',
    'pattern',
    'match',
    'test',
    'capture groups',
    'explain',
    'replace',
    'flavor',
    'pcre',
    'python',
    'java',
    'dotnet',
    'go re2',
  ],
  route: '/tools/regex',
  load: () => import('./regex').then((m) => m.Regex),
  status: 'verified',
  verification: {
    propertyTested: true,
    summary: 'Fuzz-tested safe literal matches against native global RegExp results and arbitrary flags with fixed-seed fast-check.',
  },
  persistence: { input: 'session', preferences: 'local' },
  execution: { worker: 'required' },
  io: { accepts: ['text'], produces: ['json'] },
};
