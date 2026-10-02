import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'hmac-generator',
    title: 'HMAC Generator',
    description: 'HMAC-SHA1, HMAC-SHA256, HMAC-SHA384, and HMAC-SHA512 message authentication codes with a custom key.',
    category: 'security',
    keywords: ['hmac', 'mac', 'message authentication code', 'hash', 'sha256', 'sha512', 'signature'],
    route: '/tools/hmac-generator',
    status: 'verified',
    verification: {
        vectors: ['RFC 4231 Test Cases 1-2'],
        crossChecked: ["Node's crypto.createHmac"],
        summary: 'HMAC-SHA1/256/384/512 match RFC 4231\'s official test vectors exactly.',
    },
    consequenceClass: ['crypto'],
    persistence: { input: 'none', preferences: 'local' },
    io: { accepts: ['text'], produces: ['text'] }
};
