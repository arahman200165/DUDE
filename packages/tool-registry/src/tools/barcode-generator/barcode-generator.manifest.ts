import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'barcode-generator',
    title: 'Barcode Generator',
    description: 'Generates Code 128, GS1-128, EAN-13/8, UPC-A/E, Code 39, ITF-14, Codabar, Data Matrix, PDF417 or Aztec barcodes as SVG or PNG, with GS1 check-digit validation.',
    category: 'encoding',
    keywords: ['barcode', 'ean', 'upc', 'code128', 'code39', 'gs1-128', 'datamatrix', 'data matrix', 'pdf417', 'aztec', '2d', 'generate'],
    route: '/tools/barcode-generator',
    status: 'verified',
    verification: {
        propertyTested: true,
        summary: 'Property-tested (fast-check): computeCheckDigit always yields a value validateBarcodeValue accepts across EAN-13/UPC/EAN-8, plus fuzz-tested for any format/text combination. The bwip-js render engine is unit-tested for every symbology, scale monotonicity, GS1 validation messages and a pinned EAN-13 path-data hash.',
    },
    persistence: { input: 'session', preferences: 'local' },
    io: { accepts: ['text'], produces: ['file'] }
};
