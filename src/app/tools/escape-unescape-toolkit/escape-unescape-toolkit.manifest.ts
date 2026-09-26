import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'escape-unescape-toolkit',
  title: 'Escape / Unescape Toolkit',
  description:
    'Escapes or unescapes text for JavaScript, CSS, SQL, POSIX shell, PowerShell, or quoted-printable.',
  category: 'encoding',
  keywords: [
    'escape',
    'unescape',
    'javascript',
    'css',
    'sql',
    'shell',
    'powershell',
    'quoted-printable',
    'quote',
  ],
  route: '/tools/escape-unescape-toolkit',
  load: () => import('./escape-unescape-toolkit').then((m) => m.EscapeUnescapeToolkit),
  status: 'stable',
  persistence: { input: 'session', preferences: 'local' },
  execution: { worker: 'none' },
  io: { accepts: ['text'], produces: ['text'] },
};
