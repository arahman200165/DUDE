import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'json-ld-tester',
  title: 'Structured Data / JSON-LD Tester',
  shortTitle: 'JSON-LD Tester',
  description:
    "Validates a JSON-LD block's shape against common Schema.org types, flagging missing required/recommended properties.",
  category: 'developer',
  keywords: ['json-ld', 'structured data', 'schema.org', 'rich results', 'seo'],
  route: '/tools/json-ld-tester',
  load: () => import('./json-ld-tester').then((m) => m.JsonLdTester),
  status: 'stable',
  persistence: { input: 'session', preferences: 'none' },
  io: { accepts: ['text', 'json'], produces: ['json'] },
};
