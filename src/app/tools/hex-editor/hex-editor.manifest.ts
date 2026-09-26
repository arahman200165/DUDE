import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'hex-editor',
  title: 'Hex Editor',
  description:
    'Interactively edits an uploaded file byte-by-byte in a hex grid with a live ASCII gutter, then downloads the modified bytes. Limited to 16 KB files to keep editing responsive.',
  category: 'developer',
  keywords: ['hex editor', 'byte editor', 'binary editor', 'edit bytes', 'patch file'],
  route: '/tools/hex-editor',
  load: () => import('./hex-editor').then((m) => m.HexEditor),
  status: 'verified',
  verification: {
    propertyTested: true,
    summary: 'Round-trip-tested byte formatting and fuzz-tested byte edits and row chunking over arbitrary byte arrays.',
  },
  persistence: { input: 'none', preferences: 'local' },
  io: { accepts: ['file'], produces: ['file'] },
};
