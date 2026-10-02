import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'protobuf-decoder',
    title: 'Protobuf Decoder',
    description: 'Decode a Protobuf-encoded payload against a user-supplied .proto schema.',
    category: 'data',
    keywords: ['protobuf', 'proto', 'decode', 'binary', 'inspect', 'grpc'],
    route: '/tools/protobuf-decoder',
    status: 'verified',
    verification: {
        vectors: ['Official Protocol Buffers Encoding guide Simple Message example: Test1.a = 150, bytes 08 96 01'],
        propertyTested: true,
        summary: 'Official Encoding guide varint message decoded from literal bytes; core fuzz checks cover valid and malformed input. A schema is required because wire bytes do not identify field names or types.',
    },
    persistence: { input: 'session', preferences: 'none' },
    execution: { worker: 'none' },
    io: { accepts: ['file', 'bytes', 'text'], produces: ['json'] }
};
