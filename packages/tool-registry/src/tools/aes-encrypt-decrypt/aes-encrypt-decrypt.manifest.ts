import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'aes-encrypt-decrypt',
    title: 'AES Encrypt / Decrypt',
    shortTitle: 'AES Encrypt/Decrypt',
    description: 'Encrypts or decrypts text with AES-GCM or AES-CBC, using a passphrase-derived (PBKDF2) key.',
    category: 'security',
    keywords: ['aes', 'encrypt', 'decrypt', 'gcm', 'cbc', 'pbkdf2', 'cipher'],
    route: '/tools/aes-encrypt-decrypt',
    status: 'verified',
    verification: {
        crossChecked: ["Node's crypto (pbkdf2Sync + createCipheriv, OpenSSL-backed)"],
        summary: 'Decrypts AES-256-GCM/CBC ciphertext built independently by Node\'s OpenSSL-backed crypto module, not just its own round-trip.',
    },
    consequenceClass: ['crypto'],
    persistence: { input: 'none', preferences: 'local' },
    io: { accepts: ['text'], produces: ['text'] }
};
