import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'chmod-converter',
  title: 'chmod / Unix Permissions Converter',
  description:
    'Converts between symbolic (rwxr-xr--) and octal (754) Unix permissions, with a visual owner/group/other checkbox grid and setuid/setgid/sticky bits.',
  category: 'developer',
  keywords: [
    'chmod',
    'permissions',
    'unix',
    'octal',
    'symbolic',
    'setuid',
    'setgid',
    'sticky',
    'rwx',
  ],
  route: '/tools/chmod-converter',
  load: () => import('./chmod-converter').then((m) => m.ChmodConverter),
  status: 'stable',
  persistence: { input: 'session', preferences: 'none' },
  io: { accepts: ['text'], produces: ['text'] },
};
