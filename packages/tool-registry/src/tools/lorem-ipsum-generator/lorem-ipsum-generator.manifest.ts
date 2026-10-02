import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'lorem-ipsum-generator',
    title: 'Lorem Ipsum & Placeholder Text Generator',
    shortTitle: 'Lorem Ipsum',
    description: 'Generates classic Lorem Ipsum or faker-based placeholder text, as words, sentences, or paragraphs.',
    category: 'text',
    keywords: ['lorem ipsum', 'placeholder', 'dummy text', 'filler', 'faker', 'generate'],
    route: '/tools/lorem-ipsum-generator',
    status: 'verified',
    verification: {
        propertyTested: true,
        summary: 'Generator-tested (fast-check): classic output shape/count verified per unit/format, and both classic and seeded-faker sources verified deterministic across the option space.',
    },
    persistence: { preferences: 'local' },
    io: { accepts: ['json'], produces: ['text'] }
};
