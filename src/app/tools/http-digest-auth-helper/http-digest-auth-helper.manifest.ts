import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'http-digest-auth-helper',
  title: 'HTTP Digest Auth Helper',
  shortTitle: 'Digest Auth',
  description:
    'Computes an RFC 7616/2617 HTTP Digest Authorization header from a WWW-Authenticate challenge and credentials.',
  category: 'web',
  keywords: [
    'digest auth',
    'www-authenticate',
    'http auth',
    'md5',
    'ha1',
    'ha2',
    'rfc 7616',
    'nonce',
    'qop',
  ],
  route: '/tools/http-digest-auth-helper',
  load: () => import('./http-digest-auth-helper').then((m) => m.HttpDigestAuthHelper),
  status: 'verified',
  verification: {
    vectors: ['RFC 2617 §3.5 worked example (testrealm@host.com)'],
    summary: 'HA1/HA2/response computation matches RFC 2617\'s official worked example exactly.',
  },
  consequenceClass: ['authentication'],
  persistence: { input: 'none', preferences: 'local' },
  io: { accepts: ['text'], produces: ['text'] },
};
