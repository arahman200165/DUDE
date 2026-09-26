import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'qr-code-generator',
  title: 'QR Code Generator',
  description: 'Generates a QR code for a URL/text, Wi-Fi network, contact card, or TOTP secret.',
  category: 'encoding',
  keywords: ['qr', 'qr code', 'generate', 'wifi', 'vcard', 'totp', 'otpauth'],
  route: '/tools/qr-code-generator',
  load: () => import('./qr-code-generator').then((m) => m.QrCodeGenerator),
  status: 'stable',
  persistence: { input: 'session', preferences: 'local' },
  io: { accepts: ['text'], produces: ['file'] },
};
