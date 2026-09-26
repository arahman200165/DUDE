import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'punycode-converter',
  title: 'Punycode Converter',
  description:
    'Converts an internationalized domain name between Unicode and its Punycode (ASCII, "xn--") form, and inspects it for mixed-script homograph risk.',
  category: 'web',
  keywords: [
    'punycode',
    'idn',
    'domain',
    'unicode',
    'ascii',
    'xn--',
    'internationalized',
    'homograph',
    'mixed-script',
  ],
  route: '/tools/punycode-converter',
  load: () => import('./punycode-converter').then((m) => m.PunycodeConverter),
  status: 'verified',
  verification: {
    propertyTested: true,
    summary: 'Round-trip tested (fast-check): toASCII/toUnicode recover the original mixed-script domain over a curated Unicode charset, plus neverThrows fuzzing over arbitrary text in both directions.',
  },
  persistence: { input: 'session', preferences: 'local' },
  execution: { worker: 'none' },
  io: { accepts: ['text', 'url'], produces: ['text', 'url'] },
};
