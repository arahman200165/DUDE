import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'base64',
    title: 'Base64 Encoder / Decoder',
    description: 'UTF-8-safe text-to-Base64 and Base64-to-text conversion.',
    category: 'encoding',
    keywords: ['base64', 'encode', 'decode', 'encoding', 'utf-8'],
    route: '/tools/base64',
    pwaShortcut: { order: 2 },
    status: 'verified',
    verification: {
        vectors: ['RFC 4648 Section 10 Base64 test vectors'],
        propertyTested: true,
        summary: 'Round-trip and fuzz-tested (fast-check) against arbitrary Unicode text via the shared UTF-8-safe base64-codec.',
    },
    persistence: { input: 'session', preferences: 'local' },
    io: { accepts: ['text'], produces: ['text'] }
};
