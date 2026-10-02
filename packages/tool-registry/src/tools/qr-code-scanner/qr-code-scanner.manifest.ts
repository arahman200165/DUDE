import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'qr-code-scanner',
    title: 'QR Code Scanner',
    description: 'Decodes a QR code from an uploaded image or a live webcam feed, entirely client-side.',
    category: 'encoding',
    keywords: ['qr', 'qr code', 'scan', 'decode', 'webcam', 'camera'],
    route: '/tools/qr-code-scanner',
    status: 'verified',
    verification: {
        propertyTested: true,
        summary: 'Fuzz-tested (fast-check): the jsQR-backed decodeQrFromImageData core never throws and always returns null or a string payload for arbitrary well-formed ImageData.',
    },
    persistence: { input: 'none', preferences: 'none' },
    io: { accepts: ['file'], produces: ['text'] }
};
