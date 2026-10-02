import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'diff',
    title: 'Text Diff',
    description: 'Line-oriented diff between two blocks of text.',
    category: 'text',
    keywords: ['diff', 'compare', 'text', 'changes', 'delta'],
    route: '/tools/diff',
    pwaShortcut: { order: 5 },
    status: 'verified',
    verification: {
        propertyTested: true,
        summary: 'Fuzz-tested (fast-check) against computeLineDiff: never throws, summary counts always match the diff-line count, and identical text always diffs as all-equal.',
    },
    persistence: { input: 'session', preferences: 'local' },
    execution: { worker: 'required' },
    io: { accepts: ['text', 'file'], produces: ['json'] }
};
