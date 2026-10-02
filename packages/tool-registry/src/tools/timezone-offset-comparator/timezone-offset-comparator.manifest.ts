import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'timezone-offset-comparator',
    title: 'Timezone Offset Comparator',
    description: 'Compares UTC offsets across a full year, or pairwise, and shows when an asymmetric DST schedule changes the gap between two zones.',
    category: 'date-time',
    keywords: ['timezone', 'offset', 'compare', 'dst', 'utc offset', 'gap', 'ahead', 'behind'],
    route: '/tools/timezone-offset-comparator',
    status: 'verified',
    verification: {
        propertyTested: true,
        summary: 'Fuzz-tested (fast-check): neverThrows on arbitrary input, plus invariants that monthly offsets are well-formed and that swapping zones in the pairwise comparison negates the gap.',
    },
    persistence: { input: 'session', preferences: 'local' },
    io: { accepts: ['text'], produces: ['table', 'json'] }
};
