import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'resx-tool',
  title: 'Resx Tool',
  description: 'View, diff, merge, and extract format tokens from .NET .resx resource files.',
  category: 'data',
  keywords: ['resx', '.net', 'resource', 'diff', 'merge', 'localization', 'i18n', 'token'],
  route: '/tools/resx-tool',
  load: () => import('./resx-tool').then((m) => m.ResxTool),
  status: 'verified',
  verification: {
    propertyTested: true,
    summary: 'Fuzz-tested with fast-check: arbitrary XML text returns a result without throwing.',
  },
  persistence: { input: 'session', preferences: 'local' },
  execution: { worker: 'none' },
  io: { accepts: ['text'], produces: ['table', 'text'] },
};
