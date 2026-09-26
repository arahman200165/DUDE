import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'cookie-tools',
  title: 'Cookie Tools',
  description:
    'Parses a request Cookie header into name/value pairs, or builds a response Set-Cookie header with its attributes, flagging common mistakes.',
  category: 'web',
  keywords: ['cookie', 'set-cookie', 'samesite', 'secure', 'httponly', 'header'],
  route: '/tools/cookie-tools',
  load: () => import('./cookie-tools').then((m) => m.CookieTools),
  status: 'verified',
  verification: {
    propertyTested: true,
    summary: 'Fuzz-tested (fast-check): Cookie/Set-Cookie parse/build/warning-check never throw on arbitrary input, and a Set-Cookie name survives a build-then-reparse round trip.',
  },
  persistence: { input: 'none', preferences: 'local' },
  io: { accepts: ['text'], produces: ['text', 'json'] },
};
