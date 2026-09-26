import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'dockerfile-linter',
  title: 'Dockerfile Linter / Formatter',
  description:
    'Lints a Dockerfile for common issues (unpinned base image, root user, apt-get cleanup, ADD vs COPY, bad EXPOSE ports) and normalizes instruction casing.',
  category: 'developer',
  keywords: ['docker', 'dockerfile', 'lint', 'format', 'container'],
  route: '/tools/dockerfile-linter',
  load: () => import('./dockerfile-linter').then((m) => m.DockerfileLinter),
  status: 'verified',
  verification: {
    propertyTested: true,
    summary: 'Round-trip tested parsed instruction semantics through formatting and fuzz-tested arbitrary Dockerfile text with fast-check.',
  },
  persistence: { input: 'session', preferences: 'none' },
  io: { accepts: ['text'], produces: ['text'] },
};
