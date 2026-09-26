import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'regex-benchmark',
  title: 'Regex Benchmark',
  description:
    'Flags catastrophic-backtracking risk shapes in a pattern, and times it against sample inputs in a worker with a per-sample timeout.',
  category: 'developer',
  keywords: [
    'regex',
    'regexp',
    'benchmark',
    'redos',
    'catastrophic backtracking',
    'timing',
    'performance',
  ],
  route: '/tools/regex-benchmark',
  load: () => import('./regex-benchmark').then((m) => m.RegexBenchmark),
  status: 'stable',
  persistence: { input: 'session', preferences: 'local' },
  execution: { worker: 'required' },
  io: { accepts: ['text'], produces: ['json'] },
};
