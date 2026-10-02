import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'live-certificate-chain',
    title: 'Live Certificate Chain Fetcher',
    shortTitle: 'Live Cert Chain',
    description: 'Fetch the full certificate chain a host:port presents, validate it against the Mozilla and Windows trust stores, and analyze hostname mismatches (wildcards, IP SANs, near misses).',
    category: 'security',
    keywords: ['tls', 'ssl', 'certificate', 'chain', 'live', 'host', 'port', 'hostname', 'mismatch', 'san', 'wildcard', 'expiration', 'starttls', 'fetch certificate'],
    route: '/tools/live-certificate-chain',
    status: 'experimental',
    persistence: { input: 'none', preferences: 'none' },
    network: { required: true, detail: 'the host and port you enter (one TLS handshake to fetch the presented chain, with the SNI you choose)' },
    capabilities: [{ kind: 'platform', id: 'native-network', web: 'unavailable', note: 'runs live checks through the Windows desktop network bridge' }],
    io: { accepts: ['text'], produces: ['json'] }
};
