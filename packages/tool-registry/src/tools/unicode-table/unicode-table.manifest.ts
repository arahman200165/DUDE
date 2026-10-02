import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'unicode-table',
    title: 'Unicode Table',
    description: 'Browse Unicode characters by block, or search by code point, character, or name.',
    category: 'text',
    keywords: [
        'unicode',
        'table',
        'block',
        'reference',
        'browse',
        'search',
        'codepoint',
        'character name',
    ],
    route: '/tools/unicode-table',
    status: 'verified',
    verification: {
        propertyTested: true,
        summary: 'Fuzz-tested (fast-check): browse/search never throw and stay within the requested block, verified across a curated set of blocks and page/query combinations.',
    },
    persistence: { input: 'session', preferences: 'local' },
    execution: { worker: 'required' },
    io: { accepts: ['text'], produces: ['table'] }
};
