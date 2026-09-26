import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'csp-builder',
  title: 'CSP Builder',
  description:
    'Builds or parses a Content-Security-Policy header directive by directive, flagging weakening combinations like unsafe-inline or a wildcard source.',
  category: 'web',
  keywords: ['csp', 'content-security-policy', 'header', 'security', 'xss', 'directive'],
  route: '/tools/csp-builder',
  load: () => import('./csp-builder').then((m) => m.CspBuilder),
  status: 'stable',
  persistence: { input: 'session', preferences: 'none' },
  io: { accepts: ['text'], produces: ['text', 'json'] },
};
