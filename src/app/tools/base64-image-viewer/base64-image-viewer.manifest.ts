import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'base64-image-viewer',
  title: 'Base64 Image Viewer',
  description:
    'Previews a Base64 string or data URI as an image, or encodes an uploaded image to Base64.',
  category: 'encoding',
  keywords: ['base64', 'image', 'data uri', 'preview', 'decode', 'encode', 'png', 'jpeg'],
  route: '/tools/base64-image-viewer',
  load: () => import('./base64-image-viewer').then((m) => m.Base64ImageViewer),
  status: 'verified',
  verification: {
    propertyTested: true,
    summary: 'Round-trip property-tested (fast-check) for arbitrary PNG-signed bytes through encodeBytesToBase64/parseBase64Image, plus fuzz-tested against arbitrary text input.',
  },
  persistence: { input: 'session', preferences: 'local' },
  io: { accepts: ['text', 'file'], produces: ['text', 'file'] },
};
