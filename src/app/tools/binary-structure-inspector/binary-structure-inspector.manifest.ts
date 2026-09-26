import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'binary-structure-inspector',
  title: 'Binary Structure Inspector',
  description:
    'Parses an uploaded file against a user-defined sequence of typed fields (integers, floats, fixed-length strings, chosen endianness) into a table of offsets and decoded values.',
  category: 'developer',
  keywords: ['struct', 'binary structure', 'c struct', 'kaitai', 'parse binary', 'field layout'],
  route: '/tools/binary-structure-inspector',
  load: () => import('./binary-structure-inspector').then((m) => m.BinaryStructureInspector),
  status: 'stable',
  persistence: { input: 'none', preferences: 'local' },
  io: { accepts: ['file'], produces: ['table'] },
};
