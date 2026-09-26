import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'archive-tool',
  title: 'Archive Creator / Extractor',
  description: 'Creates or extracts ZIP, TAR, and TAR.GZ archives entirely client-side.',
  category: 'encoding',
  keywords: ['archive', 'zip', 'tar', 'tar.gz', 'compress', 'extract', 'unzip'],
  route: '/tools/archive-tool',
  load: () => import('./archive-tool').then((m) => m.ArchiveTool),
  status: 'stable',
  persistence: { input: 'none', preferences: 'local' },
  io: { accepts: ['file'], produces: ['file'] },
};
