import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'json-merge',
  title: 'JSON Merge',
  description: 'Deep-merge two JSON documents, or apply an RFC 7396 JSON Merge Patch.',
  category: 'data',
  keywords: ['json', 'merge', 'combine', 'deep merge', 'merge patch', 'rfc 7396', 'union'],
  route: '/tools/json-merge',
  load: () => import('./json-merge').then((m) => m.JsonMerge),
  status: 'verified',
  verification: {
    propertyTested: true,
    summary: 'Property-tested with fast-check using fuzz checks against arbitrary valid or malformed input.',
  },
  persistence: { input: 'session', preferences: 'local' },
  fileInput: { key: 'baseInput', extensions: ['.json'] },
  execution: { worker: 'optional' },
  io: { accepts: ['text', 'json', 'file'], produces: ['json', 'file'] },
};
