import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'content-disposition-builder',
    title: 'Content-Disposition Builder',
    description: 'Builds a Content-Disposition header with an RFC 5987 filename* parameter for non-ASCII filenames, alongside the ASCII fallback.',
    category: 'web',
    keywords: ['content-disposition', 'header', 'attachment', 'inline', 'filename', 'rfc 5987'],
    route: '/tools/content-disposition-builder',
    status: 'verified',
    verification: {
        vectors: ['RFC 6266 Section 5 EURO rates filename* UTF-8 example (parsed filename)'],
        propertyTested: true,
        summary: 'Fuzz-tested (fast-check): parse/build never throw on arbitrary input, and the disposition type always survives a build-then-reparse round trip.',
    },
    persistence: { input: 'session', preferences: 'none' },
    io: { accepts: ['text'], produces: ['text', 'json'] }
};
