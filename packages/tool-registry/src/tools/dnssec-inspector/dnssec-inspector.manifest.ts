import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'dnssec-inspector',
    title: 'DNSSEC Inspector',
    description: 'Validate a DNS answer locally from the IANA root trust anchors: DS/DNSKEY/RRSIG chain, NSEC/NSEC3 denial proofs, and algorithm warnings.',
    category: 'developer',
    keywords: ['network', 'dns', 'dnssec', 'dnskey', 'ds', 'rrsig', 'nsec', 'nsec3', 'chain of trust', 'validation', 'trust anchor'],
    route: '/tools/dnssec-inspector',
    status: 'experimental',
    persistence: { input: 'none', preferences: 'none' },
    network: { required: true, detail: 'your system DNS servers, or a DNS, DoH, or DoT server you choose — queried for each zone from the root down (DS, DNSKEY, NS)' },
    capabilities: [{ kind: 'platform', id: 'native-network', web: 'unavailable', note: 'runs live checks through the Windows desktop network bridge' }],
    io: { accepts: ['text'], produces: ['json'] }
};
