import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'gitignore-generator',
  title: 'Gitignore Generator',
  description:
    'Combines curated .gitignore templates (Node, Python, Java, .NET, Go, Rust, macOS, Windows, JetBrains, VS Code) into one file.',
  category: 'developer',
  keywords: ['gitignore', 'git', 'generate', 'template', 'ignore'],
  route: '/tools/gitignore-generator',
  load: () => import('./gitignore-generator').then((m) => m.GitignoreGenerator),
  status: 'stable',
  persistence: { input: 'local', preferences: 'local' },
  io: { accepts: ['json'], produces: ['text', 'file'] },
};
