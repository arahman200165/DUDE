import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'basic-auth-generator',
  title: 'Basic Auth Header Generator',
  shortTitle: 'Basic Auth',
  description:
    'Builds (or decodes) an HTTP Basic Authorization header from a username and password.',
  category: 'security',
  keywords: [
    'basic auth',
    'authorization header',
    'base64',
    'http auth',
    'credentials',
    'www-authenticate',
  ],
  route: '/tools/basic-auth-generator',
  load: () => import('./basic-auth-generator').then((m) => m.BasicAuthGenerator),
  status: 'stable',
  persistence: { input: 'none', preferences: 'local' },
  io: { accepts: ['text'], produces: ['text'] },
};
