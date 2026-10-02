import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'barcode-reader',
    title: 'Barcode Reader',
    description: 'Decodes a barcode from an uploaded image or a live webcam feed, entirely client-side.',
    category: 'encoding',
    keywords: ['barcode', 'scan', 'decode', 'webcam', 'camera', 'zxing'],
    route: '/tools/barcode-reader',
    status: 'verified',
    verification: {
        summary: 'Chromium E2E uploads an independently generated QR PNG and verifies its decoded text through @zxing/library.',
    },
    persistence: { input: 'none', preferences: 'none' },
    io: { accepts: ['file'], produces: ['text'] }
};
