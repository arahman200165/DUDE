import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'revocation-inspector',
    title: 'Certificate Revocation Inspector',
    shortTitle: 'Revocation',
    description: 'Check a certificate against its own OCSP responder and CRL, and fetch a missing issuer via AIA. Contacts only the URLs named in the certificate, over HTTP, and verifies the responses.',
    category: 'security',
    keywords: ['ocsp', 'crl', 'revocation', 'aia', 'certificate', 'tls', 'ssl', 'revoked', 'responder', 'ocsp inspector', 'crl inspector'],
    route: '/tools/revocation-inspector',
    status: 'experimental',
    persistence: { input: 'none', preferences: 'none' },
    network: { required: true, detail: 'the OCSP, CRL, and AIA URLs named inside the certificate (HTTP); optionally one TLS handshake to fetch the chain first' },
    capabilities: [{ kind: 'platform', id: 'native-network', web: 'unavailable', note: 'runs live checks through the Windows desktop network bridge' }],
    io: { accepts: ['text'], produces: ['json'] }
};
