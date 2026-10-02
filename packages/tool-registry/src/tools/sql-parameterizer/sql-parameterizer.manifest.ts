import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'sql-parameterizer',
    title: 'SQL Parameterizer',
    description: 'Replaces literal values in a SQL query with placeholders (?, $n, or :named), extracting the values as a parameter list.',
    category: 'data',
    keywords: ['sql', 'parameterize', 'placeholder', 'prepared statement', 'bind variable'],
    route: '/tools/sql-parameterizer',
    status: 'verified',
    verification: {
        propertyTested: true,
        summary: 'Fuzz-tested with arbitrary text across every dialect/param-style (fast-check) -- never throws.',
    },
    persistence: { input: 'session', preferences: 'local' },
    fileInput: { key: 'input', extensions: ['.sql'] },
    io: { accepts: ['text', 'file'], produces: ['text', 'json', 'file'] }
};
