import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'html-entities',
    title: 'HTML Entity Encoder / Decoder',
    description: 'Encode text as HTML entities, or decode named and numeric entities back to text.',
    category: 'encoding',
    keywords: ['html', 'entity', 'entities', 'encode', 'decode', 'escape', 'unescape', 'amp', 'nbsp'],
    route: '/tools/html-entities',
    status: 'verified',
    verification: {
        propertyTested: true,
        summary: 'Round-trip and fuzz-tested (fast-check) against arbitrary well-formed text, in both plain and numeric-non-ASCII encode modes.',
    },
    persistence: { input: 'session', preferences: 'local' },
    io: { accepts: ['text'], produces: ['text'] }
};
