import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'string-similarity-calculator',
    title: 'String Similarity Calculator',
    shortTitle: 'String Similarity',
    description: 'Compares two strings with Levenshtein distance/similarity and Jaro-Winkler similarity.',
    category: 'text',
    keywords: [
        'similarity',
        'levenshtein',
        'jaro-winkler',
        'edit distance',
        'compare',
        'fuzzy match',
    ],
    route: '/tools/string-similarity-calculator',
    status: 'verified',
    verification: {
        propertyTested: true,
        summary: 'Fuzz-tested (fast-check): neverThrows plus [0,1] score bounds, self-comparison identity, and forward/backward symmetry verified for arbitrary string pairs.',
    },
    persistence: { input: 'session' },
    io: { accepts: ['text'], produces: ['json'] }
};
