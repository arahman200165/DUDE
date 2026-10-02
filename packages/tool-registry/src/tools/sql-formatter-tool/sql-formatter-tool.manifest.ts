import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'sql-formatter-tool',
    desktopOpen: { extensions: ['.sql'], inputKey: 'input' },
    title: 'SQL Formatter / Minifier',
    description: 'Pretty-prints or minifies SQL across PostgreSQL, MySQL, MariaDB, SQLite, SQL Server, and Oracle (PL/SQL) dialects.',
    category: 'data',
    keywords: ['sql', 'format', 'minify', 'beautify', 'pretty-print'],
    route: '/tools/sql-formatter-tool',
    status: 'verified',
    verification: {
        propertyTested: true,
        summary: 'Fuzz-tested with arbitrary text across every dialect/mode (fast-check) -- never throws.',
    },
    persistence: { input: 'session', preferences: 'local' },
    io: { accepts: ['text', 'file'], produces: ['text', 'file'] }
};
