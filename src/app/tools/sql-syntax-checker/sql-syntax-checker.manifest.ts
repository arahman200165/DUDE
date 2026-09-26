import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'sql-syntax-checker',
  title: 'SQL Syntax Checker',
  description:
    'Checks SQL for syntax errors against a chosen dialect, reporting the error message and line/column.',
  category: 'data',
  keywords: ['sql', 'syntax', 'check', 'validate', 'lint', 'parse'],
  route: '/tools/sql-syntax-checker',
  load: () => import('./sql-syntax-checker').then((m) => m.SqlSyntaxChecker),
  status: 'verified',
  verification: {
    propertyTested: true,
    summary: 'Fuzz-tested with arbitrary text across every dialect (fast-check) -- never throws.',
  },
  persistence: { input: 'session', preferences: 'local' },
  io: { accepts: ['text'], produces: ['text'] },
};
