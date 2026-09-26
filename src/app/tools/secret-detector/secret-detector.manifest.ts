import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'secret-detector',
  title: 'Secret Detector',
  description:
    'Flags likely credentials and keys in pasted text or config — AWS/GitHub/Slack tokens, PEM private keys, JWTs, generic key=value assignments, and high-entropy strings.',
  category: 'developer',
  keywords: ['secret', 'detect', 'credential', 'api key', 'token', 'entropy'],
  route: '/tools/secret-detector',
  load: () => import('./secret-detector').then((m) => m.SecretDetector),
  status: 'stable',
  consequenceClass: ['secret-management'],
  persistence: { input: 'none', preferences: 'local' },
  io: { accepts: ['text'], produces: ['text', 'json'] },
};
