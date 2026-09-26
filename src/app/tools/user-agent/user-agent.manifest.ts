import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'user-agent',
  title: 'User-Agent Parser',
  description: 'Break a User-Agent string down into browser, engine, OS, and device details.',
  category: 'web',
  keywords: ['user agent', 'ua', 'browser', 'device', 'os', 'parse'],
  route: '/tools/user-agent',
  load: () => import('./user-agent').then((m) => m.UserAgent),
  status: 'verified',
  verification: {
    propertyTested: true,
    summary: 'Round-trip tested (fast-check): parseUserAgent recovers an exact embedded version number from a Chrome-desktop and an iOS-Safari UA template, plus neverThrows fuzzing on arbitrary text.',
  },
  persistence: { input: 'session', preferences: 'none' },
  io: { accepts: ['text'], produces: ['json'] },
};
