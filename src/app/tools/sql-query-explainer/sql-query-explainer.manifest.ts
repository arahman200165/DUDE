import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'sql-query-explainer',
  title: 'SQL Query Explainer',
  description:
    'Breaks a SELECT statement down into a plain-English description of its columns, joins, filters, grouping, and ordering. Static and pattern-based — not a live EXPLAIN.',
  category: 'data',
  keywords: ['sql', 'explain', 'query', 'select', 'join', 'plain english'],
  route: '/tools/sql-query-explainer',
  load: () => import('./sql-query-explainer').then((m) => m.SqlQueryExplainer),
  status: 'verified',
  verification: {
    propertyTested: true,
    summary: 'Fuzz-tested with arbitrary text and a corpus of varied valid SELECT statements (fast-check) -- caught and fixed two real crashes on edge-case input.',
  },
  persistence: { input: 'session', preferences: 'local' },
  io: { accepts: ['text'], produces: ['text'] },
};
