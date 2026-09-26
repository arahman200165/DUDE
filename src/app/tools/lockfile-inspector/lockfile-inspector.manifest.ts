import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'lockfile-inspector',
  title: 'Lockfile Inspector',
  description:
    'Parses a package-lock.json, pnpm-lock.yaml, or yarn.lock into a searchable table of resolved package versions and their dependencies.',
  category: 'developer',
  keywords: [
    'lockfile',
    'package-lock',
    'pnpm-lock',
    'yarn.lock',
    'npm',
    'pnpm',
    'yarn',
    'dependencies',
  ],
  route: '/tools/lockfile-inspector',
  load: () => import('./lockfile-inspector').then((m) => m.LockfileInspector),
  status: 'verified',
  verification: {
    propertyTested: true,
    summary: 'Property-tested (fast-check) for core output shape and invariants.',
  },
  persistence: { input: 'none', preferences: 'local' },
  io: { accepts: ['text', 'file'], produces: ['table'] },
};

