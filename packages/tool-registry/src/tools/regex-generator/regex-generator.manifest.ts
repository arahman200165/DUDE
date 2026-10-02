import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'regex-generator',
    title: 'Regex Generator',
    description: 'Generalizes a pattern from example strings (non-AI, heuristic), validated against every example and counter-example before being shown.',
    category: 'developer',
    keywords: ['regex', 'regexp', 'generate', 'generator', 'examples', 'heuristic', 'pattern'],
    route: '/tools/regex-generator',
    status: 'verified',
    verification: {
        propertyTested: true,
        summary: 'Generator property-tested deterministic valid patterns against sampled examples with fixed-seed fast-check.',
    },
    persistence: { input: 'session', preferences: 'none' },
    execution: { worker: 'none' },
    io: { accepts: ['text'], produces: ['text'] }
};
