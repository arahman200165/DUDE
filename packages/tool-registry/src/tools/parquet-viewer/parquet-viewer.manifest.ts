import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'parquet-viewer',
    title: 'Parquet Viewer',
    description: 'Decode a Parquet file and view its rows as a table.',
    category: 'data',
    keywords: ['parquet', 'decode', 'binary', 'inspect', 'columnar'],
    route: '/tools/parquet-viewer',
    status: 'verified',
    verification: {
        propertyTested: true,
        summary: 'Property-tested with fast-check using core-only fuzz checks against arbitrary valid or malformed input.',
    },
    persistence: { input: 'none', preferences: 'none' },
    execution: { worker: 'none' },
    io: { accepts: ['file', 'bytes'], produces: ['table'] }
};
