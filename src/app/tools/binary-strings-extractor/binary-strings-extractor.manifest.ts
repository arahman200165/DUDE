import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'binary-strings-extractor',
  title: 'Binary Strings Extractor',
  description:
    'Extracts printable ASCII and little-endian UTF-16 text runs from an uploaded file, like the Unix `strings` utility, with an adjustable minimum length.',
  category: 'developer',
  keywords: ['strings', 'binary strings', 'ascii', 'utf-16', 'forensics', 'extract text'],
  route: '/tools/binary-strings-extractor',
  load: () => import('./binary-strings-extractor').then((m) => m.BinaryStringsExtractor),
  status: 'stable',
  persistence: { input: 'none', preferences: 'local' },
  execution: { worker: 'optional' },
  io: { accepts: ['file'], produces: ['table'] },
};
