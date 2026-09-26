import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'pkce-generator',
  title: 'PKCE Generator',
  shortTitle: 'PKCE Generator',
  description: 'Generates an RFC 7636 PKCE code_verifier and its S256 (or plain) code_challenge.',
  category: 'security',
  keywords: [
    'pkce',
    'code verifier',
    'code challenge',
    'oauth',
    's256',
    'authorization code',
    'rfc 7636',
  ],
  route: '/tools/pkce-generator',
  load: () => import('./pkce-generator').then((m) => m.PkceGenerator),
  status: 'stable',
  consequenceClass: ['authentication'],
  persistence: { input: 'none', preferences: 'local' },
  io: { accepts: ['json'], produces: ['text'] },
};
