import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'avro-viewer',
    title: 'Avro Viewer',
    description: 'Decode an uncompressed Avro Object Container File and inspect its records.',
    category: 'data',
    keywords: ['avro', 'decode', 'binary', 'inspect', 'schema'],
    route: '/tools/avro-viewer',
    status: 'verified',
    verification: {
        propertyTested: true,
        summary: 'Property-tested with fast-check via the shared harness for arbitrary inputs and tool-specific invariants.',
    },
    persistence: { input: 'none', preferences: 'none' },
    execution: { worker: 'none' },
    io: { accepts: ['file', 'bytes'], produces: ['json'] }
};
