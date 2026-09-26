import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'timezone-offset-comparator',
  title: 'Timezone Offset Comparator',
  description:
    'Compares UTC offsets across a full year, or pairwise, and shows when an asymmetric DST schedule changes the gap between two zones.',
  category: 'date-time',
  keywords: ['timezone', 'offset', 'compare', 'dst', 'utc offset', 'gap', 'ahead', 'behind'],
  route: '/tools/timezone-offset-comparator',
  load: () => import('./timezone-offset-comparator').then((m) => m.TimezoneOffsetComparator),
  status: 'verified',
  verification: {
    propertyTested: true,
    summary: 'Fuzz-tested (fast-check): neverThrows on arbitrary input, plus invariants that monthly offsets are well-formed and that swapping zones in the pairwise comparison negates the gap.',
  },
  persistence: { input: 'session', preferences: 'local' },
  io: { accepts: ['text'], produces: ['table', 'json'] },
};
