import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'hex-dump',
  title: 'Hex Dump Viewer / Builder',
  description:
    'Renders a file as a classic offset/hex/ASCII hex dump, or rebuilds a file from a pasted hex dump.',
  category: 'encoding',
  keywords: ['hex dump', 'hexdump', 'xxd', 'file', 'binary', 'inspect', 'offset'],
  route: '/tools/hex-dump',
  load: () => import('./hex-dump').then((m) => m.HexDumpTool),
  status: 'stable',
  persistence: { input: 'session', preferences: 'local' },
  execution: { worker: 'optional' },
  io: { accepts: ['file', 'text', 'bytes'], produces: ['text', 'file', 'bytes'] },
};
