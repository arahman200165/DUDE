import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'line-prefix-numbering',
    title: 'Line Prefix/Suffix & Numbering',
    shortTitle: 'Line Prefix/Numbering',
    description: 'Add a prefix/suffix, add or remove line numbers, or apply a transform to every line at once.',
    category: 'text',
    keywords: [
        'prefix',
        'suffix',
        'line numbers',
        'numbering',
        'per-line',
        'transform',
        'uppercase',
        'wrap',
        'quotes',
    ],
    route: '/tools/line-prefix-numbering',
    status: 'verified',
    verification: {
        propertyTested: true,
        summary: 'Round-trip-tested (fast-check): removeLineNumbers(addLineNumbers(text)) recovers the original lines for recognized separators, plus fuzzing that the per-line transforms never throw.',
    },
    persistence: { input: 'session', preferences: 'local' },
    io: { accepts: ['text'], produces: ['text'] }
};
