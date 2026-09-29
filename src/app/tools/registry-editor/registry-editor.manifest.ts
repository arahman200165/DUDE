import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'registry-editor',
  title: 'Registry Editor',
  description:
    'Browse the Windows registry lazily, view values by type, search keys, value names and data with a bounded scan, export .reg files, diff a key against a snapshot or a .reg file, and create keys or set and delete values through a previewed, confirmed change.',
  category: 'developer',
  keywords: ['registry', 'regedit', 'HKLM', 'HKCU', 'reg key', 'reg value', '.reg', 'dword', 'WOW64', 'registry diff', 'export', 'HKEY_LOCAL_MACHINE', 'HKEY_CURRENT_USER', 'windows'],
  route: '/tools/registry-editor',
  load: () => import('./registry-editor').then((m) => m.RegistryEditorTool),
  status: 'experimental',
  persistence: { input: 'none', preferences: 'local' },
  capabilities: [
    { kind: 'platform', id: 'native-system', web: 'unavailable', note: 'enumerates, searches and exports registry keys through the desktop system helper' },
    { kind: 'platform', id: 'native-system-write', web: 'unavailable', note: 'creates keys and sets or deletes values through the desktop system mutation engine' },
  ],
  consequenceClass: ['registry'],
  io: { accepts: ['text'], produces: ['json', 'file'] },
};
