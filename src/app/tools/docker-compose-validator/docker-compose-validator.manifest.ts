import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'docker-compose-validator',
  title: 'Docker Compose Validator / Viewer',
  description:
    'Validates a docker-compose YAML file against a minimal Compose Specification shape and browses it as a tree.',
  category: 'developer',
  keywords: ['docker', 'compose', 'validate', 'yaml', 'container'],
  route: '/tools/docker-compose-validator',
  load: () => import('./docker-compose-validator').then((m) => m.DockerComposeValidator),
  status: 'stable',
  persistence: { input: 'session', preferences: 'none' },
  io: { accepts: ['text'], produces: ['text', 'json'] },
};
