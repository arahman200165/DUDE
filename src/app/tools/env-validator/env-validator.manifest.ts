import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'env-validator',
  title: '.env Validator',
  description:
    'Validates a .env file against a required-keys list with lightweight number/boolean/url type hints.',
  category: 'developer',
  keywords: ['env', 'dotenv', 'validate', 'environment variables'],
  route: '/tools/env-validator',
  load: () => import('./env-validator').then((m) => m.EnvValidator),
  status: 'stable',
  persistence: { input: 'session', preferences: 'local' },
  io: { accepts: ['text'], produces: ['text'] },
};
