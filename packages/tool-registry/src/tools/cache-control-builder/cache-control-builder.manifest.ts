import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'cache-control-builder',
    title: 'Cache-Control Builder',
    description: 'Builds or parses a Cache-Control header from its directives, for either a request or a response, flagging contradictory combinations.',
    category: 'web',
    keywords: ['cache-control', 'header', 'caching', 'max-age', 'no-store', 'no-cache'],
    route: '/tools/cache-control-builder',
    status: 'verified',
    verification: {
        propertyTested: true,
        summary: 'Fuzz-tested (fast-check): parse/build/warning-check never throw on arbitrary input, with warnings bounded to the tool\'s three known checks.',
    },
    persistence: { input: 'session', preferences: 'local' },
    io: { accepts: ['text'], produces: ['text', 'json'] }
};
