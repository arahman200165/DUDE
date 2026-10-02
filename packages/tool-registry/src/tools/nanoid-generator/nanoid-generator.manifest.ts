import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'nanoid-generator',
    title: 'NanoID Generator',
    description: 'Generates NanoIDs with a configurable count, length, and alphabet.',
    category: 'developer',
    keywords: ['nanoid', 'generate', 'identifier', 'random', 'alphabet'],
    route: '/tools/nanoid-generator',
    status: 'verified',
    verification: {
        propertyTested: true,
        summary: 'Generator-tested (fast-check): requested count/size and custom-alphabet membership across supported sizes.',
    },
    persistence: { input: 'session', preferences: 'local' },
    io: { accepts: ['json'], produces: ['text'] }
};
