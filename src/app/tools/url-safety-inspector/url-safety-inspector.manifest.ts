import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'url-safety-inspector',
  title: 'URL Safety Inspector',
  description:
    'Heuristic URL safety checks — punycode homograph risk, userinfo tricks, IP-literal hosts, suspicious TLDs, and deep subdomain chains.',
  category: 'web',
  keywords: [
    'url',
    'safety',
    'phishing',
    'homograph',
    'punycode',
    'idn',
    'suspicious',
    'tld',
    'security',
  ],
  route: '/tools/url-safety-inspector',
  load: () => import('./url-safety-inspector').then((m) => m.UrlSafetyInspector),
  status: 'verified',
  verification: {
    propertyTested: true,
    summary: 'Fuzz-tested (fast-check): inspectUrlSafety never throws on arbitrary text, and every finding it reports for a valid URL has a known id and a non-empty message.',
  },
  persistence: { input: 'session', preferences: 'none' },
  io: { accepts: ['url'], produces: ['json'] },
};
