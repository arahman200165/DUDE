import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'json-merge',
  title: 'JSON Merge',
  description: 'Deep-merge two JSON documents, or apply an RFC 7396 JSON Merge Patch.',
  category: 'data',
  keywords: ['json', 'merge', 'combine', 'deep merge', 'merge patch', 'rfc 7396', 'union'],
  route: '/tools/json-merge',
  load: () => import('./json-merge').then((m) => m.JsonMerge),
  status: 'stable',
  persistence: { input: 'session', preferences: 'local' },
  execution: { worker: 'optional' },
  io: { accepts: ['text', 'json'], produces: ['json'] },
};
