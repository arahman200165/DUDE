import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'sql-dialect-converter',
    title: 'SQL Dialect Converter',
    description: 'Converts SQL between PostgreSQL, MySQL, MariaDB, SQLite, and SQL Server, best-effort.',
    category: 'data',
    keywords: ['sql', 'dialect', 'convert', 'postgresql', 'mysql', 'mariadb', 'sqlite', 'sql server'],
    route: '/tools/sql-dialect-converter',
    status: 'verified',
    verification: {
        propertyTested: true,
        summary: 'Fuzz-tested with arbitrary text across every dialect pair (fast-check) -- never throws.',
    },
    persistence: { input: 'session', preferences: 'local' },
    fileInput: { key: 'input', extensions: ['.sql'] },
    io: { accepts: ['text', 'file'], produces: ['text', 'file'] }
};
