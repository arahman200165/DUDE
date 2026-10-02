import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'x509-certificate-inspector',
    title: 'X.509 Certificate Inspector',
    shortTitle: 'X.509 Inspector',
    description: "Inspects a certificate's subject/issuer, validity, SAN, extensions, and fingerprints.",
    category: 'security',
    keywords: [
        'x.509',
        'certificate',
        'ssl',
        'tls',
        'san',
        'subject alternative name',
        'fingerprint',
        'expiration',
        'pem',
        'der',
    ],
    route: '/tools/x509-certificate-inspector',
    status: 'verified',
    verification: {
        crossChecked: ['openssl x509 -noout -fingerprint -sha1', 'openssl x509 -noout -fingerprint -sha256'],
        summary: 'SHA-1/SHA-256 fingerprints for a real openssl-generated certificate matched exactly.',
    },
    consequenceClass: ['crypto'],
    persistence: { input: 'session', preferences: 'local' },
    io: { accepts: ['text', 'file'], produces: ['json'] }
};
