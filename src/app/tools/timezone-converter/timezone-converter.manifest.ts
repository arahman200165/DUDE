import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'timezone-converter',
  title: 'Date / Timezone Converter',
  description: 'Convert a moment in time across a chosen set of IANA timezones.',
  category: 'date-time',
  keywords: [
    'timezone',
    'time zone',
    'date',
    'convert',
    'world clock',
    'iana',
    'dst',
    'utc offset',
  ],
  route: '/tools/timezone-converter',
  load: () => import('./timezone-converter').then((m) => m.TimezoneConverter),
  status: 'verified',
  verification: {
    propertyTested: true,
    summary: 'Round-trip-tested (fast-check): converting a UTC moment to a target IANA zone and back recovers the original wall-clock time; plus neverThrows on arbitrary input.',
  },
  persistence: { input: 'session', preferences: 'local' },
  io: { accepts: ['text'], produces: ['json'] },
};
