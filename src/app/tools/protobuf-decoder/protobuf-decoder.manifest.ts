import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'protobuf-decoder',
  title: 'Protobuf Decoder',
  description: 'Decode a Protobuf-encoded payload against a user-supplied .proto schema.',
  category: 'data',
  keywords: ['protobuf', 'proto', 'decode', 'binary', 'inspect', 'grpc'],
  route: '/tools/protobuf-decoder',
  load: () => import('./protobuf-decoder').then((m) => m.ProtobufDecoder),
  status: 'stable',
  persistence: { input: 'session', preferences: 'none' },
  execution: { worker: 'none' },
  io: { accepts: ['file', 'bytes', 'text'], produces: ['json'] },
};
