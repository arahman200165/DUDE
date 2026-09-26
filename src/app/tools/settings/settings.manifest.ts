import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'settings',
  title: 'Settings',
  description:
    "Desktop-only settings: configure the local LLM proxy (base URL, model, API key) that powers Regex Tester's AI features.",
  category: 'developer',
  keywords: [
    'settings',
    'preferences',
    'llm',
    'api key',
    'openai',
    'provider',
    'desktop',
    'electron',
  ],
  route: '/tools/settings',
  load: () => import('./settings').then((m) => m.Settings),
  status: 'experimental',
  persistence: { input: 'secure-local', preferences: 'secure-local' },
  execution: { worker: 'none' },
  io: { accepts: ['json'], produces: ['json'] },
};
