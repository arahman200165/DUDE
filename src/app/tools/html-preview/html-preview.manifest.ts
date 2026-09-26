import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'html-preview',
  desktopOpen: { extensions: ['.html'], inputKey: 'source' },
  title: 'HTML Preview',
  description:
    'Live-render an HTML document — including its own inline <script>/<style> — inside a network-isolated sandbox with captured console output.',
  category: 'developer',
  keywords: ['html', 'preview', 'live', 'sandbox', 'codepen', 'render', 'script', 'execute'],
  route: '/tools/html-preview',
  load: () => import('./html-preview').then((m) => m.HtmlPreview),
  status: 'experimental',
  persistence: { input: 'session', preferences: 'local' },
  execution: { worker: 'none' },
  network: { required: false },
  io: { accepts: ['text'], produces: ['text'] },
};
