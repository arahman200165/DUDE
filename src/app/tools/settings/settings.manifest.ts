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
  status: 'verified',
  verification: {
    propertyTested: true,
    summary: 'Integration-tested with mocked secure-local storage: generated provider fields trim and save correctly, then all three keys clear; web toggle and clear-all confirmation flows are covered.',
  },
  persistence: { input: 'secure-local', preferences: 'secure-local' },
  execution: { worker: 'none' },
  io: { accepts: ['json'], produces: ['json'] },
};
