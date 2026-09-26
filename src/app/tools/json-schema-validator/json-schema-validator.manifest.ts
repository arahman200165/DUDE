import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'json-schema-validator',
  title: 'JSON Schema Validator',
  shortTitle: 'Schema Validator',
  description:
    'Validate a JSON instance against a Draft-07 or 2020-12 JSON Schema, with per-error paths.',
  category: 'data',
  keywords: [
    'json schema',
    'validate',
    'draft-07',
    '2020-12',
    'ajv',
    'schema',
    'instance',
    'validation',
  ],
  route: '/tools/json-schema-validator',
  load: () => import('./json-schema-validator').then((m) => m.JsonSchemaValidator),
  status: 'verified',
  verification: {
    propertyTested: true,
    summary: 'Property-tested with fast-check using fuzz checks against arbitrary valid or malformed input.',
  },
  persistence: { input: 'session', preferences: 'local' },
  execution: { worker: 'optional' },
  io: { accepts: ['text', 'json'], produces: ['json'] },
};
