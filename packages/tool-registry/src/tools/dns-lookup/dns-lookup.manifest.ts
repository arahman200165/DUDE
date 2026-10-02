import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'dns-lookup',
    title: 'DNS Lookup',
    description: 'Query live DNS records (incl. CAA, DNSSEC, TLSA, HTTPS/SVCB) over system, custom, DoH, or DoT resolvers, with flags and transport diagnostics.',
    category: 'developer',
    keywords: ['network', 'dns', 'lookup', 'dns record explorer', 'caa', 'caa inspector', 'doh', 'dns over https', 'dot', 'dns over tls', 'dnskey', 'tlsa', 'svcb', 'soa'],
    route: '/tools/dns-lookup',
    status: 'experimental',
    persistence: { input: 'none', preferences: 'none' },
    network: { required: true, detail: 'your system DNS servers, or a DNS, DoH, or DoT server you choose; CAA checks also query the parent names' },
    capabilities: [{ kind: 'platform', id: 'native-network', web: 'unavailable', note: 'runs live checks through the Windows desktop network bridge' }],
    io: { accepts: ['text'], produces: ['json'] }
};
