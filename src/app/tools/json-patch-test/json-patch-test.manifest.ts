import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'json-patch-test',
  title: 'JSON Patch Tester',
  description: 'Apply an RFC 6902 JSON Patch to a JSON document and see the result.',
  category: 'data',
  keywords: ['json patch', 'rfc 6902', 'apply', 'test', 'patch'],
  route: '/tools/json-patch-test',
  load: () => import('./json-patch-test').then((m) => m.JsonPatchTest),
  status: 'stable',
  persistence: { input: 'session', preferences: 'local' },
  execution: { worker: 'optional' },
  io: { accepts: ['text', 'json'], produces: ['json'] },
};
