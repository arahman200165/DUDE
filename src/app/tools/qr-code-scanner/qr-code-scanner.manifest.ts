import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'qr-code-scanner',
  title: 'QR Code Scanner',
  description:
    'Decodes a QR code from an uploaded image or a live webcam feed, entirely client-side.',
  category: 'encoding',
  keywords: ['qr', 'qr code', 'scan', 'decode', 'webcam', 'camera'],
  route: '/tools/qr-code-scanner',
  load: () => import('./qr-code-scanner').then((m) => m.QrCodeScanner),
  status: 'stable',
  persistence: { input: 'none', preferences: 'none' },
  io: { accepts: ['file'], produces: ['text'] },
};
