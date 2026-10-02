import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'mac-address-inspector',
    title: 'MAC Address Inspector',
    description: 'Normalizes a MAC address across colon/hyphen/Cisco-dotted/plain formats, decodes its unicast/multicast and administration bits, and looks up its OUI vendor.',
    category: 'developer',
    keywords: ['mac', 'address', 'oui', 'vendor', 'network', 'ethernet'],
    route: '/tools/mac-address-inspector',
    status: 'verified',
    verification: {
        propertyTested: true,
        summary: 'Fuzz-tested arbitrary text and checked normalization equivalence across four MAC address formats with fixed-seed fast-check.',
    },
    persistence: { input: 'session', preferences: 'none' },
    io: { accepts: ['text'], produces: ['text'] }
};
