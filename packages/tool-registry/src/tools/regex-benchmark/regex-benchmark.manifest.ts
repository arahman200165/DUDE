import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'regex-benchmark',
    title: 'Regex Benchmark',
    description: 'Flags catastrophic-backtracking risk shapes in a pattern, and times it against sample inputs in a worker with a per-sample timeout.',
    category: 'developer',
    keywords: [
        'regex',
        'regexp',
        'benchmark',
        'redos',
        'catastrophic backtracking',
        'timing',
        'performance',
    ],
    route: '/tools/regex-benchmark',
    status: 'verified',
    verification: {
        propertyTested: true,
        summary: 'Fuzz-tested safe pattern timings and bounded-input error handling with fixed-seed fast-check.',
    },
    persistence: { input: 'session', preferences: 'local' },
    execution: { worker: 'required' },
    io: { accepts: ['text'], produces: ['json'] }
};
