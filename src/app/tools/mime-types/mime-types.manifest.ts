import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'mime-types',
  title: 'MIME Type Reference',
  description:
    'Searchable reference of common IANA-registered MIME types with file-extension lookups.',
  category: 'web',
  keywords: ['mime', 'media type', 'content-type', 'file extension', 'reference'],
  route: '/tools/mime-types',
  load: () => import('./mime-types').then((m) => m.MimeTypes),
  status: 'stable',
  persistence: { input: 'local', preferences: 'local' },
  io: { accepts: ['text'], produces: ['json'] },
};
