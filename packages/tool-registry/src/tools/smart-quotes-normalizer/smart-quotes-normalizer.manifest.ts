import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'smart-quotes-normalizer',
    title: 'Smart Quotes Normalizer',
    description: 'Convert curly quotes, dashes, and ellipses to straight ASCII equivalents, or the reverse.',
    category: 'text',
    keywords: [
        'smart quotes',
        'curly quotes',
        'straight quotes',
        'typographic',
        'dash',
        'em dash',
        'en dash',
        'ellipsis',
    ],
    route: '/tools/smart-quotes-normalizer',
    status: 'verified',
    verification: {
        propertyTested: true,
        summary: 'Fuzz-tested (fast-check): neverThrows for arbitrary text/options, plus idempotence verified in both directions across the option space.',
    },
    persistence: { input: 'session', preferences: 'local' },
    io: { accepts: ['text'], produces: ['text'] }
};
