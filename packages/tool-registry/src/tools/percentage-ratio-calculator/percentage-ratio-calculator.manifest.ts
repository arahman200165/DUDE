import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'percentage-ratio-calculator',
    title: 'Percentage & Ratio Calculator',
    description: 'Percentage of, percent-of-what, percent change, ratio simplification, and proportion solving.',
    category: 'developer',
    keywords: ['percentage', 'percent', 'ratio', 'proportion', 'percent change', 'simplify ratio'],
    route: '/tools/percentage-ratio-calculator',
    status: 'verified',
    verification: {
        propertyTested: true,
        summary: 'Fuzz-tested finite percent operations and equivalent BigInt ratio reduction.',
    },
    persistence: { input: 'session', preferences: 'local' },
    execution: { worker: 'none' },
    io: { accepts: ['text'], produces: ['text'] }
};
