import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'programmer-calculator',
    title: 'Programmer Calculator',
    description: 'Arithmetic and bitwise (AND/OR/XOR/NOT/shift) calculator with an interactive bit grid, two’s-complement, and 8/16/32/64-bit widths.',
    category: 'developer',
    keywords: [
        'programmer calculator',
        'bitwise',
        'and',
        'or',
        'xor',
        'shift',
        'two’s complement',
        'bit width',
        'hex',
        'binary',
    ],
    route: '/tools/programmer-calculator',
    status: 'verified',
    verification: {
        propertyTested: true,
        summary: 'Fuzz-tested width-bounded operand views, bit toggling, and supported operations.',
    },
    persistence: { input: 'session', preferences: 'local' },
    execution: { worker: 'none' },
    io: { accepts: ['text'], produces: ['text'] }
};
