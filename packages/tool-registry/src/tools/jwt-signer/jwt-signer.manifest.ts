import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'jwt-signer',
    title: 'JWT Signer',
    shortTitle: 'JWT Signer',
    description: 'Sign a JWT with an HMAC secret or an RSA/EC/RSA-PSS private key, with in-browser key-pair generation.',
    category: 'security',
    keywords: [
        'jwt',
        'sign',
        'signature',
        'hmac',
        'rsa',
        'ecdsa',
        'ps256',
        'key pair',
        'auth',
        'token',
    ],
    route: '/tools/jwt-signer',
    status: 'verified',
    verification: {
        crossChecked: ["Node's crypto.createHmac (independent of jose's own verification)"],
        summary: 'HS256 signature output matches a byte-for-byte independent recomputation with Node\'s crypto.createHmac.',
    },
    consequenceClass: ['authentication'],
    persistence: { input: 'none', preferences: 'local' },
    io: { accepts: ['json', 'text'], produces: ['text'] }
};
