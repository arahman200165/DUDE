import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'barcode-generator',
  title: 'Barcode Generator',
  description:
    'Generates a CODE128, EAN-13/8, UPC, CODE39, ITF-14, or codabar barcode, with check-digit validation.',
  category: 'encoding',
  keywords: ['barcode', 'ean', 'upc', 'code128', 'code39', 'generate'],
  route: '/tools/barcode-generator',
  load: () => import('./barcode-generator').then((m) => m.BarcodeGenerator),
  status: 'stable',
  persistence: { input: 'session', preferences: 'local' },
  io: { accepts: ['text'], produces: ['file'] },
};
