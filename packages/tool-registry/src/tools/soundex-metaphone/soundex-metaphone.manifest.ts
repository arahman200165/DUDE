import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'soundex-metaphone',
    title: 'Soundex / Metaphone',
    description: 'Computes the Soundex and Metaphone phonetic codes for one or more words.',
    category: 'text',
    keywords: ['soundex', 'metaphone', 'phonetic', 'sounds like', 'pronunciation'],
    route: '/tools/soundex-metaphone',
    status: 'verified',
    verification: {
        propertyTested: true,
        summary: 'Fuzz-tested (fast-check): neverThrows for arbitrary bulk input, plus the token-splitting/count invariant verified against the newline/comma tokenizer.',
    },
    persistence: { input: 'session' },
    io: { accepts: ['text'], produces: ['table'] }
};
