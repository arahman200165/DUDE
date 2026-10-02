import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'numeric-representation-inspector',
    title: 'Numeric Representation Inspector',
    description: "Inspects a value's byte-order (endianness), IEEE-754 float bit layout, or integer representation across bit widths.",
    category: 'developer',
    keywords: [
        'endianness',
        'little-endian',
        'big-endian',
        'ieee 754',
        'float',
        'double',
        'integer',
        'bit width',
        'binary',
    ],
    route: '/tools/numeric-representation-inspector',
    status: 'verified',
    verification: {
        propertyTested: true,
        summary: 'Property-tested (fast-check) for core output shape and invariants.',
    },
    persistence: { input: 'session', preferences: 'local' },
    execution: { worker: 'none' },
    io: { accepts: ['text'], produces: ['json', 'text'] }
};
