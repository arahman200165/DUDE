import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'msgpack-decoder',
  title: 'MessagePack Decoder',
  description: 'Decode a MessagePack-encoded file and inspect its structure.',
  category: 'data',
  keywords: ['messagepack', 'msgpack', 'decode', 'binary', 'inspect'],
  route: '/tools/msgpack-decoder',
  load: () => import('./msgpack-decoder').then((m) => m.MsgpackDecoder),
  status: 'verified',
  verification: {
    propertyTested: true,
    summary: 'Property-tested with fast-check using core-only fuzz checks against arbitrary valid or malformed input.',
  },
  persistence: { input: 'none', preferences: 'none' },
  execution: { worker: 'none' },
  io: { accepts: ['file', 'bytes'], produces: ['json'] },
};
