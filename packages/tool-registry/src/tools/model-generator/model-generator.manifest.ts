import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'model-generator',
    title: 'Model Generator (JSON → Code)',
    description: 'Infers a type shape from sample JSON and generates a TypeScript, C#, Java, Kotlin, Swift, Python, Rust, Go, or SQL model.',
    category: 'developer',
    keywords: [
        'model',
        'codegen',
        'generate',
        'typescript',
        'c#',
        'java',
        'kotlin',
        'swift',
        'python',
        'dataclass',
        'rust',
        'go',
        'sql',
        'schema',
        'json to code',
    ],
    route: '/tools/model-generator',
    status: 'verified',
    verification: {
        propertyTested: true,
        summary: 'Property-tested (fast-check) for core output shape and invariants.',
    },
    persistence: { input: 'session', preferences: 'local' },
    io: { accepts: ['json'], produces: ['text'] }
};
