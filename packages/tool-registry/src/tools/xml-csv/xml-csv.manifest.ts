import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'xml-csv',
    title: 'XML ↔ CSV Converter',
    description: 'Convert flat XML records to CSV rows and back.',
    category: 'data',
    keywords: ['xml', 'csv', 'convert', 'records', 'table'],
    route: '/tools/xml-csv',
    status: 'verified',
    verification: {
        propertyTested: true,
        summary: 'Fuzz-tested generated safe flat CSV rows through XML conversion and back, preserving headers.',
    },
    persistence: { input: 'session', preferences: 'local' },
    fileInput: { key: 'input', extensions: ['.xml'] },
    execution: { worker: 'optional' },
    io: { accepts: ['text', 'table', 'file'], produces: ['text', 'table', 'file'] }
};
