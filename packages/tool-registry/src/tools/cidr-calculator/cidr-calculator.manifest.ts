import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'cidr-calculator',
    title: 'CIDR Calculator',
    description: 'Computes the network/broadcast address, usable host range, and host count for an IPv4 CIDR block.',
    category: 'developer',
    keywords: ['cidr', 'ip', 'ipv4', 'subnet', 'network', 'netmask'],
    route: '/tools/cidr-calculator',
    status: 'verified',
    verification: {
        vectors: ['RFC 4632 Section 3.1 172.16.0.0/16 prefix and mask example'],
        propertyTested: true,
        summary: 'RFC 4632 prefix/mask example checked against the calculated range; fuzz-tested IPv4 alignment and counts. IPv6 prefixes and route aggregation are outside this calculator.',
    },
    persistence: { input: 'session', preferences: 'none' },
    io: { accepts: ['text'], produces: ['text'] }
};
