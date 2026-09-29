import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'installed-software',
  title: 'Installed Software',
  description: 'Search, sort, export and review installed Windows software, with previewed interactive uninstallers and copyable Appx removal commands.',
  category: 'developer',
  keywords: ['installed software', 'programs', 'uninstall', 'apps', 'Appx', 'Store', 'publisher', 'install date', 'size', 'winget'],
  route: '/tools/installed-software',
  load: () => import('./installed-software').then((m) => m.InstalledSoftwareTool),
  status: 'experimental',
  persistence: { input: 'none', preferences: 'local' },
  capabilities: [
    { kind: 'platform', id: 'native-system', web: 'unavailable', note: 'reads uninstall registry entries and installed Appx packages on Windows' },
    { kind: 'platform', id: 'native-system-write', web: 'unavailable', note: 'launches a registered interactive vendor uninstaller after a reviewed no-undo system plan' },
  ],
  consequenceClass: ['system-config'],
  io: { accepts: ['text'], produces: ['json', 'file'] },
};
