import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'file-inspector',
  title: 'File Inspector',
  shortTitle: 'File Inspector',
  description:
    'A "file forensics" summary: detected signature/container format, Shannon entropy verdict, and a sample of extracted strings, all in one dashboard.',
  category: 'developer',
  keywords: [
    'file inspector',
    'file forensics',
    'file summary',
    'magic bytes',
    'entropy',
    'strings',
  ],
  route: '/tools/file-inspector',
  load: () => import('./file-inspector').then((m) => m.FileInspector),
  status: 'verified',
  verification: {
    propertyTested: true,
    summary: 'Fuzz-tested arbitrary bytes and metadata for preserved report fields and bounded samples/entropy.',
  },
  persistence: { input: 'none', preferences: 'none' },
  execution: { worker: 'optional' },
  io: { accepts: ['file'], produces: ['json'] },
};
