import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'ipv6-explorer',
    title: 'IPv6 Explorer',
    description: "Shows an IPv6 address's compressed and expanded forms, its classification, and any embedded IPv4 address.",
    category: 'developer',
    keywords: ['ip', 'ipv6', 'explore', 'compress', 'expand', 'network'],
    route: '/tools/ipv6-explorer',
    status: 'verified',
    verification: {
        vectors: ['RFC 5952 Sections 4.1 and 4.2.1?4.2.3 canonicalization examples'],
        propertyTested: true,
        summary: 'RFC 5952 canonicalization examples checked literally; fuzz-tested generated 128-bit addresses for value-preserving forms. Embedded IPv4 tails are inspected, not formatted as dotted decimal.',
    },
    persistence: { input: 'session', preferences: 'none' },
    io: { accepts: ['text'], produces: ['text'] }
};
