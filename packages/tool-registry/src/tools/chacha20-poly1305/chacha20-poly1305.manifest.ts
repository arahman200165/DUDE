import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'chacha20-poly1305',
    title: 'ChaCha20-Poly1305 Encrypt / Decrypt',
    shortTitle: 'ChaCha20-Poly1305',
    description: 'Encrypts or decrypts text with ChaCha20-Poly1305 or XChaCha20-Poly1305, using a passphrase-derived (PBKDF2) key.',
    category: 'security',
    keywords: [
        'chacha20',
        'poly1305',
        'xchacha20',
        'encrypt',
        'decrypt',
        'aead',
        'pbkdf2',
        'cipher',
        'rfc 8439',
    ],
    route: '/tools/chacha20-poly1305',
    status: 'verified',
    verification: {
        crossChecked: ["Node's crypto (pbkdf2Sync + createCipheriv('chacha20-poly1305'), OpenSSL-backed)"],
        summary: "Decrypts ChaCha20-Poly1305 ciphertext built independently by Node's OpenSSL-backed crypto module, not just @noble/ciphers agreeing with itself.",
    },
    consequenceClass: ['crypto'],
    persistence: { input: 'none', preferences: 'local' },
    execution: { worker: 'optional' },
    io: { accepts: ['text'], produces: ['text'] }
};
