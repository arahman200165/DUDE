import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'regex-visualizer',
    title: 'Regex Visualizer',
    description: 'Renders a regular expression as a railroad syntax diagram.',
    category: 'developer',
    keywords: ['regex', 'regexp', 'railroad diagram', 'visualize', 'syntax diagram', 'pattern'],
    route: '/tools/regex-visualizer',
    status: 'verified',
    verification: {
        propertyTested: true,
        summary: 'Fuzz-tested parse error handling and diagram creation for safe regex literals with fixed-seed fast-check.',
    },
    persistence: { input: 'session', preferences: 'none' },
    execution: { worker: 'none' },
    io: { accepts: ['text'], produces: ['text'] }
};
