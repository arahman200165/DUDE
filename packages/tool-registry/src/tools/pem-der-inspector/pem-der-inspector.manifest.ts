import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'pem-der-inspector',
    title: 'PEM / DER Inspector & Converter',
    shortTitle: 'PEM / DER Inspector',
    description: 'Inspects a PEM block or raw DER bytes as a human-readable ASN.1 tree, and converts between the two.',
    category: 'security',
    keywords: [
        'pem',
        'der',
        'asn.1',
        'asn1',
        'x.509',
        'inspector',
        'converter',
        'certificate',
        'oid',
    ],
    route: '/tools/pem-der-inspector',
    status: 'verified',
    verification: {
        crossChecked: ["Node's X509Certificate (OpenSSL-backed) accepts the checked-in ISRG Root X1 certificate and reports matching DER and subject"],
        propertyTested: true,
        summary: 'Parses the checked-in ISRG Root X1 certificate as PEM and DER with matching bytes and ASN.1 structure, cross-checked by Node X509Certificate; also checks Node-crypto-generated RSA/EC/Ed25519 PEM keys and fast-check fuzzing.',
    },
    consequenceClass: ['crypto'],
    persistence: { input: 'session', preferences: 'local' },
    io: { accepts: ['text', 'file'], produces: ['text', 'json'] }
};
