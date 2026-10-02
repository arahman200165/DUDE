import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'sql-syntax-checker',
    title: 'SQL Syntax Checker',
    description: 'Checks SQL for syntax errors against a chosen dialect, reporting the error message and line/column.',
    category: 'data',
    keywords: ['sql', 'syntax', 'check', 'validate', 'lint', 'parse'],
    route: '/tools/sql-syntax-checker',
    status: 'verified',
    verification: {
        propertyTested: true,
        summary: 'Fuzz-tested with arbitrary text across every dialect (fast-check) -- never throws.',
    },
    persistence: { input: 'session', preferences: 'local' },
    fileInput: { key: 'input', extensions: ['.sql'] },
    io: { accepts: ['text', 'file'], produces: ['text'] }
};
