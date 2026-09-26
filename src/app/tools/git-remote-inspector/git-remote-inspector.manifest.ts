import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'git-remote-inspector',
  title: 'Git Remote Inspector',
  description:
    'Parses pasted "git remote -v" output into a table of remote name, direction, and parsed URL.',
  category: 'developer',
  keywords: ['git', 'remote', 'inspect', 'url', 'fetch', 'push'],
  route: '/tools/git-remote-inspector',
  load: () => import('./git-remote-inspector').then((m) => m.GitRemoteInspector),
  status: 'verified',
  verification: {
    propertyTested: true,
    summary: 'Fuzz-tested arbitrary git remote -v text for crash safety with fast-check.',
  },
  persistence: { input: 'session', preferences: 'none' },
  io: { accepts: ['text'], produces: ['table'] },
};
