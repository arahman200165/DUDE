import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'schema-diff',
    title: 'Schema Diff',
    description: 'Diffs two CREATE TABLE statements, reporting added, removed, and changed columns.',
    category: 'data',
    keywords: ['sql', 'schema', 'diff', 'compare', 'create table', 'ddl'],
    route: '/tools/schema-diff',
    status: 'verified',
    verification: {
        propertyTested: true,
        summary: 'Fuzz-tested arbitrary valid SQLite table and column identifiers for stable, non-throwing schema diffs.',
    },
    persistence: { input: 'session', preferences: 'local' },
    fileInput: { key: 'before', extensions: ['.sql'] },
    io: { accepts: ['text', 'file'], produces: ['text'] }
};
