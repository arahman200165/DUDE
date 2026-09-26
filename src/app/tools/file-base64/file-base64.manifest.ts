import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'file-base64',
  title: 'File Base64 Converter',
  shortTitle: 'File Base64',
  description:
    'Convert a local file to Base64 text, or a Base64 string back into a downloadable file, with MIME sniffing and an image preview.',
  category: 'encoding',
  keywords: [
    'base64',
    'file',
    'encode',
    'decode',
    'download',
    'binary',
    'convert',
    'attachment',
    'mime',
    'image preview',
  ],
  route: '/tools/file-base64',
  load: () => import('./file-base64').then((m) => m.FileBase64),
  status: 'stable',
  persistence: { input: 'session', preferences: 'local' },
  execution: { worker: 'optional' },
  io: { accepts: ['file', 'text'], produces: ['text', 'file'] },
};
