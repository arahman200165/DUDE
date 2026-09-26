import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'semver-comparator',
  title: 'Semantic Version Comparator',
  description: 'Compare, sort, and range-check versions against the Semantic Versioning spec.',
  category: 'developer',
  keywords: ['semver', 'semantic version', 'compare', 'sort', 'range', 'version'],
  route: '/tools/semver-comparator',
  load: () => import('./semver-comparator').then((m) => m.SemverComparator),
  status: 'verified',
  verification: {
    propertyTested: true,
    summary: 'Fuzz-tested valid self-comparison and sorting arbitrary version text.',
  },
  persistence: { input: 'session', preferences: 'local' },
  io: { accepts: ['text'], produces: ['json'] },
};
