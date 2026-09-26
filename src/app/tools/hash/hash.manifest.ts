import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'hash',
  title: 'Hash Generator',
  description: 'MD5, SHA-1, SHA-256, SHA-384, and SHA-512 digests for text.',
  category: 'security',
  keywords: ['hash', 'checksum', 'md5', 'sha1', 'sha256', 'sha512', 'digest'],
  route: '/tools/hash',
  load: () => import('./hash').then((m) => m.Hash),
  status: 'stable',
  persistence: { input: 'session', preferences: 'local' },
  execution: { worker: 'required' },
  io: { accepts: ['text'], produces: ['text'] },
};
