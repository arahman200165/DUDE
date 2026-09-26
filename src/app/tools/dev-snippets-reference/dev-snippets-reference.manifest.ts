import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'dev-snippets-reference',
  title: 'Dev Snippets Reference',
  description:
    'Searchable reference of common HTTP headers, regex syntax, git/docker commands, shell idioms, SQL, CSS, HTML, Unicode, MIME types, cron syntax, and chmod.',
  category: 'developer',
  keywords: [
    'snippets',
    'reference',
    'cheatsheet',
    'git',
    'docker',
    'bash',
    'powershell',
    'sql',
    'css',
    'html',
    'cron',
    'chmod',
    'headers',
    'regex',
  ],
  route: '/tools/dev-snippets-reference',
  load: () => import('./dev-snippets-reference').then((m) => m.DevSnippetsReference),
  status: 'stable',
  persistence: { input: 'local', preferences: 'none' },
  io: { accepts: ['text'], produces: ['text'] },
};
