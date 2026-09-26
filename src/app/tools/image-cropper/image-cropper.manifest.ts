import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'image-cropper',
  title: 'Image Cropper',
  description: 'Drag-selects a crop area on an uploaded image and exports the cropped region.',
  category: 'documents',
  keywords: ['image', 'crop', 'canvas'],
  route: '/tools/image-cropper',
  load: () => import('./image-cropper').then((m) => m.ImageCropper),
  status: 'stable',
  persistence: { input: 'none', preferences: 'none' },
  io: { accepts: ['file'], produces: ['file'] },
};
