import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'csv-pivot',
    title: 'CSV Pivot',
    description: 'Pivot a CSV: group by a row key and column key, aggregating a value column.',
    category: 'data',
    keywords: ['csv', 'pivot', 'group by', 'aggregate', 'summarize'],
    route: '/tools/csv-pivot',
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
