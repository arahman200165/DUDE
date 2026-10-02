import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'csv-cleaner',
    title: 'CSV Cleaner',
    description: 'Trim whitespace, drop empty rows, and normalize a messy CSV.',
    category: 'data',
    keywords: ['csv', 'clean', 'trim', 'whitespace', 'empty rows', 'normalize'],
    route: '/tools/csv-cleaner',
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
