import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'csv-stats',
    title: 'CSV Column Statistics',
    description: 'Compute per-column count, empty, distinct, and numeric min/max/mean statistics for a CSV.',
    category: 'data',
    keywords: ['csv', 'statistics', 'stats', 'column', 'analysis', 'min', 'max', 'mean'],
    route: '/tools/csv-stats',
    status: 'verified',
    verification: {
        propertyTested: true,
        summary: 'Property-tested with fast-check via the shared harness for arbitrary inputs and tool-specific invariants.',
    },
    persistence: { input: 'session', preferences: 'local' },
    fileInput: { key: 'input', extensions: ['.csv', '.tsv'] },
    execution: { worker: 'optional' },
    io: { accepts: ['text', 'table', 'file'], produces: ['table'] }
};
