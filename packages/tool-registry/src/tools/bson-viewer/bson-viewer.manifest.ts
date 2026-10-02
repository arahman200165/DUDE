import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'bson-viewer',
    title: 'BSON Viewer',
    description: 'Decode a BSON file and inspect its structure.',
    category: 'data',
    keywords: ['bson', 'mongodb', 'decode', 'binary', 'inspect'],
    route: '/tools/bson-viewer',
    status: 'verified',
    verification: {
        propertyTested: true,
        summary: 'Property-tested with fast-check via the shared harness for arbitrary inputs and tool-specific invariants.',
    },
    persistence: { input: 'none', preferences: 'none' },
    execution: { worker: 'none' },
    io: { accepts: ['file', 'bytes'], produces: ['json'] }
};
