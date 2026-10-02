import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'csv-dedupe',
    title: 'CSV Deduplicator',
    description: 'Remove duplicate rows from a CSV, optionally by a subset of key columns.',
    category: 'data',
    keywords: ['csv', 'dedupe', 'deduplicate', 'unique', 'duplicate'],
    route: '/tools/csv-dedupe',
    status: 'verified',
    verification: {
        propertyTested: true,
        summary: 'Property-tested with fast-check via the shared harness for arbitrary inputs and tool-specific invariants.',
    },
    persistence: { input: 'session', preferences: 'local' },
    fileInput: { key: 'input', extensions: ['.csv', '.tsv'] },
    execution: { worker: 'optional' },
    io: { accepts: ['text', 'table', 'file'], produces: ['text', 'table', 'file'] }
};
