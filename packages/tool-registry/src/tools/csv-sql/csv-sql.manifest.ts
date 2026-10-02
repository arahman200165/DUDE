import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'csv-sql',
    title: 'CSV ↔ SQL Converter',
    description: 'Convert CSV rows or a JSON array of objects to SQL INSERT statements, or parse INSERT statements back into CSV.',
    category: 'data',
    keywords: ['csv', 'sql', 'json', 'insert', 'convert', 'database'],
    route: '/tools/csv-sql',
    status: 'verified',
    verification: {
        propertyTested: true,
        summary: 'CSV<->SQL round-trip property-tested and fuzz-tested (fast-check) -- caught and fixed a real parser bug where a quoted value containing a semicolon truncated the VALUES(...) capture.',
    },
    persistence: { input: 'session', preferences: 'local' },
    fileInput: { key: 'input', extensions: ['.csv', '.tsv'] },
    execution: { worker: 'optional' },
    io: { accepts: ['text', 'table', 'json', 'file'], produces: ['text', 'table', 'file'] }
};
