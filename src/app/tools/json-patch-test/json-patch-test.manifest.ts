import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'json-patch-test',
  title: 'JSON Patch Tester',
  description: 'Apply an RFC 6902 JSON Patch to a JSON document and see the result.',
  category: 'data',
  keywords: ['json patch', 'rfc 6902', 'apply', 'test', 'patch'],
  route: '/tools/json-patch-test',
  load: () => import('./json-patch-test').then((m) => m.JsonPatchTest),
  status: 'verified',
  verification: {
    vectors: ['RFC 6902 Appendix A.1, A.2, A.14, and A.16 examples'],
    propertyTested: true,
    summary: 'Property-tested with fast-check using core-only fuzz checks against arbitrary valid or malformed input.',
  },
  persistence: { input: 'session', preferences: 'local' },
  execution: { worker: 'optional' },
  io: { accepts: ['text', 'json'], produces: ['json'] },
};
