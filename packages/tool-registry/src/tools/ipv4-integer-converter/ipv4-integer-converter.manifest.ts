import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'ipv4-integer-converter',
    title: 'IPv4 ↔ Integer Converter',
    description: 'Converts an IPv4 address to its 32-bit unsigned integer form, or the reverse.',
    category: 'developer',
    keywords: ['ip', 'ipv4', 'integer', 'convert', 'network'],
    route: '/tools/ipv4-integer-converter',
    status: 'verified',
    verification: {
        propertyTested: true,
        summary: 'Round-trip tested every sampled unsigned 32-bit IPv4 integer with fixed-seed fast-check.',
    },
    persistence: { input: 'session', preferences: 'local' },
    io: { accepts: ['text'], produces: ['text'] }
};
