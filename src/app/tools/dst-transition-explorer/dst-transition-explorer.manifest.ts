import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'dst-transition-explorer',
  title: 'DST Transition Explorer',
  description:
    'List every daylight-saving-time transition for a timezone in a chosen year, with the exact offset change and gap.',
  category: 'date-time',
  keywords: [
    'dst',
    'daylight saving',
    'timezone',
    'transition',
    'spring forward',
    'fall back',
    'utc offset',
  ],
  route: '/tools/dst-transition-explorer',
  load: () => import('./dst-transition-explorer').then((m) => m.DstTransitionExplorer),
  status: 'stable',
  persistence: { input: 'session', preferences: 'local' },
  io: { accepts: ['text'], produces: ['table', 'json'] },
};
