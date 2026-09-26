import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'json-pointer',
  title: 'JSON Pointer Tester',
  description: 'Resolve an RFC 6901 JSON Pointer against a JSON document.',
  category: 'data',
  keywords: ['json pointer', 'rfc 6901', 'resolve', 'path', 'query'],
  route: '/tools/json-pointer',
  load: () => import('./json-pointer').then((m) => m.JsonPointer),
  status: 'verified',
  verification: {
    propertyTested: true,
    summary: 'Property-tested with fast-check using fuzz checks against arbitrary valid or malformed input.',
  },
  persistence: { input: 'session', preferences: 'local' },
  execution: { worker: 'optional' },
  io: { accepts: ['text', 'json'], produces: ['json'] },
};
