import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'barcode-generator',
    title: 'Barcode Generator',
    description: 'Generates a CODE128, EAN-13/8, UPC, CODE39, ITF-14, or codabar barcode, with check-digit validation.',
    category: 'encoding',
    keywords: ['barcode', 'ean', 'upc', 'code128', 'code39', 'generate'],
    route: '/tools/barcode-generator',
    status: 'verified',
    verification: {
        propertyTested: true,
        summary: 'Property-tested (fast-check): computeCheckDigit always yields a value validateBarcodeValue accepts across EAN-13/UPC/EAN-8, plus fuzz-tested for any format/text combination.',
    },
    persistence: { input: 'session', preferences: 'local' },
    io: { accepts: ['text'], produces: ['file'] }
};
