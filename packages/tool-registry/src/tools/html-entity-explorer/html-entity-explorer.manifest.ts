import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'html-entity-explorer',
    title: 'HTML Entity Explorer',
    description: 'Searchable reference of common named HTML character entities, with decimal and hex codepoints.',
    category: 'developer',
    keywords: [
        'html entities',
        'named entities',
        'character reference',
        'nbsp',
        'copy',
        'entity reference',
    ],
    route: '/tools/html-entity-explorer',
    status: 'verified',
    verification: {
        propertyTested: true,
        summary: 'DOM-backed properties verify every curated entity is searchable by name, character, decimal, and hexadecimal codepoint.',
    },
    persistence: { input: 'local', preferences: 'none' },
    io: { accepts: ['text'], produces: ['text'] }
};
