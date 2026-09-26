import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'barcode-reader',
  title: 'Barcode Reader',
  description:
    'Decodes a barcode from an uploaded image or a live webcam feed, entirely client-side.',
  category: 'encoding',
  keywords: ['barcode', 'scan', 'decode', 'webcam', 'camera', 'zxing'],
  route: '/tools/barcode-reader',
  load: () => import('./barcode-reader').then((m) => m.BarcodeReader),
  status: 'verified',
  verification: {
    summary: 'Chromium E2E uploads an independently generated QR PNG and verifies its decoded text through @zxing/library.',
  },
  persistence: { input: 'none', preferences: 'none' },
  io: { accepts: ['file'], produces: ['text'] },
};
