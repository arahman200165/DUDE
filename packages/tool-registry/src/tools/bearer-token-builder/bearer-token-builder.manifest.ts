import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'bearer-token-builder',
    title: 'Bearer Token Builder',
    shortTitle: 'Bearer Token',
    description: 'Wraps a token into a properly formatted Bearer Authorization header, with format validation.',
    category: 'security',
    keywords: ['bearer token', 'authorization header', 'http auth', 'access token', 'rfc 6750'],
    route: '/tools/bearer-token-builder',
    status: 'verified',
    verification: {
        vectors: ['RFC 6750 Section 2.1 Authorization: Bearer mF_9.B5f-4.1JqM'],
        propertyTested: true,
        summary: 'Fuzz- and crosscheck-tested (fast-check) against an independently-written RFC 6750 §2.1 b64token grammar regex.',
    },
    consequenceClass: ['authentication'],
    persistence: { input: 'none', preferences: 'local' },
    io: { accepts: ['text'], produces: ['text'] }
};
