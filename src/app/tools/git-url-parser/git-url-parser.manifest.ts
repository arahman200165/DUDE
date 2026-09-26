import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'git-url-parser',
  title: 'Git URL Parser',
  description:
    'Parses a git remote URL (https, ssh://, git://, or the scp-like git@host:owner/repo form) into host, owner, and repo.',
  category: 'developer',
  keywords: ['git', 'url', 'remote', 'parse', 'ssh', 'scp'],
  route: '/tools/git-url-parser',
  load: () => import('./git-url-parser').then((m) => m.GitUrlParser),
  status: 'verified',
  verification: {
    propertyTested: true,
    summary: 'Round-trip tested generated HTTP, HTTPS, SSH, and git remote URLs with fixed-seed fast-check.',
  },
  persistence: { input: 'session', preferences: 'none' },
  io: { accepts: ['text', 'url'], produces: ['json'] },
};
