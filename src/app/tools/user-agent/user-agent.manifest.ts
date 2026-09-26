import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'user-agent',
  title: 'User-Agent Parser',
  description: 'Break a User-Agent string down into browser, engine, OS, and device details.',
  category: 'web',
  keywords: ['user agent', 'ua', 'browser', 'device', 'os', 'parse'],
  route: '/tools/user-agent',
  load: () => import('./user-agent').then((m) => m.UserAgent),
  status: 'stable',
  persistence: { input: 'session', preferences: 'none' },
  io: { accepts: ['text'], produces: ['json'] },
};
