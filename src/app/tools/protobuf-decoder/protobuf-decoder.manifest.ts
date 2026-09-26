import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'protobuf-decoder',
  title: 'Protobuf Decoder',
  description: 'Decode a Protobuf-encoded payload against a user-supplied .proto schema.',
  category: 'data',
  keywords: ['protobuf', 'proto', 'decode', 'binary', 'inspect', 'grpc'],
  route: '/tools/protobuf-decoder',
  load: () => import('./protobuf-decoder').then((m) => m.ProtobufDecoder),
  status: 'verified',
  verification: {
    propertyTested: true,
    summary: 'Property-tested with fast-check using core-only fuzz checks against arbitrary valid or malformed input.',
  },
  persistence: { input: 'session', preferences: 'none' },
  execution: { worker: 'none' },
  io: { accepts: ['file', 'bytes', 'text'], produces: ['json'] },
};
