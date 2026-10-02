import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'csv-join',
    title: 'CSV Join / Merge',
    description: 'Join two CSVs on a key column, inner or left.',
    category: 'data',
    keywords: ['csv', 'join', 'merge', 'combine', 'key'],
    route: '/tools/csv-join',
    status: 'verified',
    verification: {
        propertyTested: true,
        summary: 'Property-tested with fast-check via the shared harness for arbitrary inputs and tool-specific invariants.',
    },
    persistence: { input: 'session', preferences: 'local' },
    fileInput: { key: 'leftInput', extensions: ['.csv', '.tsv'] },
    execution: { worker: 'optional' },
    io: { accepts: ['text', 'table', 'file'], produces: ['table'] }
};
