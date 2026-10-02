import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'ip-address-inspector',
    title: 'IP Address Inspector',
    description: 'Inspects an IPv4 or IPv6 address — canonical form, classification (private/loopback/multicast/etc.), and binary/expanded/integer view.',
    category: 'developer',
    keywords: ['ip', 'ipv4', 'ipv6', 'inspect', 'network', 'address'],
    route: '/tools/ip-address-inspector',
    status: 'verified',
    verification: {
        propertyTested: true,
        summary: 'Fuzz-tested arbitrary text and verified canonical IPv4/IPv6 forms preserve parsed addresses with fixed-seed fast-check.',
    },
    persistence: { input: 'session', preferences: 'none' },
    io: { accepts: ['text'], produces: ['text'] }
};
