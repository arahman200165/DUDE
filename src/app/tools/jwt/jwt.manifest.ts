import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'jwt',
  title: 'JWT Debugger',
  description: 'Decode a JWT header and payload — does not verify signatures.',
  category: 'security',
  keywords: ['jwt', 'json web token', 'decode', 'auth', 'token', 'claims'],
  route: '/tools/jwt',
  load: () => import('./jwt').then((m) => m.Jwt),
  status: 'verified',
  verification: {
    propertyTested: true,
    summary: 'Fuzz-tested with arbitrary text and arbitrary three-segment tokens (fast-check) -- never throws on malformed input.',
  },
  consequenceClass: ['authentication'],
  persistence: { input: 'none', preferences: 'none' },
  io: { accepts: ['text'], produces: ['json'] },
};
