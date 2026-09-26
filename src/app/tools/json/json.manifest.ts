import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'json',
  desktopOpen: { extensions: ['.json'], inputKey: 'input' },
  title: 'JSON Formatter',
  description:
    'Validate, format, and minify JSON, with an editable tree view, structural compare, and malformed-JSON repair.',
  category: 'data',
  keywords: [
    'json',
    'format',
    'validate',
    'pretty',
    'minify',
    'tree',
    'edit',
    'compare',
    'diff',
    'repair',
  ],
  route: '/tools/json',
  load: () => import('./json').then((m) => m.Json),
  status: 'verified',
  verification: {
    propertyTested: true,
    summary: 'Property-tested with fast-check using round-trip checks against arbitrary valid or malformed input.',
  },
  persistence: { input: 'session', preferences: 'local' },
  execution: { worker: 'optional' },
  io: { accepts: ['text', 'json'], produces: ['json', 'text'] },
};
