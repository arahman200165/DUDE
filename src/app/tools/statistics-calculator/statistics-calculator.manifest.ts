import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'statistics-calculator',
  title: 'Statistics Calculator',
  description:
    'Count, sum, mean, median, mode, range, quartiles/IQR, and population/sample variance and standard deviation.',
  category: 'developer',
  keywords: [
    'statistics',
    'mean',
    'median',
    'mode',
    'standard deviation',
    'variance',
    'quartile',
    'iqr',
  ],
  route: '/tools/statistics-calculator',
  load: () => import('./statistics-calculator').then((m) => m.StatisticsCalculator),
  status: 'verified',
  verification: {
    propertyTested: true,
    summary: 'Fuzz-tested (fast-check): count, sum, minimum, maximum, and range agree with generated input lists.',
  },
  persistence: { input: 'session', preferences: 'none' },
  execution: { worker: 'none' },
  io: { accepts: ['text'], produces: ['json', 'text'] },
};
