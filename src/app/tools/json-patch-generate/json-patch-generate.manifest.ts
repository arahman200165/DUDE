import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'json-patch-generate',
  title: 'JSON Patch Generator',
  description: 'Diff two JSON documents into an RFC 6902 JSON Patch.',
  category: 'data',
  keywords: ['json patch', 'rfc 6902', 'diff', 'compare', 'generate'],
  route: '/tools/json-patch-generate',
  load: () => import('./json-patch-generate').then((m) => m.JsonPatchGenerate),
  status: 'verified',
  verification: {
    propertyTested: true,
    summary: 'Property-tested with fast-check using generator output-shape checks against arbitrary valid or malformed input.',
  },
  persistence: { input: 'session', preferences: 'local' },
  execution: { worker: 'optional' },
  io: { accepts: ['text', 'json'], produces: ['json'] },
};
