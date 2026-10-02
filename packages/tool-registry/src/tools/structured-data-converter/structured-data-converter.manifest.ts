import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'structured-data-converter',
    title: 'Universal Structured Data Converter',
    shortTitle: 'Structured Data Converter',
    description: 'Convert between JSON, YAML, XML, TOML, and CSV, any format to any other.',
    category: 'data',
    keywords: ['json', 'yaml', 'xml', 'toml', 'csv', 'convert', 'universal', 'structured data'],
    route: '/tools/structured-data-converter',
    status: 'verified',
    verification: {
        propertyTested: true,
        summary: 'Round-trip tested generated JSON-compatible values through YAML and back to JSON.',
    },
    persistence: { input: 'session', preferences: 'local' },
    execution: { worker: 'none' },
    io: { accepts: ['text', 'json'], produces: ['text', 'json'] }
};
