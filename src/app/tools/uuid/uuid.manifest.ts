import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'uuid',
  title: 'UUID Generator / Inspector',
  description:
    'Generate v1/v3/v4/v5/v6/v7 UUIDs (with namespace support), inspect an existing UUID and its embedded timestamp, and bulk-export the generated list.',
  category: 'developer',
  keywords: [
    'uuid',
    'guid',
    'generate',
    'inspect',
    'identifier',
    'rfc 4122',
    'namespace',
    'v1',
    'v3',
    'v5',
    'v6',
    'v7',
  ],
  route: '/tools/uuid',
  pwaShortcut: { order: 8 },
  load: () => import('./uuid').then((m) => m.Uuid),
  status: 'verified',
  verification: {
    vectors: ['RFC 9562 Appendix A UUIDv1/v3/v4/v5/v6/v7 vectors'],
    propertyTested: true,
    summary: 'Generator-tested (fast-check): generated UUID versions validate; v5 generation is deterministic for fixed namespace/name inputs.',
  },
  persistence: { input: 'session', preferences: 'local' },
  io: { accepts: ['text'], produces: ['text', 'json', 'file'] },
};
