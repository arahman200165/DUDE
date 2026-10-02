import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'range-generator',
    title: 'Range Generator',
    description: 'Generates a numeric sequence from a start, end, and step, with zero-padding and newline/comma/JSON output.',
    category: 'developer',
    keywords: ['range', 'sequence', 'generator', 'numbers', 'series'],
    route: '/tools/range-generator',
    status: 'verified',
    verification: {
        propertyTested: true,
        summary: 'Generator-tested (fast-check): bounded ascending ranges contain the expected start, count, and step values.',
    },
    persistence: { input: 'session', preferences: 'local' },
    execution: { worker: 'none' },
    io: { accepts: ['text'], produces: ['text', 'json'] }
};
