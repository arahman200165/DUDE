import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'matrix-calculator',
    title: 'Matrix Calculator',
    description: 'Adds, subtracts, multiplies, transposes, inverts, or finds the determinant of matrices entered as rows of numbers.',
    category: 'developer',
    keywords: ['matrix', 'determinant', 'inverse', 'transpose', 'linear algebra'],
    route: '/tools/matrix-calculator',
    status: 'verified',
    verification: {
        propertyTested: true,
        summary: 'Fuzz-tested (fast-check): adding a zero matrix preserves generated rectangular matrices.',
    },
    persistence: { input: 'session', preferences: 'local' },
    execution: { worker: 'optional' },
    io: { accepts: ['text', 'table'], produces: ['text', 'table'] }
};
