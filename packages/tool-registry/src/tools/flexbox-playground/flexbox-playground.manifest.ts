import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'flexbox-playground',
    title: 'Flexbox Playground',
    description: 'Interactively builds flex container and item CSS with a live preview of editable, addable items.',
    category: 'developer',
    keywords: ['flexbox', 'flex', 'css flexbox', 'justify-content', 'align-items', 'css generator'],
    route: '/tools/flexbox-playground',
    status: 'verified',
    verification: {
        propertyTested: true,
        summary: 'Generator-tested (fast-check): generated item settings produce matching HTML items and CSS rules.',
    },
    persistence: { input: 'session', preferences: 'none' },
    io: { accepts: ['text'], produces: ['text'] }
};
