import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'missing-env-var-detector',
  title: 'Missing Environment Variable Detector',
  description:
    "Cross-checks environment variables referenced in source code against a .env file's declared keys, in both directions.",
  category: 'developer',
  keywords: ['env', 'environment variables', 'missing', 'detect', 'cross-check'],
  route: '/tools/missing-env-var-detector',
  load: () => import('./missing-env-var-detector').then((m) => m.MissingEnvVarDetector),
  status: 'stable',
  persistence: { input: 'session', preferences: 'none' },
  io: { accepts: ['text'], produces: ['text'] },
};
