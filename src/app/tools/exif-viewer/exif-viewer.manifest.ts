import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'exif-viewer',
  title: 'EXIF Viewer / Cleaner',
  description:
    "Views an image's embedded EXIF metadata, or strips it entirely by re-encoding the image through canvas.",
  category: 'documents',
  keywords: ['exif', 'metadata', 'gps', 'camera', 'privacy', 'strip metadata', 'clean image'],
  route: '/tools/exif-viewer',
  load: () => import('./exif-viewer').then((m) => m.ExifViewer),
  status: 'stable',
  persistence: { input: 'none', preferences: 'local' },
  io: { accepts: ['file'], produces: ['table', 'file'] },
};
