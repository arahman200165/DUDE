import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'msgpack-decoder',
  title: 'MessagePack Decoder',
  description: 'Decode a MessagePack-encoded file and inspect its structure.',
  category: 'data',
  keywords: ['messagepack', 'msgpack', 'decode', 'binary', 'inspect'],
  route: '/tools/msgpack-decoder',
  load: () => import('./msgpack-decoder').then((m) => m.MsgpackDecoder),
  status: 'stable',
  persistence: { input: 'none', preferences: 'none' },
  execution: { worker: 'none' },
  io: { accepts: ['file', 'bytes'], produces: ['json'] },
};
