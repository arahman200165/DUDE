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
  status: 'stable',
  persistence: { input: 'none', preferences: 'local' },
  io: { accepts: ['text'], produces: ['text'] },
};
