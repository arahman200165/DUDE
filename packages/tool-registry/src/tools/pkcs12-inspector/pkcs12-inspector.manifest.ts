import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'pkcs12-inspector',
    title: 'PKCS#12 / PFX Inspector',
    shortTitle: 'PKCS#12 Inspector',
    description: "Inspects a .p12/.pfx file's certificates and private keys given its password.",
    category: 'security',
    keywords: ['pkcs12', 'pfx', 'p12', 'certificate', 'private key', 'keystore', 'bundle'],
    route: '/tools/pkcs12-inspector',
    status: 'verified',
    verification: {
        crossChecked: ['openssl pkcs12 -export (OpenSSL 3.x, PBES2/AES-256-CBC)'],
        summary: 'Correctly extracts leaf/intermediate certs and friendlyName from a real openssl-generated .p12 using modern PBES2 encryption.',
    },
    consequenceClass: ['crypto'],
    persistence: { input: 'none', preferences: 'local' },
    io: { accepts: ['file'], produces: ['json', 'text'] }
};
