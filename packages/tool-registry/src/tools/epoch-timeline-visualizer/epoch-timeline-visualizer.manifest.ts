import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'epoch-timeline-visualizer',
    title: 'Epoch Timeline Visualizer',
    description: 'Plots a list of labeled timestamps, or a start/end range, proportionally along a horizontal timeline relative to each other and to now.',
    category: 'date-time',
    keywords: ['timeline', 'epoch', 'visualize', 'timestamp', 'range', 'plot', 'now'],
    route: '/tools/epoch-timeline-visualizer',
    status: 'verified',
    verification: {
        propertyTested: true,
        summary: 'Fuzz-tested (fast-check): neverThrows on arbitrary input, plus invariants that the padded range always strictly contains a valid start/end or marker set.',
    },
    persistence: { input: 'session', preferences: 'local' },
    io: { accepts: ['text'], produces: ['json'] }
};
