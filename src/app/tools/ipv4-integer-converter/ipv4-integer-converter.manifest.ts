import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'ipv4-integer-converter',
  title: 'IPv4 ↔ Integer Converter',
  description: 'Converts an IPv4 address to its 32-bit unsigned integer form, or the reverse.',
  category: 'developer',
  keywords: ['ip', 'ipv4', 'integer', 'convert', 'network'],
  route: '/tools/ipv4-integer-converter',
  load: () => import('./ipv4-integer-converter').then((m) => m.Ipv4IntegerConverter),
  status: 'stable',
  persistence: { input: 'session', preferences: 'local' },
  io: { accepts: ['text'], produces: ['text'] },
};
