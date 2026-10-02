import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'qr-code-generator',
    title: 'QR Code Generator',
    description: 'Generates a QR code for a URL/text, Wi-Fi network, contact card, or TOTP secret.',
    category: 'encoding',
    keywords: ['qr', 'qr code', 'generate', 'wifi', 'vcard', 'totp', 'otpauth'],
    route: '/tools/qr-code-generator',
    status: 'verified',
    verification: {
        propertyTested: true,
        summary: 'Property-tested (fast-check): the Wi-Fi, vCard, and otpauth:// (TOTP) payload builders produce well-formed, parseable output carrying every field verbatim, across the full option space.',
    },
    persistence: { input: 'session', preferences: 'local' },
    io: { accepts: ['text'], produces: ['file'] }
};
