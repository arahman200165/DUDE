import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'random-data-generator',
    title: 'Random Data Generator',
    description: 'Generate realistic fake data — names, addresses, internet, finance, and more — as a table, CSV, or JSON.',
    category: 'developer',
    keywords: ['random', 'fake', 'faker', 'mock', 'data', 'generate', 'test data', 'sample data'],
    route: '/tools/random-data-generator',
    status: 'verified',
    verification: {
        propertyTested: true,
        summary: 'Fuzz-tested generated row dimensions and same-seed determinism across selected fields.',
    },
    persistence: { input: 'local', preferences: 'local' },
    io: { accepts: ['json'], produces: ['table', 'json', 'text'] }
};
