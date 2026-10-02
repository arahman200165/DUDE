import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'bigint-calculator',
    title: 'Arbitrary Precision Calculator',
    description: 'Exact-precision integer arithmetic (add/subtract/multiply/divide/mod/power/factorial) with no 64-bit limit.',
    category: 'developer',
    keywords: ['bigint', 'arbitrary precision', 'big number', 'factorial', 'power', 'calculator'],
    route: '/tools/bigint-calculator',
    status: 'verified',
    verification: {
        propertyTested: true,
        summary: 'Fuzz-tested (fast-check): arbitrary precision addition, subtraction, and multiplication identities over bounded BigInts.',
    },
    persistence: { input: 'session', preferences: 'local' },
    execution: { worker: 'none' },
    io: { accepts: ['text'], produces: ['text'] }
};
