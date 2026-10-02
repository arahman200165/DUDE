import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'css-grid-playground',
    title: 'CSS Grid Playground',
    description: 'Interactively builds grid container and item-placement CSS with a live preview of editable, addable items.',
    category: 'developer',
    keywords: ['css grid', 'grid-template-columns', 'grid-column', 'grid-row', 'css generator'],
    route: '/tools/css-grid-playground',
    status: 'verified',
    verification: {
        propertyTested: true,
        summary: 'Generator-tested (fast-check): generated item placements correspond to HTML items and emitted CSS rules.',
    },
    persistence: { input: 'session', preferences: 'none' },
    io: { accepts: ['text'], produces: ['text'] }
};
