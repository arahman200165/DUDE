import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'bom-detector',
  title: 'BOM Detector / Remover',
  description:
    'Detects a UTF-8/16/32 byte-order mark at the start of an uploaded file and offers a one-click download of the file with it stripped.',
  category: 'developer',
  keywords: ['bom', 'byte order mark', 'utf-8 bom', 'strip bom', 'remove bom'],
  route: '/tools/bom-detector',
  load: () => import('./bom-detector').then((m) => m.BomDetector),
  status: 'stable',
  persistence: { input: 'none', preferences: 'none' },
  io: { accepts: ['file'], produces: ['json', 'file'] },
};
