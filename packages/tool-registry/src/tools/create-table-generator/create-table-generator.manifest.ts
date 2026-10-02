import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'create-table-generator',
    title: 'CREATE TABLE Generator',
    description: 'Infers column types from a pasted JSON array or CSV sample and generates dialect-specific CREATE TABLE DDL.',
    category: 'data',
    keywords: ['sql', 'create table', 'ddl', 'schema', 'generate', 'csv', 'json'],
    route: '/tools/create-table-generator',
    status: 'verified',
    verification: {
        propertyTested: true,
        summary: 'Property-tested with fast-check via the shared harness for arbitrary inputs and tool-specific invariants.',
    },
    persistence: { input: 'local', preferences: 'local' },
    io: { accepts: ['text', 'json'], produces: ['text'] }
};
