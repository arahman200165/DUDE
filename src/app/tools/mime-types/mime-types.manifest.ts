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
  status: 'verified',
  verification: {
    propertyTested: true,
    summary: 'Fuzz-tested (fast-check): filterMimeTypes never throws over arbitrary text/top-level-type combinations against the real MIME table, and stays within its MIME_RESULTS_LIMIT/truncated invariant.',
  },
  persistence: { input: 'local', preferences: 'local' },
  io: { accepts: ['text'], produces: ['json'] },
};
