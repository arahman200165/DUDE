import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'text-tokenizer-ngram',
    title: 'Text Tokenizer & N-Gram Generator',
    shortTitle: 'Tokenizer / N-Grams',
    description: 'Tokenizes text into words or sentences, or generates word- or character-level n-grams with counts.',
    category: 'text',
    keywords: ['tokenize', 'tokens', 'n-gram', 'ngram', 'word split', 'sentence split'],
    route: '/tools/text-tokenizer-ngram',
    status: 'verified',
    verification: {
        propertyTested: true,
        summary: 'Fuzz-tested (fast-check): tokenize segments verified to partition the input exactly, and generateNGrams counts verified to sum to the exact sliding-window count.',
    },
    persistence: { input: 'session', preferences: 'local' },
    io: { accepts: ['text'], produces: ['json'] }
};
