import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'epoch-timeline-visualizer',
  title: 'Epoch Timeline Visualizer',
  description:
    'Plots a list of labeled timestamps, or a start/end range, proportionally along a horizontal timeline relative to each other and to now.',
  category: 'date-time',
  keywords: ['timeline', 'epoch', 'visualize', 'timestamp', 'range', 'plot', 'now'],
  route: '/tools/epoch-timeline-visualizer',
  load: () => import('./epoch-timeline-visualizer').then((m) => m.EpochTimelineVisualizer),
  status: 'verified',
  verification: {
    propertyTested: true,
    summary: 'Fuzz-tested (fast-check): neverThrows on arbitrary input, plus invariants that the padded range always strictly contains a valid start/end or marker set.',
  },
  persistence: { input: 'session', preferences: 'local' },
  io: { accepts: ['text'], produces: ['json'] },
};
