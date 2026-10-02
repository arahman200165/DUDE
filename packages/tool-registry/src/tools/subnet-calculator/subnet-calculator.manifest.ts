import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'subnet-calculator',
    title: 'Subnet Calculator',
    description: 'Splits an IPv4 network into a chosen number of equal subnets, or into subnets of a given prefix length.',
    category: 'developer',
    keywords: ['subnet', 'cidr', 'ip', 'ipv4', 'network', 'vlsm'],
    route: '/tools/subnet-calculator',
    status: 'verified',
    verification: {
        propertyTested: true,
        summary: 'Fuzz-tested arbitrary inputs and verified generated child networks are aligned and contiguous with fixed-seed fast-check.',
    },
    persistence: { input: 'session', preferences: 'local' },
    io: { accepts: ['text'], produces: ['table'] }
};
