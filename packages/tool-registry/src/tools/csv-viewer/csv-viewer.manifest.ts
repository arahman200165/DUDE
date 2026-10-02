import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'csv-viewer',
    desktopOpen: { extensions: ['.csv'], inputKey: 'input' },
    title: 'CSV Viewer / Converter',
    description: 'View CSV as a table, and convert between CSV and JSON.',
    category: 'data',
    keywords: ['csv', 'table', 'convert', 'json', 'tsv', 'spreadsheet'],
    route: '/tools/csv-viewer',
    status: 'verified',
    verification: {
        vectors: ['RFC 4180 Section 2 record, quoted comma, CRLF field, and doubled-quote examples'],
        propertyTested: true,
        summary: 'RFC 4180 Section 2 examples parsed to exact fields; arbitrary inputs and tool invariants property-tested. Parsing remains permissive and does not validate every RFC grammar restriction.',
    },
    persistence: { input: 'session', preferences: 'local' },
    execution: { worker: 'optional' },
    io: { accepts: ['text', 'json', 'file'], produces: ['table', 'json', 'text', 'file'] }
};
