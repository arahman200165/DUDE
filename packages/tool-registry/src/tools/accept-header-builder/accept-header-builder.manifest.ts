import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'accept-header-builder',
    title: 'Accept Header Builder',
    description: 'Builds or parses an Accept header, weighting media types with q values and showing the resulting preference order.',
    category: 'web',
    keywords: ['accept', 'header', 'media type', 'content negotiation', 'q value', 'mime'],
    route: '/tools/accept-header-builder',
    status: 'verified',
    verification: {
        propertyTested: true,
        summary: 'Fuzz-tested (fast-check): parse/build never throw on arbitrary input, and sortByPreference preserves length while sorting descending by q.',
    },
    persistence: { input: 'session', preferences: 'none' },
    io: { accepts: ['text'], produces: ['text', 'json'] }
};
